import uuid
from typing import Any

from app.api_execution.storage import api_execution_store
from app.api_execution.utils import now_iso


def compact_refs(values: list[Any] | None = None) -> list[str]:
    return list(dict.fromkeys(str(value).strip() for value in (values or []) if str(value or "").strip()))


def log_event(
    level: str,
    module: str,
    event_type: str,
    title: str,
    message: str = "",
    *,
    project_id: str = "",
    trace_id: str = "",
    source_id: str = "",
    refs: list[Any] | None = None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    safe_level = level if level in {"info", "warning", "error"} else "info"
    event = {
        "event_id": f"evt_{uuid.uuid4().hex}",
        "created_at": now_iso(),
        "level": safe_level,
        "module": module,
        "event_type": event_type,
        "project_id": project_id or "",
        "trace_id": trace_id or source_id or "",
        "source_id": source_id or trace_id or "",
        "title": title,
        "message": message,
        "refs": compact_refs([trace_id, source_id, project_id, *(refs or [])]),
        "data": data or {},
    }
    return api_execution_store.save_event_log(event)


def safe_log_event(
    level: str,
    module: str,
    event_type: str,
    title: str,
    message: str = "",
    *,
    project_id: str = "",
    trace_id: str = "",
    source_id: str = "",
    refs: list[Any] | None = None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    try:
        return log_event(
            level,
            module,
            event_type,
            title,
            message,
            project_id=project_id,
            trace_id=trace_id,
            source_id=source_id,
            refs=refs,
            data=data,
        )
    except Exception:
        return None
