from fastapi.testclient import TestClient
from fastapi import FastAPI, Depends
from app.api.routers.graph import router
from app.api.errors import setup_exception_handlers
from app.api import deps


class _FakeGraphOps:
    """Stub that satisfies the get_graph_ops dependency without Neo4j."""

    async def get_shortest_path(self, source_id, target_id, max_depth=5):
        from app.models.entities import GraphData
        return GraphData()


def _client():
    app = FastAPI()
    setup_exception_handlers(app)
    # Provide a real dependency override so validation errors surface
    app.dependency_overrides[deps.get_graph_ops] = lambda: _FakeGraphOps()
    app.include_router(router, prefix="/api")
    return TestClient(app)


def test_path_endpoint_returns_422_without_params():
    """Endpoint requires source and target query params."""
    client = _client()
    resp = client.get("/api/graph/path")
    assert resp.status_code == 422


def test_path_endpoint_returns_422_missing_target():
    """Endpoint requires both source and target."""
    client = _client()
    resp = client.get("/api/graph/path", params={"source": "abc"})
    assert resp.status_code == 422


def test_path_endpoint_returns_422_missing_source():
    """Endpoint requires both source and target."""
    client = _client()
    resp = client.get("/api/graph/path", params={"target": "xyz"})
    assert resp.status_code == 422


def test_path_endpoint_returns_400_when_graph_ops_unavailable():
    """When Neo4j is not running the dependency raises 400."""
    app = FastAPI()
    setup_exception_handlers(app)
    app.include_router(router, prefix="/api")
    # No dependency override -- graph_ops is None on app.state
    with TestClient(app) as client:
        resp = client.get("/api/graph/path", params={"source": "a", "target": "b"})
        assert resp.status_code == 400
