import asyncio
from dataclasses import dataclass
from typing import Any

from app.api_execution.utils import now_iso


@dataclass
class DirectExecution:
    task: asyncio.Task
    request: Any
    started_at: str


_active_executions: dict[str, DirectExecution] = {}
_cancelled_execution_ids: set[str] = set()


def register_direct_execution(execution_id: str, task: asyncio.Task, request: Any) -> None:
    if not execution_id:
        return
    _cancelled_execution_ids.discard(execution_id)
    _active_executions[execution_id] = DirectExecution(task=task, request=request, started_at=now_iso())


def unregister_direct_execution(execution_id: str) -> None:
    if not execution_id:
        return
    _active_executions.pop(execution_id, None)
    _cancelled_execution_ids.discard(execution_id)


def is_direct_execution_cancelled(execution_id: str | None) -> bool:
    return bool(execution_id and execution_id in _cancelled_execution_ids)


def cancel_direct_execution(execution_id: str) -> dict[str, Any] | None:
    if not execution_id:
        return None
    _cancelled_execution_ids.add(execution_id)
    active = _active_executions.get(execution_id)
    if active:
        active.task.cancel()
        return {
            "execution_id": execution_id,
            "status": "cancelled",
            "active": True,
            "started_at": active.started_at,
        }
    return {"execution_id": execution_id, "status": "cancelled", "active": False}
