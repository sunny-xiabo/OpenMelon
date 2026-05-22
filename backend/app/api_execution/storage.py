"""API execution storage entrypoint.

SQLite remains the default runtime. PostgreSQL is available only when
STORAGE_BACKEND=postgres is explicitly configured.
"""

import logging
from contextlib import contextmanager
from pathlib import Path
from collections.abc import Iterator
from typing import Any

from app.config import settings
from app.api_execution.sqlite_store import SQLiteStore

logger = logging.getLogger(__name__)


class APIExecutionStore(SQLiteStore):
    """Backward-compatible SQLite store constructor used by tests and callers."""

    def __init__(self, db_path: Path | None = None) -> None:
        resolved = db_path
        if resolved is not None:
            resolved = Path(resolved)
            if resolved.suffix != ".db":
                resolved = resolved / "api_execution.db"
        super().__init__(resolved)


def _sqlite_has_api_execution_data(store: SQLiteStore) -> bool:
    row = store._query_one(
        """
        SELECT
            (SELECT COUNT(*) FROM runs) +
            (SELECT COUNT(*) FROM projects) +
            (SELECT COUNT(*) FROM environments) +
            (SELECT COUNT(*) FROM specs) +
            (SELECT COUNT(*) FROM api_spec_versions) +
            (SELECT COUNT(*) FROM api_modules) +
            (SELECT COUNT(*) FROM api_interfaces) +
            (SELECT COUNT(*) FROM policy_audits) +
            (SELECT COUNT(*) FROM automation_tasks) +
            (SELECT COUNT(*) FROM automation_definitions) +
            (SELECT COUNT(*) FROM automation_runs) +
            (SELECT COUNT(*) FROM run_stage_events) +
            (SELECT COUNT(*) FROM artifact_meta) +
            (SELECT COUNT(*) FROM knowledge_items) +
            (SELECT COUNT(*) FROM event_logs) AS count
        """
    )
    return bool(row and row["count"] > 0)


def _create_default_store() -> Any:
    storage_backend = (settings.STORAGE_BACKEND or "sqlite").strip().lower()
    if storage_backend == "postgres":
        from app.api_execution.postgres_store import PostgresStore

        logger.info("Using PostgreSQL API execution store")
        return PostgresStore(settings.DATABASE_URL)
    if storage_backend != "sqlite":
        raise ValueError(f"Unsupported STORAGE_BACKEND: {settings.STORAGE_BACKEND}")

    store = APIExecutionStore()
    if _sqlite_has_api_execution_data(store):
        return store

    json_dir = Path(__file__).resolve().parent.parent / "data" / "api_execution"
    count = store.migrate_from_json(json_dir)
    if count > 0:
        logger.info("Auto-migrated %d API execution records from JSON to SQLite", count)
    return store


api_execution_store = _create_default_store()
_api_execution_store = api_execution_store


def get_api_execution_store() -> Any:
    """Return the active API execution store.

    The module-level api_execution_store is kept for backward compatibility;
    new execution paths should resolve the store at call time via this helper.
    """
    return _api_execution_store


@contextmanager
def override_api_execution_store(store: Any) -> Iterator[Any]:
    """Temporarily replace the active store, mainly for isolated tests."""
    global api_execution_store, _api_execution_store
    previous = _api_execution_store
    previous_public = api_execution_store
    _api_execution_store = store
    api_execution_store = store
    try:
        yield store
    finally:
        _api_execution_store = previous
        api_execution_store = previous_public
