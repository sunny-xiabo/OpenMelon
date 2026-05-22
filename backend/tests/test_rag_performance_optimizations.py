from __future__ import annotations

import asyncio
import time
from types import SimpleNamespace

from app.config import settings
from app.engine.retrieval.multi_channel import MultiChannelRetriever
from app.storage.graph_ops import GraphOperations
from app.storage.vector_ops import VectorOperations


class FakeRecord(dict):
    pass


class FakeResult:
    def __init__(self, record=None):
        self._record = record

    async def single(self):
        return self._record

    def __aiter__(self):
        async def _gen():
            if self._record is not None:
                yield self._record

        return _gen()


class FakeSession:
    def __init__(self, runner):
        self.runner = runner

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, tb):
        return False

    async def run(self, query, **params):
        return await self.runner(query, params)


class FakeDriver:
    def __init__(self, runner):
        self.runner = runner
        self.queries = []

    def session(self, **_kwargs):
        return FakeSession(self._run)

    async def _run(self, query, params):
        self.queries.append((query, params))
        if "RETURN count" in query or "RETURN created" in query:
            created = len(params.get("relationships") or params.get("vectors") or params.get("items") or [])
            if "created_ids" in query:
                ids = [item.get("vector_id") for item in params.get("vectors", [])]
                return FakeResult(FakeRecord(created=created, created_ids=ids))
            return FakeResult(FakeRecord(created=created, written=created))
        if "MATCH (tc:TestCaseVector {vector_id:" in query:
            return FakeResult(None)
        return FakeResult(FakeRecord(ok=1))


class FakeQdrantClient:
    def __init__(self):
        self.created = []

    async def get_collections(self):
        return SimpleNamespace(collections=[])

    async def create_collection(self, **kwargs):
        self.created.append(kwargs)

    async def delete_collection(self, **_kwargs):
        return None

    async def upsert(self, **_kwargs):
        return None


class SlowGraphOps:
    def __init__(self, delay=0.15):
        self.delay = delay

    async def get_entity_subgraph(self, *_args, **_kwargs):
        await asyncio.sleep(self.delay)
        return SimpleNamespace(nodes=[], relationships=[])


class SlowVectorOps:
    def __init__(self, delay=0.15):
        self.delay = delay

    async def similarity_search(self, *_args, **_kwargs):
        await asyncio.sleep(self.delay)
        return [{"doc_type": "doc", "filename": "a.md", "chunk_index": 1, "content": "x"}]

    async def search_similar_test_cases(self, *_args, **_kwargs):
        await asyncio.sleep(self.delay)
        return [{"name": "tc-a", "priority": "high", "description": "demo"}]


class FakeEmbeddingClient:
    class _Embeddings:
        async def create(self, **_kwargs):
            return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 1024)])

    embeddings = _Embeddings()


def test_hybrid_retrieval_runs_graph_and_vector_in_parallel(monkeypatch):
    retriever = MultiChannelRetriever(SlowGraphOps(), SlowVectorOps(), FakeEmbeddingClient())
    monkeypatch.setattr(settings, "USE_RERANKER", False)
    monkeypatch.setattr(settings, "RAG_RETRIEVAL_CHANNEL_TIMEOUT_S", 1.0)

    async def _run():
        start = time.perf_counter()
        result = await retriever.hybrid_retrieve(["order"], "查询订单")
        elapsed = time.perf_counter() - start
        return result, elapsed

    result, elapsed = asyncio.run(_run())

    assert result["graph_results"]["context_text"]
    assert result["vector_results"]["context_text"]
    assert elapsed < 0.3


def test_vector_retrieval_runs_doc_and_testcase_search_in_parallel(monkeypatch):
    retriever = MultiChannelRetriever(SlowGraphOps(), SlowVectorOps(), FakeEmbeddingClient())
    monkeypatch.setattr(settings, "USE_RERANKER", False)
    monkeypatch.setattr(settings, "RAG_RETRIEVAL_CHANNEL_TIMEOUT_S", 1.0)

    async def _run():
        start = time.perf_counter()
        result = await retriever.vector_retrieve("查询订单")
        elapsed = time.perf_counter() - start
        return result, elapsed

    result, elapsed = asyncio.run(_run())

    assert result["chunks"]
    assert result["test_cases"]
    assert elapsed < 0.3


def test_batch_create_relationships_uses_batched_query(monkeypatch):
    driver = FakeDriver(None)
    graph_ops = GraphOperations(driver)
    monkeypatch.setattr(settings, "NEO4J_WRITE_BATCH_SIZE", 2)

    relationships = [
        ("A", "Entity", "B", "Entity", "RELATED_TO", {}),
        ("B", "Entity", "C", "Entity", "RELATED_TO", {}),
        ("C", "Entity", "D", "Entity", "RELATED_TO", {}),
    ]

    created = asyncio.run(graph_ops.batch_create_relationships(relationships))

    assert created == 3
    assert len(driver.queries) == 2
    assert "apoc.merge.relationship" in driver.queries[0][0]


def test_batch_create_test_case_vectors_uses_single_graph_write(monkeypatch):
    driver = FakeDriver(None)
    vector_ops = VectorOperations(driver)
    monkeypatch.setattr(settings, "USE_EXTERNAL_VECTOR", False)

    test_cases = [
        {"id": "tc-1", "title": "Case 1", "description": "demo", "steps": [{"description": "step"}]},
        {"id": "tc-2", "title": "Case 2", "description": "demo", "steps": [{"description": "step"}]},
    ]
    embeddings = [[0.1] * 1024, [0.2] * 1024]

    result = asyncio.run(vector_ops.batch_create_test_case_vectors(test_cases, embeddings, module="demo"))

    assert result["created"] == 2
    assert result["skipped"] == 0
    assert len(driver.queries) == 1
    assert "UNWIND $vectors AS item" in driver.queries[0][0]


def test_qdrant_collection_creation_enables_quantization(monkeypatch):
    vector_ops = VectorOperations(None)
    fake_qdrant = FakeQdrantClient()
    vector_ops._qdrant_client = fake_qdrant
    monkeypatch.setattr(settings, "QDRANT_ENABLE_QUANTIZATION", True)
    monkeypatch.setattr(settings, "QDRANT_QUANTIZATION_TYPE", "scalar_int8")

    created = asyncio.run(vector_ops.ensure_qdrant_collection("doc_chunks"))

    assert created is True
    assert fake_qdrant.created[0]["collection_name"] == "doc_chunks"
    assert fake_qdrant.created[0]["quantization_config"] is not None
