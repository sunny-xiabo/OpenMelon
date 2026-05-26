from __future__ import annotations

import argparse
import asyncio
import json
import statistics
import time
import sys
from pathlib import Path
from types import SimpleNamespace

if __package__ is None or __package__ == "":
    sys.path.insert(0, str(Path(__file__).resolve().parents[1]))

from app.config import settings
from app.engine.retrieval.multi_channel import MultiChannelRetriever
from app.storage.graph_ops import GraphOperations
from app.storage.vector_ops import VectorOperations


class _FakeRecord:
    def __init__(self, data):
        self._data = data

    def __getitem__(self, key):
        return self._data[key]

    def get(self, key, default=None):
        return self._data.get(key, default)


class _FakeResult:
    def __init__(self, record=None):
        self._record = record

    async def single(self):
        return self._record

    def __aiter__(self):
        async def _gen():
            if self._record is not None:
                yield self._record

        return _gen()


class _FakeSession:
    def __init__(self, delay: float, counter: dict[str, int]):
        self.delay = delay
        self.counter = counter

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def run(self, query, **params):
        self.counter["runs"] = self.counter.get("runs", 0) + 1
        await asyncio.sleep(self.delay)
        if "RETURN count" in query or "RETURN created" in query:
            created = len(params.get("relationships") or params.get("vectors") or params.get("items") or [])
            if "created_ids" in query:
                ids = [item.get("vector_id") for item in params.get("vectors", []) if item.get("vector_id")]
                return _FakeResult(_FakeRecord({"created": created, "created_ids": ids}))
            return _FakeResult(_FakeRecord({"created": created, "written": created}))
        if "MATCH (tc:TestCaseVector {vector_id:" in query and "RETURN tc.test_case_name AS name" in query:
            return _FakeResult(None)
        if "RETURN 1 AS ok" in query:
            return _FakeResult(_FakeRecord({"ok": 1}))
        return _FakeResult(_FakeRecord({"r": 1}))


class _FakeDriver:
    def __init__(self, delay: float = 0.02):
        self.delay = delay
        self.counter = {}

    def session(self, **_kwargs):
        return _FakeSession(self.delay, self.counter)


class _FakeQdrantClient:
    def __init__(self):
        self.points = []
        self.collections = set()

    async def get_collections(self):
        return SimpleNamespace(
            collections=[SimpleNamespace(name=name) for name in sorted(self.collections)]
        )

    async def delete_collection(self, collection_name: str):
        self.collections.discard(collection_name)

    async def create_collection(self, collection_name: str, **kwargs):
        self.collections.add(collection_name)
        self.last_create_kwargs = kwargs

    async def upsert(self, collection_name: str, points):
        await asyncio.sleep(0.01)
        self.points.extend((collection_name, len(points)))

    async def query_points(self, **kwargs):
        return SimpleNamespace(points=[])


class _FakeEmbeddingClient:
    class _Embeddings:
        async def create(self, **_kwargs):
            return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 1024)])

    embeddings = _Embeddings()


class _SlowGraphOps:
    def __init__(self, delay: float = 0.15):
        self.delay = delay

    async def get_entity_subgraph(self, *_args, **_kwargs):
        await asyncio.sleep(self.delay)
        return SimpleNamespace(nodes=[], relationships=[])

    async def get_full_graph(self, *_args, **_kwargs):
        await asyncio.sleep(self.delay)
        return SimpleNamespace(nodes=[], relationships=[])


class _SlowVectorOps:
    def __init__(self, delay: float = 0.15):
        self.delay = delay

    async def similarity_search(self, *_args, **_kwargs):
        await asyncio.sleep(self.delay)
        return [{"doc_type": "doc", "filename": "a.md", "chunk_index": 1, "content": "x"}]

    async def search_similar_test_cases(self, *_args, **_kwargs):
        await asyncio.sleep(self.delay)
        return [{"name": "tc", "priority": "medium", "description": "demo"}]


async def benchmark_graph_writes() -> dict[str, float]:
    driver = _FakeDriver()
    graph_ops = GraphOperations(driver)
    relationships = [
        ("A", "Entity", "B", "Entity", "RELATED_TO", {}),
        ("B", "Entity", "C", "Entity", "RELATED_TO", {}),
        ("C", "Entity", "D", "Entity", "RELATED_TO", {}),
        ("D", "Entity", "E", "Entity", "RELATED_TO", {}),
    ]

    start = time.perf_counter()
    for rel in relationships:
        await graph_ops.create_relationship(
            from_name=rel[0],
            from_label=rel[1],
            to_name=rel[2],
            to_label=rel[3],
            rel_type=rel[4],
            properties=rel[5],
        )
    serial = time.perf_counter() - start

    start = time.perf_counter()
    await graph_ops.batch_create_relationships(relationships)
    batch = time.perf_counter() - start

    return {"serial_s": serial, "batch_s": batch, "speedup": serial / batch if batch else 0.0}


async def benchmark_test_case_writes() -> dict[str, float]:
    driver = _FakeDriver()
    vector_ops = VectorOperations(driver)
    vector_ops._qdrant_client = _FakeQdrantClient()
    previous_use_external = settings.USE_EXTERNAL_VECTOR
    previous_provider = settings.VECTOR_PROVIDER
    settings.USE_EXTERNAL_VECTOR = True
    settings.VECTOR_PROVIDER = "qdrant"
    try:
        test_cases = [
            {"id": f"tc-{i}", "title": f"Case {i}", "description": "demo", "steps": [{"description": "step"}]}
            for i in range(8)
        ]
        embeddings = [[0.1] * 1024 for _ in test_cases]

        start = time.perf_counter()
        for tc, emb in zip(test_cases, embeddings):
            await vector_ops.create_test_case_vector(
                test_case_id=tc["id"],
                test_case_name=tc["title"],
                description=tc["description"],
                steps="step",
                embedding=emb,
                module="demo",
                priority="medium",
            )
        serial = time.perf_counter() - start

        start = time.perf_counter()
        await vector_ops.batch_create_test_case_vectors(test_cases, embeddings, module="demo")
        batch = time.perf_counter() - start
    finally:
        settings.USE_EXTERNAL_VECTOR = previous_use_external
        settings.VECTOR_PROVIDER = previous_provider

    return {"serial_s": serial, "batch_s": batch, "speedup": serial / batch if batch else 0.0}


async def benchmark_hybrid_retrieval() -> dict[str, float]:
    retriever = MultiChannelRetriever(_SlowGraphOps(), _SlowVectorOps(), _FakeEmbeddingClient())
    previous_use_reranker = settings.USE_RERANKER
    settings.USE_RERANKER = False
    try:
        start = time.perf_counter()
        await retriever.graph_retrieve(["entity-a"])
        await retriever.vector_retrieve("demo question")
        serial = time.perf_counter() - start

        start = time.perf_counter()
        await retriever.hybrid_retrieve(["entity-a"], "demo question")
        batch = time.perf_counter() - start
    finally:
        settings.USE_RERANKER = previous_use_reranker

    return {"serial_s": serial, "batch_s": batch, "speedup": serial / batch if batch else 0.0}


def _summary(values: list[float]) -> dict[str, float]:
    values = sorted(values)
    if not values:
        return {"p50_ms": 0.0, "p95_ms": 0.0, "avg_ms": 0.0}
    p50 = statistics.median(values)
    p95 = values[min(len(values) - 1, max(int(len(values) * 0.95) - 1, 0))]
    return {
        "p50_ms": round(p50 * 1000, 2),
        "p95_ms": round(p95 * 1000, 2),
        "avg_ms": round(statistics.mean(values) * 1000, 2),
    }


async def main() -> int:
    parser = argparse.ArgumentParser(description="OpenMelon performance baseline")
    parser.add_argument("--soft-threshold", action="store_true", help="Only warn on slowdowns")
    args = parser.parse_args()

    results = {
        "neo4j_relationships": await benchmark_graph_writes(),
        "test_case_vectors": await benchmark_test_case_writes(),
        "rag_hybrid": await benchmark_hybrid_retrieval(),
    }
    print(json.dumps(results, ensure_ascii=False, indent=2))

    if args.soft_threshold:
        for name, metric in results.items():
            if metric["speedup"] < 1.1:
                print(f"[warn] {name} speedup only {metric['speedup']:.2f}x")

    return 0


if __name__ == "__main__":
    raise SystemExit(asyncio.run(main()))
