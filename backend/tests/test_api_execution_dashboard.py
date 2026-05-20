from app.api_execution.services import dashboard_service
from app.api_execution.services import knowledge_service
from app.api_execution.services import run_service
from app.api_execution.services import template_service
from app.api_execution.services import automation_service
from app.api_execution.storage import APIExecutionStore


def test_dashboard_summary_aggregates_runs_and_failures(monkeypatch, tmp_path):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(dashboard_service, "api_execution_store", store)
    store.save_run(_run("run_passed", "passed", duration_ms=100, passed=1, failed=0, flow_template_id="template_1", flow_template_name="登录流程"))
    store.save_run(
        _run(
            "run_failed",
            "failed",
            duration_ms=300,
            passed=0,
            failed=1,
            failure_reason="状态码断言失败：期望 200，实际 500",
            results=[
                {
                    "step_id": "s1",
                    "name": "获取订单",
                    "method": "GET",
                    "url": "http://example.test/orders/1",
                    "status": "failed",
                    "error": "",
                    "assertions": [
                        {
                            "type": "status_code_in",
                            "passed": False,
                            "message": "状态码不在期望列表中",
                        }
                    ],
                }
            ],
            flow_template_id="template_1",
            flow_template_name="登录流程",
        )
    )
    store.save_run(_run("run_running", "running", duration_ms=0, passed=0, failed=0))
    store.save_run(_run("run_cancelled", "cancelled", duration_ms=50, passed=0, failed=0))
    store.save_automation_task({"task_id": "task_1", "status": "pending", "project_id": "project_a", "updated_at": "2026-01-01T00:00:00Z"})

    summary = dashboard_service._dashboard_summary(project_id="project_a", limit=50)

    assert summary["total_runs"] == 4
    assert summary["status_counts"]["passed"] == 1
    assert summary["status_counts"]["failed"] == 1
    assert summary["status_counts"]["running"] == 1
    assert summary["status_counts"]["cancelled"] == 1
    assert summary["pass_rate"] == 33.3
    assert summary["average_duration_ms"] == 150
    assert summary["pending_task_count"] == 1
    assert summary["failure_reason_top"][0]["label"].startswith("状态码断言失败")
    assert summary["failure_step_top"][0] == {"label": "GET http://example.test/orders/1", "count": 1}
    assert summary["template_stats"][0]["template_id"] == "template_1"
    assert summary["template_stats"][0]["run_count"] == 2
    assert summary["template_stats"][0]["pass_rate"] == 50.0
    assert summary["template_stats"][0]["failure_rate"] == 50.0
    assert summary["template_stats"][0]["failed_count"] == 1
    assert summary["recent_failures"][0]["run_id"] == "run_failed"


def test_dashboard_summary_filters_project(monkeypatch, tmp_path):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(dashboard_service, "api_execution_store", store)
    store.save_run(_run("run_a", "passed", project_id="project_a"))
    store.save_run(_run("run_b", "failed", project_id="project_b", failure_reason="服务错误"))
    store.save_automation_task({"task_id": "task_a", "status": "pending", "project_id": "project_a", "updated_at": "2026-01-01T00:00:00Z"})
    store.save_automation_task({"task_id": "task_b", "status": "pending", "project_id": "project_b", "updated_at": "2026-01-01T00:00:00Z"})

    summary = dashboard_service._dashboard_summary(project_id="project_b", limit=50)

    assert summary["total_runs"] == 1
    assert summary["status_counts"]["failed"] == 1
    assert summary["pending_task_count"] == 1
    assert summary["recent_runs"][0]["run_id"] == "run_b"


def test_dashboard_summary_empty_history(monkeypatch, tmp_path):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(dashboard_service, "api_execution_store", store)

    summary = dashboard_service._dashboard_summary(limit=50)

    assert summary["total_runs"] == 0
    assert summary["pass_rate"] == 0
    assert summary["average_duration_ms"] == 0
    assert summary["pending_task_count"] == 0
    assert summary["failure_reason_top"] == []
    assert summary["recent_runs"] == []


def test_task_center_summary_groups_status_type_risk_and_project(monkeypatch, tmp_path):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(dashboard_service, "api_execution_store", store)
    store.save_automation_task(
        {
            "task_id": "task_manual",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:04Z",
            "task_type": "manual_review",
            "status": "pending",
            "project_id": "project_a",
            "risk_level": "medium",
            "reason": "自动修复后仍需确认",
        }
    )
    store.save_automation_task(
        {
            "task_id": "task_knowledge",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:03Z",
            "task_type": "knowledge_ingest_candidate",
            "status": "pending",
            "project_id": "project_a",
            "risk_level": "low",
            "reason": "可确认沉淀",
        }
    )
    store.save_automation_task(
        {
            "task_id": "task_policy",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:02Z",
            "task_type": "scheduled_run_review",
            "status": "failed",
            "project_id": "project_a",
            "risk_level": "blocked",
            "reason": "策略阻断",
            "decision": {"allowed": False, "risk_level": "blocked"},
        }
    )
    store.save_automation_task(
        {
            "task_id": "task_other",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:01Z",
            "task_type": "manual_review",
            "status": "pending",
            "project_id": "project_b",
            "risk_level": "high",
            "reason": "另一个项目",
        }
    )

    summary = dashboard_service.task_center_summary(project_id="project_a", limit=10)

    assert summary["total_task_count"] == 3
    assert summary["pending_task_count"] == 2
    assert summary["failed_task_count"] == 1
    assert summary["status_counts"]["resolved"] == 0
    assert {item["label"]: item["count"] for item in summary["risk_counts"]} == {"medium": 1, "low": 1, "blocked": 1}
    type_counts = {item["task_type"]: item for item in summary["type_counts"]}
    assert type_counts["knowledge_ingest_candidate"]["pending_count"] == 1
    buckets = {item["bucket"]: item for item in summary["action_buckets"]}
    assert buckets["failure_diagnosis"]["pending_count"] == 1
    assert buckets["knowledge_confirmation"]["pending_count"] == 1
    assert buckets["policy_blocked"]["count"] == 1
    assert summary["recent_tasks"][0]["task_id"] == "task_manual"


def test_flow_template_helpers_roundtrip(monkeypatch, tmp_path):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(dashboard_service, "api_execution_store", store)
    store.save_run(_run("tpl_passed", "passed", duration_ms=120, passed=1, failed=0, flow_template_id="template-1", flow_template_name="登录流程"))
    store.save_run(_run("tpl_failed_latest", "failed", duration_ms=340, passed=0, failed=1, flow_template_id="template-1", flow_template_name="登录流程"))
    definition = store.save_automation_definition(
        {
            "definition_id": "flow-template:template-1",
            "definition_type": "flow_template",
            "template_id": "template-1",
            "project_id": "project_a",
            "name": "登录流程",
            "description": "登录后查询用户",
            "tags": ["smoke"],
            "script": {"case_id": "case-1", "name": "登录流程", "steps": []},
            "created_at": "2026-05-11T00:00:01Z",
            "updated_at": "2026-05-11T00:00:02Z",
        }
    )

    template = dashboard_service.flow_template_from_definition(definition)

    assert template["template_id"] == "template-1"
    assert template["project_id"] == "project_a"
    assert template["script"]["case_id"] == "case-1"
    assert template["performance_snapshot"]["run_count"] == 2
    assert template["performance_snapshot"]["pass_rate"] == 0.5
    assert template["performance_snapshot"]["failure_rate"] == 0.5


def test_list_endpoints_use_unified_pagination_shape(monkeypatch, tmp_path):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(run_service, "api_execution_store", store)
    monkeypatch.setattr(automation_service, "api_execution_store", store)
    monkeypatch.setattr(knowledge_service, "api_execution_store", store)
    monkeypatch.setattr(template_service, "api_execution_store", store)
    store.save_run(_run("run_1", "passed"))
    store.save_run(_run("run_2", "failed"))
    store.save_automation_task(
        {
            "task_id": "task_1",
            "created_at": "2026-01-01T00:00:00Z",
            "updated_at": "2026-01-01T00:00:02Z",
            "task_type": "manual_review",
            "status": "pending",
            "project_id": "project_a",
            "risk_level": "medium",
        }
    )
    store.save_knowledge_item(
        {
            "knowledge_id": "knowledge_1",
            "item_type": "api_failure",
            "source_run_id": "run_2",
            "project_id": "project_a",
            "created_at": "2026-01-01T00:00:03Z",
            "summary": "失败知识",
            "payload": {},
        }
    )
    store.save_automation_definition(
        {
            "definition_id": "flow-template:template_1",
            "definition_type": "flow_template",
            "template_id": "template_1",
            "project_id": "project_a",
            "name": "模板",
            "script": {"case_id": "case_1", "name": "模板", "steps": []},
            "created_at": "2026-01-01T00:00:04Z",
            "updated_at": "2026-01-01T00:00:04Z",
        }
    )

    runs = run_service.list_run_history_service(limit=1, offset=1, project_id="project_a")
    tasks = automation_service.list_automation_tasks_service(limit=10, offset=0, status="pending", project_id="project_a")
    knowledge = knowledge_service.list_knowledge_review_items_service(limit=10, offset=0, project_id="project_a")
    templates = template_service.list_flow_templates_service(limit=10, offset=0, project_id="project_a")

    assert runs["total"] == 2
    assert runs["limit"] == 1
    assert runs["offset"] == 1
    assert runs["items"] == runs["runs"]
    assert tasks["total"] == 1
    assert tasks["items"] == tasks["tasks"]
    assert knowledge["total"] == 1
    assert knowledge["items"][0]["knowledge_id"] == "knowledge_1"
    assert templates["total"] == 1
    assert templates["items"] == templates["templates"]


def _run(
    run_id,
    status,
    *,
    project_id="project_a",
    duration_ms=10,
    passed=0,
    failed=0,
    failure_reason=None,
    results=None,
    flow_template_id="",
    flow_template_name="",
):
    return {
        "run_id": run_id,
        "run_at": f"2026-01-01T00:00:0{len(run_id)}Z",
        "case_id": f"case_{run_id}",
        "case_name": f"用例 {run_id}",
        "mode": "background",
        "status": status,
        "failure_reason": failure_reason,
        "duration_ms": duration_ms,
        "total": passed + failed,
        "passed": passed,
        "failed": failed,
        "skipped": 0,
        "execution_options": {
            "project_id": project_id,
            "project_policy_snapshot": {"name": f"项目 {project_id}"},
            "flow_template_id": flow_template_id,
            "flow_template_name": flow_template_name,
        },
        "results": results or [],
    }
