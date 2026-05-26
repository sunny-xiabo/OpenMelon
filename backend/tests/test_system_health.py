import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers import system


def test_overall_health_status_reports_down_for_runtime_storage_failure():
    components = {
        "api": {"status": "ok"},
        "postgres": {"status": "down"},
        "neo4j": {"status": "ok"},
    }

    assert system._overall_health_status(components) == "down"


def test_overall_health_status_reports_degraded_for_optional_failures():
    components = {
        "api": {"status": "ok"},
        "postgres": {"status": "ok"},
        "neo4j": {"status": "degraded"},
        "qdrant": {"status": "disabled"},
    }

    assert system._overall_health_status(components) == "degraded"


def test_system_health_endpoint_returns_component_statuses(monkeypatch):
    app = FastAPI()
    app.include_router(system.router)

    monkeypatch.setattr(
        system,
        "_check_llm_config_health",
        lambda: {"status": "ok", "message": "llm ok"},
    )

    async def fake_neo4j_health(_request):
        return {"status": "degraded", "message": "neo4j unavailable"}

    async def fake_qdrant_health(_request):
        return {"status": "disabled", "message": "qdrant disabled"}

    async def fake_postgres_health():
        return {"status": "ok", "message": "postgres ok"}

    async def fake_reranker_health():
        return {"status": "not_loaded", "message": "reranker not loaded"}

    monkeypatch.setattr(system, "_check_neo4j_health", fake_neo4j_health)
    monkeypatch.setattr(system, "_check_qdrant_health", fake_qdrant_health)
    monkeypatch.setattr(system, "_check_postgres_health", fake_postgres_health)
    monkeypatch.setattr(system, "_check_reranker_health", fake_reranker_health)

    response = TestClient(app).get("/system/health")

    assert response.status_code == 200
    data = response.json()
    assert data["status"] == "degraded"
    assert data["version"]
    assert data["components"]["api"]["status"] == "ok"
    assert data["components"]["postgres"]["status"] == "ok"
    assert data["components"]["neo4j"]["status"] == "degraded"
    assert data["components"]["qdrant"]["status"] == "disabled"
    assert data["components"]["reranker"]["status"] == "not_loaded"
    assert "sqlite" not in data["components"]
    assert "runtime" in data


def test_postgres_health_uses_database_url(monkeypatch):
    monkeypatch.setattr(system.settings, "DATABASE_URL", "postgresql://openmelon:secret@pg-host:15432/openmelon")

    host, port, database, user = system._postgres_target()

    assert host == "pg-host"
    assert port == 15432
    assert database == "openmelon"
    assert user == "openmelon"


def test_postgres_health_reports_ok_when_port_is_open(monkeypatch):
    monkeypatch.setattr(system.settings, "DATABASE_URL", "postgresql://openmelon:secret@pg-host:15432/openmelon")

    class DummyWriter:
        def close(self):
            return None

        async def wait_closed(self):
            return None

    async def fake_open_connection(host, port):
        assert host == "pg-host"
        assert port == 15432
        return object(), DummyWriter()

    monkeypatch.setattr(asyncio, "open_connection", fake_open_connection)

    data = asyncio.run(system._check_postgres_health())

    assert data["status"] == "ok"
    assert data["runtime_store"] is True
