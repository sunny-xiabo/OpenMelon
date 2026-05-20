import asyncio

import pytest
from app.api.errors import InvalidRequestError

from app.api_execution.services import run_service
from app.api_execution.storage import APIExecutionStore


def test_auto_repair_rerun_updates_existing_run_with_comparison(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(run_service, "api_execution_store", store)

    run = _failed_run()
    store.save_run(run)

    async def fake_run_all_steps(script, **kwargs):
        assert kwargs["step_ids"] == ["s1"]
        assert script.steps[0].assertions[0].expected == [200, 201]
        return {
            "case_id": script.case_id,
            "target_project": script.target_project,
            "status": "passed",
            "duration_ms": 12,
            "total": 1,
            "passed": 1,
            "failed": 0,
            "skipped": 0,
            "results": [
                {
                    "step_id": "s1",
                    "name": "Create",
                    "method": "GET",
                    "url": "http://example.test/items",
                    "status": "passed",
                    "status_code": 201,
                    "duration_ms": 12,
                    "assertions": [{"type": "status_code_in", "passed": True, "expected": [200, 201], "actual": 201}],
                    "extracted": {},
                    "request": {},
                    "response": {},
                }
            ],
        }

    monkeypatch.setattr(run_service, "run_all_steps", fake_run_all_steps)

    updated = asyncio.run(run_service.auto_repair_and_rerun_service("run-1"))

    assert updated["run_id"] == "run-1"
    assert updated["status"] == "passed"
    assert updated["automation_summary"]["before"]["failed"] == 1
    assert updated["automation_summary"]["after"]["failed"] == 0
    assert updated["repair_history"][0]["type"] == "auto_repair_rerun"
    assert store.get_run("run-1")["script"]["steps"][0]["assertions"][0]["expected"] == [200, 201]
    assert store.list_policy_audits(action="auto_repair_rerun")[0]["run_id"] == "run-1"


def test_auto_repair_rerun_blocked_creates_pending_task(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(run_service, "api_execution_store", store)
    run = _failed_run()
    run["execution_options"]["project_policy_snapshot"]["allow_ai_repair"] = False
    store.save_run(run)

    with pytest.raises(InvalidRequestError, match="项目未开启 AI 自动修复"):
        asyncio.run(run_service.auto_repair_and_rerun_service("run-1"))

    tasks = store.list_automation_tasks()
    assert len(tasks) == 1
    assert tasks[0]["status"] == "pending"
    assert tasks[0]["run_id"] == "run-1"
    assert "AI 自动修复" in tasks[0]["reason"]


def _failed_run() -> dict:
    return {
        "run_id": "run-1",
        "run_at": "2026-04-29T00:00:00Z",
        "case_id": "case_auto",
        "target_project": "OpenMelon",
        "case_name": "自动修复",
        "mode": "batch",
        "script": {
            "case_id": "case_auto",
            "name": "自动修复",
            "target_project": "OpenMelon",
            "base_url": "http://example.test",
            "steps": [
                {
                    "id": "s1",
                    "name": "Create",
                    "method": "GET",
                    "path": "/items",
                    "operation_id": "create_item",
                    "assertions": [{"type": "status_code_in", "expected": [200]}],
                }
            ],
        },
        "execution_options": {
            "project_id": "project-1",
            "environment_id": "env-1",
            "environment_snapshot": {"environment_type": "test"},
            "project_policy_snapshot": {
                "project_id": "project-1",
                "allow_ai_execution": True,
                "allow_ai_repair": True,
                "allow_overwrite_history": True,
            },
            "base_url": "http://example.test",
            "timeout_ms": 30000,
            "continue_on_failure": True,
            "policy_decision": {"allowed": True, "risk_level": "low"},
        },
        "status": "failed",
        "duration_ms": 10,
        "total": 1,
        "passed": 0,
        "failed": 1,
        "skipped": 0,
        "results": [
            {
                "step_id": "s1",
                "name": "Create",
                "method": "GET",
                "url": "http://example.test/items",
                "status": "failed",
                "status_code": 201,
                "duration_ms": 10,
                "assertions": [{"type": "status_code_in", "passed": False, "expected": [200], "actual": 201}],
                "extracted": {},
                "request": {},
                "response": {},
            }
        ],
    }
