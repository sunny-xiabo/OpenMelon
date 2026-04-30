from app.api_execution.storage import APIExecutionStore


def test_project_and_environment_store_roundtrip(tmp_path):
    store = APIExecutionStore(tmp_path)

    project = store.save_project(
        {
            "project_id": "project-1",
            "name": "OpenMelon",
            "default_environment_id": "",
            "enabled": True,
        }
    )
    environment = store.save_environment(
        {
            "environment_id": "env-1",
            "project_id": "project-1",
            "name": "本地测试",
            "environment_type": "test",
            "base_url": "http://localhost:8000",
            "headers": {"Accept": "application/json"},
            "variables": {},
            "timeout_ms": 30000,
            "continue_on_failure": True,
            "enabled": True,
        }
    )

    assert store.get_project("project-1") == project
    assert store.get_environment("env-1") == environment
    assert store.list_projects()[0]["project_id"] == "project-1"
    assert store.list_environments("project-1")[0]["environment_id"] == "env-1"


def test_delete_project_also_deletes_environments(tmp_path):
    store = APIExecutionStore(tmp_path)
    store.save_project({"project_id": "project-1", "name": "OpenMelon"})
    store.save_environment({"environment_id": "env-1", "project_id": "project-1", "name": "本地测试"})

    assert store.delete_project("project-1") is True
    assert store.get_project("project-1") is None
    assert store.list_environments("project-1") == []


def test_project_policy_and_history_project_filter(tmp_path):
    store = APIExecutionStore(tmp_path)
    project = store.save_project(
        {
            "project_id": "project-1",
            "name": "OpenMelon",
            "allow_ai_execution": True,
            "allow_ai_repair": True,
            "allow_scheduled_execution": False,
            "allow_ai_generate_dsl": True,
            "allow_overwrite_history": True,
            "max_auto_repairs": 2,
            "max_reruns": 3,
            "max_requests_per_run": 5,
            "risk_overrides": {"DELETE /users/{id}": "high"},
            "operation_allowlist": ["GET /health", "GET /users"],
            "operation_blocklist": ["DELETE /users/{id}"],
        }
    )
    store.save_run(
        {
            "run_id": "run-1",
            "run_at": "2026-04-29T00:00:01Z",
            "case_name": "project run",
            "status": "passed",
            "execution_options": {"project_id": "project-1", "environment_snapshot": {"name": "本地测试"}},
        }
    )
    store.save_run(
        {
            "run_id": "run-2",
            "run_at": "2026-04-29T00:00:02Z",
            "case_name": "other run",
            "status": "passed",
            "execution_options": {"project_id": "project-2"},
        }
    )

    assert project["allow_ai_execution"] is True
    assert project["operation_blocklist"] == ["DELETE /users/{id}"]
    assert project["max_requests_per_run"] == 5
    assert project["risk_overrides"]["DELETE /users/{id}"] == "high"
    assert [run["run_id"] for run in store.list_runs(project_id="project-1")] == ["run-1"]
    assert [run["run_id"] for run in store.list_runs(keyword="本地测试")] == ["run-1"]


def test_policy_audit_store_roundtrip(tmp_path):
    store = APIExecutionStore(tmp_path)
    audit = store.save_policy_audit(
        {
            "audit_id": "audit-1",
            "created_at": "2026-04-29T00:00:01Z",
            "action": "execute",
            "project_id": "project-1",
            "environment_id": "env-1",
            "trigger_source": "manual",
            "decision": {"allowed": True, "risk_level": "low"},
            "approved": True,
            "approval_note": "系统策略自动判定",
        }
    )

    assert store.list_policy_audits()[0] == audit
    assert store.list_policy_audits(project_id="project-1")[0]["audit_id"] == "audit-1"
    assert store.list_policy_audits(action="execute")[0]["audit_id"] == "audit-1"


def test_automation_task_store_roundtrip(tmp_path):
    store = APIExecutionStore(tmp_path)
    task = store.save_automation_task(
        {
            "task_id": "task-1",
            "created_at": "2026-04-29T00:00:01Z",
            "updated_at": "2026-04-29T00:00:01Z",
            "task_type": "manual_review",
            "status": "pending",
            "run_id": "run-1",
            "project_id": "project-1",
            "environment_id": "env-1",
            "risk_level": "medium",
            "reason": "需要人工确认",
            "summary": {"failed": 1},
            "decision": {"allowed": False},
        }
    )

    assert store.get_automation_task("task-1") == task
    assert store.list_automation_tasks(status="pending")[0]["task_id"] == "task-1"
    assert store.list_automation_tasks(project_id="project-1")[0]["task_id"] == "task-1"
    assert store.update_automation_task("task-1", {"status": "resolved"})["status"] == "resolved"


def test_unified_automation_and_knowledge_store_roundtrip(tmp_path):
    store = APIExecutionStore(tmp_path)
    store.save_automation_definition(
        {
            "definition_id": "api:case-1",
            "automation_type": "api",
            "name": "API case",
            "created_at": "2026-04-29T00:00:01Z",
            "updated_at": "2026-04-29T00:00:01Z",
        }
    )
    store.save_automation_run(
        {
            "automation_run_id": "api-run:run-1",
            "automation_type": "api",
            "source_run_id": "run-1",
            "status": "passed",
            "run_at": "2026-04-29T00:00:02Z",
            "summary": {"passed": 1},
        }
    )
    store.save_run_stage_event(
        {
            "event_id": "event-1",
            "automation_run_id": "api-run:run-1",
            "stage": "execute",
            "status": "passed",
            "created_at": "2026-04-29T00:00:02Z",
            "detail": {},
        }
    )
    store.save_artifact_meta(
        {
            "artifact_id": "artifact-1",
            "automation_run_id": "api-run:run-1",
            "artifact_type": "report_json",
            "name": "报告",
            "created_at": "2026-04-29T00:00:02Z",
            "metadata": {},
        }
    )
    store.save_knowledge_item(
        {
            "knowledge_id": "knowledge-1",
            "item_type": "api_run_summary",
            "source_run_id": "run-1",
            "project_id": "project-1",
            "created_at": "2026-04-29T00:00:02Z",
            "summary": "执行通过",
            "payload": {},
        }
    )

    assert store.list_automation_runs()[0]["automation_run_id"] == "api-run:run-1"
    assert store.list_knowledge_items(item_type="api_run_summary")[0]["knowledge_id"] == "knowledge-1"
