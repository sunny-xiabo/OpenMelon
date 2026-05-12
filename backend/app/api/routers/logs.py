from typing import Any
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel

from app.api_execution.storage import api_execution_store

router = APIRouter(prefix="/logs", tags=["logs"])


class EventLogRecord(BaseModel):
    event_id: str
    created_at: str
    level: str = "info"
    module: str = ""
    event_type: str = ""
    project_id: str = ""
    trace_id: str = ""
    source_id: str = ""
    title: str = ""
    message: str = ""
    refs: list[str] = []
    data: dict[str, Any] = {}


class EventLogListResponse(BaseModel):
    total: int = 0
    limit: int = 50
    offset: int = 0
    items: list[EventLogRecord] = []


class EventLogCountItem(BaseModel):
    label: str
    count: int = 0


class EventLogSummaryResponse(BaseModel):
    total: int = 0
    error_count: int = 0
    warning_count: int = 0
    module_counts: list[EventLogCountItem] = []
    event_type_counts: list[EventLogCountItem] = []
    latest_error_at: str = ""


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
    limit: int = 50,
    offset: int = 0,
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
async def list_related_event_logs(event_id: str, limit: int = 20):
    safe_limit = max(1, min(limit, 100))
    if not api_execution_store.get_event_log(event_id):
        raise NotFoundError(message="日志事件不存在")
    items = api_execution_store.list_related_event_logs(event_id, safe_limit)
    return {"total": len(items), "limit": safe_limit, "offset": 0, "items": items}
