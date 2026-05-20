import asyncio

from app.api_execution.services import automation_service
from app.api_execution.storage import APIExecutionStore


def test_spec_sync_regenerates_dsl_when_spec_changed(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(automation_service, "api_execution_store", store)
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

    response = automation_service.trigger_spec_sync_service()

    assert response["items"][0]["status"] == "updated"
    project = store.get_project("project-1")
    assert project["last_spec_content_hash"] == "hash-1"
    assert project["auto_generated_dsl"]["steps"][0]["path"] == "/health"


def test_scheduled_trigger_enqueues_allowlisted_project(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(automation_service, "api_execution_store", store)
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

    monkeypatch.setattr(automation_service, "enqueue_run", fake_enqueue_run)

    response = asyncio.run(automation_service.trigger_scheduled_runs_service())

    assert response["items"][0]["status"] == "queued"
    assert response["items"][0]["run_id"] == "run-1"
    assert store.get_project("project-1")["last_scheduled_run_at"]


def test_scheduled_trigger_blocks_when_project_policy_disabled(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(automation_service, "api_execution_store", store)
    store.save_project(
        {
            "project_id": "project-1",
            "name": "Demo",
            "enabled": True,
            "allow_ai_execution": False,
            "allow_scheduled_execution": True,
        }
    )

    response = asyncio.run(automation_service.trigger_scheduled_runs_service())

    assert response["items"][0]["status"] == "blocked"
    assert "AI 自动执行" in response["items"][0]["reason"]


def test_storage_migration_readiness_reports_jsonb_and_retention_plan(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(automation_service, "api_execution_store", store)
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

    response = automation_service.get_storage_migration_readiness_service()

    assert response["storage_engine"] == "sqlite"
    assert response["pg_readiness"] == "ready_with_jsonb_mapping"
    assert response["database_path"].endswith("api_execution.db")
    runs_profile = next(item for item in response["table_profiles"] if item["table"] == "runs")
    projects_profile = next(item for item in response["table_profiles"] if item["table"] == "projects")
    assert runs_profile["row_count"] == 1
    assert runs_profile["pg_jsonb_column"] == "data"
    assert runs_profile["invalid_json_rows"] == 0
    assert "project_id" in runs_profile["indexed_columns"]
    assert projects_profile["row_count"] == 1
    assert response["retention_plan"]["run_count"] == 1
    assert response["recommended_steps"]
    assert any(risk["area"] == "projects" and risk["risk_level"] == "medium" for risk in response["json_field_risks"])


def test_storage_migration_readiness_flags_invalid_json_payloads(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(automation_service, "api_execution_store", store)
    with store._lock:
        store._conn.execute(
            """
            INSERT INTO runs (run_id, status, project_id, case_id, case_name, run_at, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("bad-json", "failed", "project-1", "case-1", "Bad JSON", "2026-05-18T10:00:00Z", "{bad"),
        )
        store._conn.commit()

    response = automation_service.get_storage_migration_readiness_service()

    assert response["pg_readiness"] == "needs_cleanup"
    runs_profile = next(item for item in response["table_profiles"] if item["table"] == "runs")
    assert runs_profile["invalid_json_rows"] == 1
    assert any(risk["area"] == "runs" and risk["risk_level"] == "high" for risk in response["json_field_risks"])
