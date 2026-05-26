from __future__ import annotations

from dataclasses import asdict, dataclass, field
from datetime import datetime, timezone
import json
from threading import RLock
from typing import Any
from uuid import uuid4

from app.config import settings
from app.storage.postgres_store import PostgresConnection, PostgresRow


TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}
INDEX_GOVERNANCE_TASKS_SCHEMA = """
    CREATE TABLE IF NOT EXISTS index_governance_tasks (
        task_id TEXT PRIMARY KEY,
        asset_key TEXT DEFAULT '',
        operation TEXT DEFAULT '',
        status TEXT DEFAULT '',
        created_at TEXT DEFAULT '',
        updated_at TEXT DEFAULT '',
        data JSONB NOT NULL
    );
    CREATE INDEX IF NOT EXISTS idx_index_governance_tasks_status ON index_governance_tasks(status);
    CREATE INDEX IF NOT EXISTS idx_index_governance_tasks_asset ON index_governance_tasks(asset_key);
    CREATE INDEX IF NOT EXISTS idx_index_governance_tasks_created ON index_governance_tasks(created_at);
"""


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
    def __init__(self, database_url: str | None = None) -> None:
        self._lock = RLock()
        self._conn = PostgresConnection(database_url or settings.DATABASE_URL)
        self._conn.executescript(INDEX_GOVERNANCE_TASKS_SCHEMA)

    def create(self, *, asset_key: str, operation: str, retry_of: str | None = None) -> IndexGovernanceTask:
        task = IndexGovernanceTask(
            task_id=f"igt_{uuid4().hex[:12]}",
            asset_key=asset_key,
            operation=operation,
            retry_of=retry_of,
        )
        with self._lock:
            self._save_locked(task)
            return task

    def get(self, task_id: str) -> IndexGovernanceTask | None:
        with self._lock:
            row = self._conn.execute(
                "SELECT data FROM index_governance_tasks WHERE task_id = ?",
                (task_id,),
            ).fetchone()
            return self._task_from_row(row)

    def list(self, limit: int = 20) -> list[IndexGovernanceTask]:
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT data FROM index_governance_tasks
                ORDER BY created_at DESC
                LIMIT ?
                """,
                (max(1, min(int(limit or 20), 100)),),
            ).fetchall()
            return [task for row in rows if (task := self._task_from_row(row)) is not None]

    def update(self, task_id: str, **changes: Any) -> IndexGovernanceTask | None:
        with self._lock:
            task = self.get(task_id)
            if task is None:
                return None
            for key, value in changes.items():
                if hasattr(task, key):
                    setattr(task, key, value)
            task.updated_at = _now_iso()
            self._save_locked(task)
            return task

    def request_cancel(self, task_id: str) -> IndexGovernanceTask | None:
        return self.update(task_id, cancel_requested=True, message="已请求取消，等待当前批次结束")

    def is_cancel_requested(self, task_id: str) -> bool:
        with self._lock:
            task = self.get(task_id)
            return bool(task and task.cancel_requested)

    def recover_stale_tasks(self) -> list[str]:
        recovered: list[str] = []
        with self._lock:
            rows = self._conn.execute(
                """
                SELECT data FROM index_governance_tasks
                WHERE status IN ('queued', 'running')
                ORDER BY created_at DESC
                """
            ).fetchall()
            for row in rows:
                task = self._task_from_row(row)
                if task is None:
                    continue
                task.status = "failed"
                task.error = "服务重启后任务未自动恢复"
                task.message = "服务重启后未自动恢复，请手动重试"
                task.updated_at = _now_iso()
                self._save_locked(task)
                recovered.append(task.task_id)
        return recovered

    def _trim_locked(self) -> None:
        rows = self._conn.execute(
            """
            SELECT task_id FROM index_governance_tasks
            ORDER BY created_at DESC
            OFFSET 100
            """
        ).fetchall()
        for row in rows:
            self._conn.execute(
                "DELETE FROM index_governance_tasks WHERE task_id = ?",
                (row["task_id"],),
            )

    def _save_locked(self, task: IndexGovernanceTask) -> None:
        data = task.to_dict()
        self._conn.execute(
            """
            INSERT INTO index_governance_tasks (
                task_id, asset_key, operation, status, created_at, updated_at, data
            )
            VALUES (?, ?, ?, ?, ?, ?, ?)
            ON CONFLICT (task_id) DO UPDATE SET
                asset_key = EXCLUDED.asset_key,
                operation = EXCLUDED.operation,
                status = EXCLUDED.status,
                created_at = EXCLUDED.created_at,
                updated_at = EXCLUDED.updated_at,
                data = EXCLUDED.data
            """,
            (
                task.task_id,
                task.asset_key,
                task.operation,
                task.status,
                task.created_at,
                task.updated_at,
                data,
            ),
        )
        self._trim_locked()

    @staticmethod
    def _task_from_row(row: PostgresRow | None) -> IndexGovernanceTask | None:
        if row is None:
            return None
        raw = dict.__getitem__(row, "data")
        if isinstance(raw, str):
            raw = json.loads(raw)
        if not isinstance(raw, dict):
            return None
        fields = {field_name: raw.get(field_name) for field_name in IndexGovernanceTask.__dataclass_fields__}
        return IndexGovernanceTask(**fields)


task_manager = IndexGovernanceTaskManager()
