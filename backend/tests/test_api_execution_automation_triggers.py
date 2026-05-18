import asyncio

from app.api_execution import routers
from app.api_execution.storage import APIExecutionStore


def test_spec_sync_regenerates_dsl_when_spec_changed(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_spec(
        {
            "spec_id": "spec-1",
            "content_hash": "hash-1",
            "parsed_at": "2026-04-29T00:00:01Z",
            "info": {"title": "Demo"},
            "servers": [{"url": "http://example.test"}],
            "operation_count": 1,
            "operations": [
                {
                    "id": "GET /health",
                    "method": "GET",
                    "path": "/health",
                    "operation_id": "health",
                    "summary": "Health",
                    "responses": {"200": {}},
                }
            ],
        }
    )
    store.save_project(
        {
            "project_id": "project-1",
            "name": "Demo",
            "enabled": True,
            "allow_ai_generate_dsl": True,
            "spec_id": "spec-1",
            "last_spec_content_hash": "",
        }
    )

    response = asyncio.run(routers.trigger_spec_sync())

    assert response["items"][0]["status"] == "updated"
    project = store.get_project("project-1")
    assert project["last_spec_content_hash"] == "hash-1"
    assert project["auto_generated_dsl"]["steps"][0]["path"] == "/health"


def test_scheduled_trigger_enqueues_allowlisted_project(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-04-29T00:00:01Z",
            "info": {"title": "Demo"},
            "servers": [{"url": "http://example.test"}],
            "operation_count": 1,
            "operations": [
                {
                    "id": "GET /health",
                    "method": "GET",
                    "path": "/health",
                    "operation_id": "health",
                    "summary": "Health",
                    "responses": {"200": {}},
                }
            ],
        }
    )
    store.save_project(
        {
            "project_id": "project-1",
            "name": "Demo",
            "enabled": True,
            "allow_ai_execution": True,
            "allow_scheduled_execution": True,
            "default_environment_id": "env-1",
            "spec_id": "spec-1",
            "operation_allowlist": ["GET /health"],
        }
    )
    store.save_environment(
        {
            "environment_id": "env-1",
            "project_id": "project-1",
            "name": "测试",
            "environment_type": "test",
            "base_url": "http://example.test",
            "headers": {},
            "variables": {},
            "timeout_ms": 30000,
            "continue_on_failure": True,
            "enabled": True,
        }
    )

    async def fake_enqueue_run(request, execution_options, policy_decision):
        assert request.script.steps[0].path == "/health"
        assert execution_options["project_id"] == "project-1"
        assert policy_decision["allowed"] is True
        return {"run_id": "run-1", "status": "queued"}

    monkeypatch.setattr(routers, "enqueue_run", fake_enqueue_run)

    response = asyncio.run(routers.trigger_scheduled_runs())

    assert response["items"][0]["status"] == "queued"
    assert response["items"][0]["run_id"] == "run-1"
    assert store.get_project("project-1")["last_scheduled_run_at"]


def test_scheduled_trigger_blocks_when_project_policy_disabled(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_project(
        {
            "project_id": "project-1",
            "name": "Demo",
            "enabled": True,
            "allow_ai_execution": False,
            "allow_scheduled_execution": True,
        }
    )

    response = asyncio.run(routers.trigger_scheduled_runs())

    assert response["items"][0]["status"] == "blocked"
    assert "AI 自动执行" in response["items"][0]["reason"]


def test_storage_migration_readiness_reports_jsonb_and_retention_plan(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_project(
        {
            "project_id": "project-1",
            "name": "Demo",
            "enabled": True,
            "auth_config": {"type": "bearer", "token_variable": "token"},
        }
    )
    store.save_run(
        {
            "run_id": "run-1",
            "status": "failed",
            "case_id": "case-1",
            "case_name": "失败样例",
            "run_at": "2026-05-18T10:00:00Z",
            "execution_options": {"project_id": "project-1"},
            "script": {"steps": []},
            "results": [],
        }
    )

    response = asyncio.run(routers.get_storage_migration_readiness())

    assert response["storage_engine"] == "sqlite"
    assert response["pg_readiness"] == "ready_with_jsonb_mapping"
    assert any(item["table"] == "runs" and item["row_count"] == 1 for item in response["table_profiles"])
    assert any("JSONB" in step for step in response["recommended_steps"])
    assert response["retention_plan"]["run_count"] == 1
    assert any(risk["risk_level"] == "high" for risk in response["json_field_risks"])
