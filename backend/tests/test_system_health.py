import asyncio

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api.routers import system


def test_overall_health_status_prioritizes_core_sqlite_down(monkeypatch):
    monkeypatch.setattr(system.settings, "STORAGE_BACKEND", "sqlite")
    components = {
        "api": {"status": "ok"},
        "sqlite": {"status": "down"},
        "neo4j": {"status": "ok"},
    }

    assert system._overall_health_status(components) == "down"


def test_overall_health_status_ignores_legacy_sqlite_down_in_postgres_mode(monkeypatch):
    monkeypatch.setattr(system.settings, "STORAGE_BACKEND", "postgres")
    components = {
        "api": {"status": "ok"},
        "sqlite": {"status": "down"},
        "postgres": {"status": "ok"},
    }

    assert system._overall_health_status(components) == "ok"


def test_overall_health_status_reports_degraded_for_optional_failures(monkeypatch):
    monkeypatch.setattr(system.settings, "STORAGE_BACKEND", "sqlite")
    components = {
        "api": {"status": "ok"},
        "sqlite": {"status": "ok"},
        "neo4j": {"status": "degraded"},
        "qdrant": {"status": "disabled"},
    }

    assert system._overall_health_status(components) == "degraded"


def test_system_health_endpoint_returns_component_statuses(monkeypatch):
    app = FastAPI()
    app.include_router(system.router)

    monkeypatch.setattr(
        system,
        "_check_sqlite_health",
        lambda: {"status": "ok", "message": "sqlite ok"},
    )
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
        return {"status": "disabled", "message": "postgres disabled"}

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
    assert data["components"]["sqlite"]["status"] == "ok"
    assert data["components"]["neo4j"]["status"] == "degraded"
    assert data["components"]["qdrant"]["status"] == "disabled"
    assert data["components"]["postgres"]["status"] == "disabled"
    assert data["components"]["reranker"]["status"] == "not_loaded"
    assert "runtime" in data


def test_postgres_health_disabled_by_default(monkeypatch):
    monkeypatch.setattr(system.settings, "POSTGRES_HEALTHCHECK_ENABLED", False)
    monkeypatch.setattr(system.settings, "DATABASE_URL", "")
    monkeypatch.setattr(system.settings, "POSTGRES_HOST", "localhost")
    monkeypatch.setattr(system.settings, "POSTGRES_PORT", 5432)

    data = asyncio.run(system._check_postgres_health())

    assert data["status"] == "disabled"
    assert data["migration_target"] is True


def test_postgres_health_uses_database_url(monkeypatch):
    monkeypatch.setattr(system.settings, "DATABASE_URL", "postgresql://openmelon:secret@pg-host:15432/openmelon")

    host, port, database, user = system._postgres_target()

    assert host == "pg-host"
    assert port == 15432
    assert database == "openmelon"
    assert user == "openmelon"


def test_sqlite_health_is_legacy_in_postgres_mode(monkeypatch, tmp_path):
    monkeypatch.setattr(system.settings, "STORAGE_BACKEND", "postgres")
    monkeypatch.setattr(system, "DB_DIR", tmp_path)
    monkeypatch.setattr(system, "DB_PATH", tmp_path / "openmelon.db")
    (tmp_path / "openmelon.db.pg-cutover-backup").write_text("backup", encoding="utf-8")

    data = system._check_sqlite_health()

    assert data["status"] == "legacy"
    assert data["runtime_store"] == "postgres"
    assert data["backup_exists"] is True
