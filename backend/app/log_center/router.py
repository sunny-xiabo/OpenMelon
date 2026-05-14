from typing import Annotated, Any
from app.api.errors import InvalidRequestError, NotFoundError

from datetime import UTC, datetime, timedelta

from fastapi import APIRouter, Query

from app.api.logging_service import AUDIT_EVENT_SCHEMA_VERSION, AUDIT_EVENT_TYPES, AUDIT_EVENT_TYPE_PREFIXES, AUDIT_MODULES
from app.api.ai_observability_service import get_ai_debug_settings, get_debug_snapshot, update_ai_debug_settings
from app.api_execution.storage import api_execution_store
from app.log_center.schemas import (
    AICallLogListResponse,
    AICallLogSummaryResponse,
    AIDebugSettingsRequest,
    AIDebugSettingsResponse,
    AIDebugSnapshotResponse,
    EventLogCleanupRequest,
    EventLogDeleteResponse,
    EventLogListResponse,
    EventLogSchemaResponse,
    EventLogSummaryResponse,
)

router = APIRouter(prefix="/logs", tags=["logs"])


def _query_kwargs(
    project_id: str | None = None,
    module: str | None = None,
    level: str | None = None,
    event_type: str | None = None,
    trace_id: str | None = None,
    keyword: str | None = None,
    start_at: str | None = None,
    end_at: str | None = None,
) -> dict[str, Any]:
    return {
        "project_id": project_id or None,
        "module": module or None,
        "level": level if level in {"info", "warning", "error"} else None,
        "event_type": event_type or None,
        "trace_id": trace_id or None,
        "keyword": keyword or None,
        "start_at": start_at or None,
        "end_at": end_at or None,
    }


def _ai_call_query_kwargs(
    feature: str | None = None,
    operation: str | None = None,
    model: str | None = None,
    status: str | None = None,
    degraded: bool | None = None,
    keyword: str | None = None,
    start_at: str | None = None,
    end_at: str | None = None,
) -> dict[str, Any]:
    return {
        "feature": feature or None,
        "operation": operation or None,
        "model": model or None,
        "status": status if status in {"success", "failed", "degraded"} else None,
        "degraded": degraded,
        "keyword": keyword or None,
        "start_at": start_at or None,
        "end_at": end_at or None,
    }


def _cutoff_iso(days: int) -> str:
    safe_days = max(0, min(days, 3650))
    return (datetime.now(UTC) - timedelta(days=safe_days)).isoformat().replace("+00:00", "Z")


def _delete_event_logs_by_policy(
    older_than_days: int,
    level: str,
    project_id: str | None = None,
    module: str | None = None,
) -> dict[str, Any]:
    if level not in {"non_error", "info", "warning", "error", "all"}:
        raise InvalidRequestError(message="日志等级只支持 non_error、info、warning、error、all")
    cutoff = _cutoff_iso(older_than_days)
    deleted = api_execution_store.delete_event_logs(
        older_than=cutoff,
        level=None if level == "all" else level,
        project_id=project_id,
        module=module,
    )
    remaining = api_execution_store.count_event_logs()
    return {"deleted": deleted, "remaining": remaining, "older_than": cutoff, "level": level}


@router.get("/schema", response_model=EventLogSchemaResponse)
async def get_event_log_schema():
    return {
        "schema_version": AUDIT_EVENT_SCHEMA_VERSION,
        "modules": sorted(AUDIT_MODULES),
        "event_types": {module: sorted(values) for module, values in AUDIT_EVENT_TYPES.items()},
        "event_type_prefixes": {module: list(prefixes) for module, prefixes in AUDIT_EVENT_TYPE_PREFIXES.items()},
        "trace_id_rule": "trace_id 优先使用调用方传入值；缺省时按 source_id、project_id、trace_<uuid> 依次生成，始终非空。",
        "refs_rule": "refs 自动包含 trace_id、source_id、project_id 和调用方 refs，去空并按出现顺序去重。",
    }


@router.get("/events", response_model=EventLogListResponse)
async def list_event_logs(
    project_id: str | None = None,
    module: str | None = None,
    level: str | None = None,
    event_type: str | None = None,
    trace_id: str | None = None,
    keyword: str | None = None,
    start_at: str | None = None,
    end_at: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    kwargs = _query_kwargs(project_id, module, level, event_type, trace_id, keyword, start_at, end_at)
    return {
        "total": api_execution_store.count_event_logs(**kwargs),
        "limit": safe_limit,
        "offset": safe_offset,
        "items": api_execution_store.list_event_logs(limit=safe_limit, offset=safe_offset, **kwargs),
    }


@router.get("/summary", response_model=EventLogSummaryResponse)
async def summarize_event_logs(
    project_id: str | None = None,
    module: str | None = None,
    level: str | None = None,
    event_type: str | None = None,
    trace_id: str | None = None,
    keyword: str | None = None,
    start_at: str | None = None,
    end_at: str | None = None,
):
    return api_execution_store.summarize_event_logs(
        **_query_kwargs(project_id, module, level, event_type, trace_id, keyword, start_at, end_at)
    )


@router.get("/events/{event_id}/related", response_model=EventLogListResponse)
async def list_related_event_logs(event_id: str, limit: Annotated[int, Query(ge=1, le=100)] = 20):
    safe_limit = max(1, min(limit, 100))
    if not api_execution_store.get_event_log(event_id):
        raise NotFoundError(message="日志事件不存在")
    items = api_execution_store.list_related_event_logs(event_id, safe_limit)
    return {"total": len(items), "limit": safe_limit, "offset": 0, "items": items}


@router.delete("/events", response_model=EventLogDeleteResponse)
async def delete_event_logs(
    older_than_days: int = 90,
    level: str = "non_error",
    project_id: str | None = None,
    module: str | None = None,
):
    return _delete_event_logs_by_policy(older_than_days, level, project_id, module)


@router.post("/events/cleanup", response_model=EventLogDeleteResponse)
async def cleanup_event_logs(request: EventLogCleanupRequest):
    return _delete_event_logs_by_policy(
        request.older_than_days,
        request.level,
        request.project_id or None,
        request.module or None,
    )


@router.get("/ai-calls", response_model=AICallLogListResponse)
async def list_ai_call_logs(
    feature: str | None = None,
    operation: str | None = None,
    model: str | None = None,
    status: str | None = None,
    degraded: bool | None = None,
    keyword: str | None = None,
    start_at: str | None = None,
    end_at: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 50,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    safe_limit = max(1, min(limit, 200))
    safe_offset = max(0, offset)
    kwargs = _ai_call_query_kwargs(feature, operation, model, status, degraded, keyword, start_at, end_at)
    return {
        "total": api_execution_store.count_ai_call_logs(**kwargs),
        "limit": safe_limit,
        "offset": safe_offset,
        "items": api_execution_store.list_ai_call_logs(limit=safe_limit, offset=safe_offset, **kwargs),
    }


@router.get("/ai-calls/summary", response_model=AICallLogSummaryResponse)
async def summarize_ai_call_logs(
    feature: str | None = None,
    operation: str | None = None,
    model: str | None = None,
    status: str | None = None,
    degraded: bool | None = None,
    keyword: str | None = None,
    start_at: str | None = None,
    end_at: str | None = None,
):
    return api_execution_store.summarize_ai_call_logs(
        **_ai_call_query_kwargs(feature, operation, model, status, degraded, keyword, start_at, end_at)
    )


@router.get("/ai-debug/settings", response_model=AIDebugSettingsResponse)
async def get_ai_debug_config():
    return get_ai_debug_settings()


@router.put("/ai-debug/settings", response_model=AIDebugSettingsResponse)
async def update_ai_debug_config(request: AIDebugSettingsRequest):
    return update_ai_debug_settings(request.model_dump())


@router.get("/ai-calls/{call_id}/debug-snapshot", response_model=AIDebugSnapshotResponse)
async def get_ai_call_debug_snapshot(call_id: str):
    snapshot = get_debug_snapshot(call_id)
    if not snapshot:
        raise NotFoundError(message="调试快照不存在、未开启或已过期")
    return snapshot
