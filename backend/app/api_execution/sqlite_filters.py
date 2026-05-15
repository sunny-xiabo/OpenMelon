"""WHERE-clause builders for API execution SQLite queries."""

from __future__ import annotations

from typing import Any


def build_event_log_where(
    project_id: str | None,
    module: str | None,
    level: str | None,
    event_type: str | None,
    trace_id: str | None,
    keyword: str | None,
    start_at: str | None,
    end_at: str | None,
) -> tuple[str, list[Any]]:
    conditions = ["1=1"]
    params: list[Any] = []
    filters = {
        "project_id": project_id,
        "module": module,
        "level": level,
        "event_type": event_type,
        "trace_id": trace_id,
    }
    for column, value in filters.items():
        if value:
            conditions.append(f"{column} = ?")
            params.append(value.strip())
    if start_at:
        conditions.append("created_at >= ?")
        params.append(start_at.strip())
    if end_at:
        conditions.append("created_at <= ?")
        params.append(end_at.strip())
    if keyword:
        kw = f"%{keyword.lower().strip()}%"
        conditions.append(
            "(LOWER(title) LIKE ? OR LOWER(message) LIKE ? OR LOWER(event_type) LIKE ? "
            "OR LOWER(trace_id) LIKE ? OR LOWER(source_id) LIKE ? OR LOWER(project_id) LIKE ?)"
        )
        params.extend([kw, kw, kw, kw, kw, kw])
    return " AND ".join(conditions), params


def build_ai_call_where(
    feature: str | None,
    operation: str | None,
    model: str | None,
    status: str | None,
    degraded: bool | None,
    keyword: str | None,
    start_at: str | None,
    end_at: str | None,
) -> tuple[str, list[Any]]:
    conditions = ["1=1"]
    params: list[Any] = []
    for column, value in {
        "feature": feature,
        "operation": operation,
        "model": model,
        "status": status,
    }.items():
        if value:
            conditions.append(f"{column} = ?")
            params.append(value.strip())
    if degraded is not None:
        conditions.append("degraded = ?")
        params.append(1 if degraded else 0)
    if start_at:
        conditions.append("created_at >= ?")
        params.append(start_at.strip())
    if end_at:
        conditions.append("created_at <= ?")
        params.append(end_at.strip())
    if keyword:
        kw = f"%{keyword.lower().strip()}%"
        conditions.append(
            "(LOWER(feature) LIKE ? OR LOWER(operation) LIKE ? OR LOWER(model) LIKE ? "
            "OR LOWER(status) LIKE ? OR LOWER(failure_reason) LIKE ? OR LOWER(trace_id) LIKE ? OR LOWER(source_id) LIKE ?)"
        )
        params.extend([kw, kw, kw, kw, kw, kw, kw])
    return " AND ".join(conditions), params
