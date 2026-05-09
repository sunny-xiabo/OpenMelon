"""API execution storage entrypoint.

The API automation module now persists runtime data through SQLite only.
Legacy JSON files are read once as migration seeds when the shared DB is empty.
"""

import logging
from pathlib import Path
from typing import Any

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
            (SELECT COUNT(*) FROM policy_audits) +
            (SELECT COUNT(*) FROM automation_tasks) +
            (SELECT COUNT(*) FROM automation_definitions) +
            (SELECT COUNT(*) FROM automation_runs) +
            (SELECT COUNT(*) FROM run_stage_events) +
            (SELECT COUNT(*) FROM artifact_meta) +
            (SELECT COUNT(*) FROM knowledge_items) AS count
        """
    )
    return bool(row and row["count"] > 0)


def _create_default_store() -> Any:
    store = APIExecutionStore()
    if _sqlite_has_api_execution_data(store):
        return store

    json_dir = Path(__file__).resolve().parent.parent / "data" / "api_execution"
    count = store.migrate_from_json(json_dir)
    if count > 0:
        logger.info("Auto-migrated %d API execution records from JSON to SQLite", count)
    return store


api_execution_store = _create_default_store()
