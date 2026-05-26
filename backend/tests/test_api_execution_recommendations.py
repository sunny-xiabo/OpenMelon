import asyncio

import pytest

from app.api.errors import InvalidRequestError
from app.api_execution.services import recommendation_service


class FakeStore:
    def __init__(self):
        self.runs = []
        self.tasks = []
        self.audits = []

    def list_runs(self, limit=20, status=None, keyword=None, project_id=None, offset=0):
        items = [run for run in self.runs if not project_id or (run.get("execution_options") or {}).get("project_id") == project_id]
        if status:
            items = [run for run in items if run.get("status") == status]
        return items[offset:offset + limit]

    def get_run(self, run_id):
        return next((run for run in self.runs if run.get("run_id") == run_id), None)

    def list_automation_tasks(self, limit=20, status=None, project_id=None, offset=0):
        items = [task for task in self.tasks if not project_id or task.get("project_id") == project_id]
        if status:
            items = [task for task in items if task.get("status") == status]
        return items[offset:offset + limit]

    def list_policy_audits(self, limit=20, project_id=None, action=None):
        items = [audit for audit in self.audits if not project_id or audit.get("project_id") == project_id]
        if action:
            items = [audit for audit in items if audit.get("action") == action]
        return items[:limit]


def test_recommendations_include_failed_run_repair_and_knowledge_candidate(monkeypatch):
    store = FakeStore()
    store.runs = [_failed_run("run-1")]
    monkeypatch.setattr(recommendation_service, "api_execution_store", store)
    monkeypatch.setattr(
        "app.api_execution.services.run_service.get_queue_status_service",
        lambda: {"storage_queued_count": 0, "storage_running_count": 0, "available_slots": 2},
    )

    response = recommendation_service.list_api_execution_recommendations_service(project_id="project-1")

    ids = {item["id"] for item in response["items"]}
    assert "failed_run:auto_repair:run-1" in ids
    assert "failed_run:knowledge_candidate:run-1" in ids
    repair = next(item for item in response["items"] if item["id"] == "failed_run:auto_repair:run-1")
    assert repair["actions"][0]["action"] == "auto_repair_run"
    assert repair["actions"][0]["requires_confirmation"] is True


def test_recommendations_include_policy_queue_and_pending_task(monkeypatch):
    store = FakeStore()
    store.runs = []
    store.audits = [{
        "audit_id": "audit-1",
        "project_id": "project-1",
        "action": "execute_blocked",
        "approved": False,
        "decision": {"allowed": False, "risk_level": "blocked", "violations": ["项目未开启 AI 自动执行"]},
    }]
    store.tasks = [{
        "task_id": "task-1",
        "project_id": "project-1",
        "status": "pending",
        "task_type": "manual_review",
        "risk_level": "medium",
        "reason": "需要人工复核",
        "run_id": "run-1",
    }]
    monkeypatch.setattr(recommendation_service, "api_execution_store", store)
    monkeypatch.setattr(
        "app.api_execution.services.run_service.get_queue_status_service",
        lambda: {"storage_queued_count": 2, "storage_running_count": 2, "available_slots": 0},
    )

    response = recommendation_service.list_api_execution_recommendations_service(project_id="project-1")
    ids = {item["id"] for item in response["items"]}

    assert "policy_blocked:audit-1" in ids
    assert "queue:congestion" in ids
    assert "task:pending:task-1" in ids


def test_unknown_recommendation_action_is_rejected():
    with pytest.raises(InvalidRequestError):
        asyncio.run(recommendation_service.execute_api_execution_recommendation_action_service(action="drop_all"))


def test_high_risk_action_requires_confirm():
    with pytest.raises(InvalidRequestError):
        asyncio.run(
            recommendation_service.execute_api_execution_recommendation_action_service(
                action="auto_repair_run",
                target_id="run-1",
                confirm=False,
            )
        )


def test_low_risk_action_executes_existing_service_and_logs(monkeypatch):
    events = []
    monkeypatch.setattr(
        "app.api_execution.services.knowledge_service.create_run_knowledge_candidate_service",
        lambda run_id: {"run_id": run_id, "task_id": f"knowledge-candidate:{run_id}"},
    )
    monkeypatch.setattr(recommendation_service, "log_event", lambda *args, **kwargs: events.append((args, kwargs)))

    response = asyncio.run(
        recommendation_service.execute_api_execution_recommendation_action_service(
            action="create_knowledge_candidate",
            target_id="run-1",
            project_id="project-1",
        )
    )

    assert response["status"] == "success"
    assert response["result"]["task_id"] == "knowledge-candidate:run-1"
    assert events
    assert events[0][0][2] == "api_execution_recommendation_action_executed"


def _failed_run(run_id):
    return {
        "run_id": run_id,
        "status": "failed",
        "failed": 1,
        "failure_reason": "状态码断言失败",
        "failure_diagnostics": [{"category": "status_code_mismatch", "step_id": "s1", "explanation": "状态码断言失败"}],
        "repair_suggestions": ["检查鉴权"],
        "execution_options": {"project_id": "project-1", "environment_id": "env-1"},
        "script": {"case_id": "case-1", "name": "用例", "steps": []},
    }
