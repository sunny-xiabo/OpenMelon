import asyncio
import importlib
import time

from app.api.logging_service import log_event
from app.api_execution.storage import APIExecutionStore

logs = importlib.import_module("app.log_center.router")


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


def test_event_log_model_normalizes_module_type_trace_and_refs(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(logs, "api_execution_store", store)
    monkeypatch.setattr("app.api.logging_service.api_execution_store", store)

    event = log_event(
        "notice",
        "unknown_module",
        "Bad Event Type",
        "异常事件",
        "message",
        project_id="project-1",
        refs=["project-1", "extra-ref", "extra-ref"],
    )

    assert event["level"] == "info"
    assert event["module"] == "system"
    assert event["event_type"] == "system_event"
    assert event["trace_id"].startswith("project-1")
    assert event["source_id"] == event["trace_id"]
    assert event["refs"] == ["project-1", "extra-ref"]
    assert event["data"]["audit"]["schema_version"]
    assert event["data"]["audit"]["original_module"] == "unknown_module"
    assert event["data"]["audit"]["original_event_type"] == "Bad Event Type"


def test_event_log_schema_endpoint_exposes_audit_contract():
    schema = asyncio.run(logs.get_event_log_schema())

    assert "api_execution" in schema["modules"]
    assert "run_failed" in schema["event_types"]["api_execution"]
    assert "graph_" in schema["event_type_prefixes"]["graph"]
    assert "trace_id" in schema["trace_id_rule"]
    assert "refs" in schema["refs_rule"]


def test_event_logs_cleanup_deletes_old_non_error_only(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    store._last_event_log_prune_at = time.monotonic()
    monkeypatch.setattr(logs, "api_execution_store", store)

    base = {
        "module": "api_execution",
        "event_type": "run_event",
        "project_id": "project-1",
        "trace_id": "run-1",
        "source_id": "run-1",
        "title": "事件",
        "message": "message",
        "refs": [],
        "data": {},
    }
    store.save_event_log({"event_id": "old-info", "created_at": "2026-01-01T00:00:00Z", "level": "info", **base})
    store.save_event_log({"event_id": "old-error", "created_at": "2026-01-01T00:00:00Z", "level": "error", **base})
    store.save_event_log({"event_id": "new-info", "created_at": "2026-05-12T00:00:00Z", "level": "info", **base})

    response = asyncio.run(logs.delete_event_logs(older_than_days=30, level="non_error"))

    assert response["deleted"] == 1
    assert store.get_event_log("old-info") is None
    assert store.get_event_log("old-error") is not None
    assert store.get_event_log("new-info") is not None


def test_event_logs_cleanup_all_levels(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    store._last_event_log_prune_at = time.monotonic()
    monkeypatch.setattr(logs, "api_execution_store", store)

    base = {
        "created_at": "2026-01-01T00:00:00Z",
        "module": "api_execution",
        "event_type": "run_event",
        "project_id": "project-1",
        "trace_id": "run-1",
        "source_id": "run-1",
        "title": "事件",
        "message": "message",
        "refs": [],
        "data": {},
    }
    store.save_event_log({"event_id": "old-info", "level": "info", **base})
    store.save_event_log({"event_id": "old-error", "level": "error", **base})

    response = asyncio.run(logs.cleanup_event_logs(logs.EventLogCleanupRequest(older_than_days=30, level="all")))

    assert response["deleted"] == 2
    assert store.get_event_log("old-info") is None
    assert store.get_event_log("old-error") is None


def test_event_logs_cleanup_zero_days_clears_existing_matching_logs(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    store._last_event_log_prune_at = time.monotonic()
    monkeypatch.setattr(logs, "api_execution_store", store)

    base = {
        "created_at": "2026-05-13T00:00:00Z",
        "module": "api_execution",
        "event_type": "run_event",
        "project_id": "project-1",
        "trace_id": "run-1",
        "source_id": "run-1",
        "title": "事件",
        "message": "message",
        "refs": [],
        "data": {},
    }
    store.save_event_log({"event_id": "current-info", "level": "info", **base})
    store.save_event_log({"event_id": "current-warning", "level": "warning", **base})

    response = asyncio.run(logs.cleanup_event_logs(logs.EventLogCleanupRequest(older_than_days=0, level="all")))

    assert response["deleted"] == 2
    assert store.get_event_log("current-info") is None
    assert store.get_event_log("current-warning") is None
