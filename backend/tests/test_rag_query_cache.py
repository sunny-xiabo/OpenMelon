from __future__ import annotations

from collections import defaultdict
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers.query import router as query_router
from app.engine.rag.cache import answer_cache, bump_rag_cache_version, clear_rag_cache, retrieval_cache
from app.config import settings


class FakeIntentRouter:
    def __init__(self, intent: str = "vector_query", entities: dict | None = None):
        self.intent = intent
        self.entities = entities or {"resource": "order"}
        self.calls = 0

    async def process(self, question: str):
        self.calls += 1
        return {"intent": self.intent, "entities": self.entities}


class FakeRetriever:
    def __init__(self):
        self.calls = []

    async def retrieve(self, intent: str, entities: dict, question: str):
        self.calls.append((intent, question))
        return {
            "context_text": f"context::{intent}::{question}",
            "chunks": [
                {
                    "filename": "doc.md",
                    "doc_type": "doc",
                    "chunk_index": 1,
                    "content": f"chunk::{question}",
                }
            ],
        }


class FakeGenerator:
    def __init__(self):
        self.answer_calls = []

    async def generate_answer(self, question: str, context: str, intent: str, history_messages: list[dict]):
        self.answer_calls.append((question, context, intent, len(history_messages)))
        return {"answer": f"answer::{question}::{context}::{intent}::{len(history_messages)}"}

    def extract_citations(self, chunks, source_type: str):
        from app.api.schemas import Citation

        return [Citation(source_type=source_type, filename=chunk.get("filename")) for chunk in chunks]

    async def generate_visualization_summary(self, graph_data_raw):
        return "visual"


class FakeSessionManager:
    def __init__(self):
        self.histories = defaultdict(list)
        self.added = []

    def get_history(self, session_id: str):
        return list(self.histories.get(session_id, []))

    def add_message(self, session_id: str, role: str, content: str):
        self.added.append((session_id, role, content))
        self.histories[session_id].append({"role": role, "content": content})


class FakeMetricsCollector:
    def __init__(self):
        self.features = defaultdict(int)

    def record_query(self, **kwargs) -> None:
        pass

    def record_feature_usage(self, feature: str, count: int = 1) -> None:
        self.features[feature] += count


def _build_client() -> TestClient:
    app = FastAPI()
    app.include_router(query_router, prefix="/api")
    app.state.intent_router = FakeIntentRouter()
    app.state.retriever = FakeRetriever()
    app.state.generator = FakeGenerator()
    app.state.agentic_rag = None
    app.state.session_manager = FakeSessionManager()
    app.state.metrics_collector = FakeMetricsCollector()
    return TestClient(app, raise_server_exceptions=False)


def _reset_cache() -> None:
    clear_rag_cache("test_reset")
    retrieval_cache.clear()
    answer_cache.clear()


def test_retrieval_cache_hits_for_repeated_query(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(settings, "RAG_CACHE_ENABLED", True)
    monkeypatch.setattr(settings, "RAG_RETRIEVAL_CACHE_TTL_S", 300)
    monkeypatch.setattr(settings, "RAG_ANSWER_CACHE_TTL_S", 120)

    client = _build_client()
    payload = {"question": "  Create Order  ", "include_history": True}
    session_id = "session-1"
    client.app.state.session_manager.histories[session_id] = [{"role": "user", "content": "prev"}]

    first = client.post("/api/query?session_id=session-1", json=payload)
    second = client.post("/api/query?session_id=session-1", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(client.app.state.retriever.calls) == 1
    assert len(client.app.state.generator.answer_calls) == 2
    assert client.app.state.metrics_collector.features["rag_retrieval_cache_hit"] >= 1


def test_answer_cache_hits_when_history_is_disabled(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(settings, "RAG_CACHE_ENABLED", True)
    monkeypatch.setattr(settings, "CHAT_MODEL", "qwen-plus")
    monkeypatch.setattr(settings, "GENERATION_TEMPERATURE", 0.3)
    monkeypatch.setattr(settings, "GENERATION_MAX_TOKENS", 2000)

    client = _build_client()
    payload = {"question": "List orders", "include_history": False}

    first = client.post("/api/query", json=payload)
    second = client.post("/api/query", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(client.app.state.retriever.calls) == 1
    assert len(client.app.state.generator.answer_calls) == 1
    assert client.app.state.metrics_collector.features["rag_answer_cache_hit"] >= 1


def test_answer_cache_is_not_reused_when_history_exists(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(settings, "RAG_CACHE_ENABLED", True)

    client = _build_client()
    client.app.state.session_manager.histories["session-2"] = [{"role": "user", "content": "first"}]
    payload = {"question": "List orders", "include_history": True}

    first = client.post("/api/query?session_id=session-2", json=payload)
    client.app.state.session_manager.histories["session-2"].append({"role": "assistant", "content": "previous answer"})
    second = client.post("/api/query?session_id=session-2", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(client.app.state.generator.answer_calls) == 2


def test_cache_key_changes_with_generation_config(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(settings, "RAG_CACHE_ENABLED", True)
    monkeypatch.setattr(settings, "CHAT_MODEL", "model-a")

    client = _build_client()
    payload = {"question": "List orders", "include_history": False}

    first = client.post("/api/query", json=payload)
    monkeypatch.setattr(settings, "CHAT_MODEL", "model-b")
    second = client.post("/api/query", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(client.app.state.generator.answer_calls) == 2


def test_cache_version_bump_invalidates_entries(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(settings, "RAG_CACHE_ENABLED", True)

    client = _build_client()
    payload = {"question": "List orders", "include_history": False}

    first = client.post("/api/query", json=payload)
    bump_rag_cache_version("test_bump")
    second = client.post("/api/query", json=payload)

    assert first.status_code == 200
    assert second.status_code == 200
    assert len(client.app.state.generator.answer_calls) == 2


def test_cache_status_and_clear_endpoint(monkeypatch):
    _reset_cache()
    monkeypatch.setattr(settings, "RAG_CACHE_ENABLED", True)

    client = _build_client()
    payload = {"question": "List orders", "include_history": False}
    client.post("/api/query", json=payload)

    status = client.get("/api/query/cache/status")
    assert status.status_code == 200
    assert status.json()["enabled"] is True
    assert status.json()["retrieval"]["size"] >= 1

    cleared = client.delete("/api/query/cache")
    assert cleared.status_code == 200
    assert cleared.json()["success"] is True
    assert cleared.json()["status"]["retrieval"]["size"] == 0
