from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
from threading import RLock
from typing import Any
from uuid import uuid4


TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


@dataclass
class IndexGovernanceTask:
    task_id: str
    asset_key: str
    operation: str
    status: str = "queued"
    total: int = 0
    processed: int = 0
    failed: int = 0
    message: str = "任务已进入队列"
    error: str = ""
    result: dict[str, Any] = field(default_factory=dict)
    cancel_requested: bool = False
    retry_of: str | None = None
    created_at: str = field(default_factory=_now_iso)
    updated_at: str = field(default_factory=_now_iso)

    def to_dict(self) -> dict[str, Any]:
        return asdict(self)


class IndexGovernanceTaskManager:
    def __init__(self) -> None:
        self._lock = RLock()
        self._tasks: dict[str, IndexGovernanceTask] = {}
        self._order: list[str] = []

    def create(self, *, asset_key: str, operation: str, retry_of: str | None = None) -> IndexGovernanceTask:
        task = IndexGovernanceTask(
            task_id=f"igt_{uuid4().hex[:12]}",
            asset_key=asset_key,
            operation=operation,
            retry_of=retry_of,
        )
        with self._lock:
            self._tasks[task.task_id] = task
            self._order.insert(0, task.task_id)
            self._trim_locked()
            return task

    def get(self, task_id: str) -> IndexGovernanceTask | None:
        with self._lock:
            return self._tasks.get(task_id)

    def list(self, limit: int = 20) -> list[IndexGovernanceTask]:
        with self._lock:
            return [self._tasks[task_id] for task_id in self._order[:limit] if task_id in self._tasks]

    def update(self, task_id: str, **changes: Any) -> IndexGovernanceTask | None:
        with self._lock:
            task = self._tasks.get(task_id)
            if task is None:
                return None
            for key, value in changes.items():
                if hasattr(task, key):
                    setattr(task, key, value)
            task.updated_at = _now_iso()
            return task

    def request_cancel(self, task_id: str) -> IndexGovernanceTask | None:
        return self.update(task_id, cancel_requested=True, message="已请求取消，等待当前批次结束")

    def is_cancel_requested(self, task_id: str) -> bool:
        with self._lock:
            return bool(self._tasks.get(task_id) and self._tasks[task_id].cancel_requested)

    def _trim_locked(self) -> None:
        keep = set(self._order[:100])
        self._order = self._order[:100]
        for task_id in list(self._tasks):
            if task_id not in keep:
                self._tasks.pop(task_id, None)


task_manager = IndexGovernanceTaskManager()
