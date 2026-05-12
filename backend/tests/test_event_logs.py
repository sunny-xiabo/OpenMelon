import asyncio

from app.api.logging_service import log_event
from app.api.routers import logs
from app.api_execution.storage import APIExecutionStore


def test_event_logs_query_summary_and_related(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(logs, "api_execution_store", store)
    monkeypatch.setattr("app.api.logging_service.api_execution_store", store)

    first = log_event(
        "error",
        "api_execution",
        "run_failed",
        "API 执行失败",
        "订单详情返回 404",
        project_id="project-1",
        trace_id="run-1",
        source_id="run-1",
        refs=["task-1"],
    )
    log_event(
        "warning",
        "task_center",
        "task_created",
        "待处理任务已创建",
        "需要人工诊断",
        project_id="project-1",
        trace_id="run-1",
        source_id="task-1",
    )
    log_event(
        "info",
        "knowledge",
        "knowledge_active",
        "知识已沉淀",
        "修复经验可召回",
        project_id="project-2",
        trace_id="run-2",
        source_id="knowledge-1",
    )

    result = asyncio.run(logs.list_event_logs(project_id="project-1", limit=1, offset=0))
    assert result["total"] == 2
    assert result["limit"] == 1
    assert len(result["items"]) == 1

    summary = asyncio.run(logs.summarize_event_logs(project_id="project-1"))
    assert summary["total"] == 2
    assert summary["error_count"] == 1
    assert summary["warning_count"] == 1
    assert {item["label"] for item in summary["module_counts"]} == {"api_execution", "task_center"}

    keyword = asyncio.run(logs.list_event_logs(keyword="404", limit=10))
    assert keyword["total"] == 1
    assert keyword["items"][0]["event_id"] == first["event_id"]

    related = asyncio.run(logs.list_related_event_logs(first["event_id"], limit=10))
    assert related["total"] == 1
    assert related["items"][0]["event_type"] == "task_created"

