from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers import graph


class FakeGraphOps:
    async def get_doc_types_and_modules(self):
        return {"doc_types": ["prd"], "modules": ["order"]}

    async def get_graph_status(self):
        return {"has_data": True, "node_count": 2}


class BrokenGraphOps:
    async def get_doc_types_and_modules(self):
        raise RuntimeError("neo4j unavailable")

    async def get_graph_status(self):
        raise RuntimeError("neo4j unavailable")


def _client(graph_ops=None):
    app = FastAPI()
    app.state.graph_ops = graph_ops
    app.include_router(graph.router)
    return TestClient(app)


def test_graph_filters_returns_empty_when_graph_ops_missing():
    response = _client(None).get("/graph/filters")

    assert response.status_code == 200
    assert response.json()["doc_types"] == []
    assert response.json()["modules"] == []
    assert response.json()["graph_available"] is False


def test_graph_filters_returns_empty_when_graph_query_fails(monkeypatch):
    monkeypatch.setattr(graph, "_log_graph_event", lambda *args, **kwargs: None)

    response = _client(BrokenGraphOps()).get("/graph/filters")

    assert response.status_code == 200
    assert response.json()["doc_types"] == []
    assert response.json()["modules"] == []
    assert response.json()["graph_available"] is False


def test_graph_filters_returns_available_filters():
    response = _client(FakeGraphOps()).get("/graph/filters")

    assert response.status_code == 200
    assert response.json()["doc_types"] == ["prd"]
    assert response.json()["modules"] == ["order"]
    assert response.json()["graph_available"] is True


def test_graph_status_degrades_when_graph_ops_missing():
    response = _client(None).get("/graph/status")

    assert response.status_code == 200
    assert response.json()["has_data"] is False
    assert response.json()["node_count"] == 0
    assert response.json()["graph_available"] is False
