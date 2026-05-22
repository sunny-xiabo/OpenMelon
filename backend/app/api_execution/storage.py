"""API execution storage entrypoint.

PostgreSQL is the only runtime backend.
"""

import logging
from contextlib import contextmanager
from collections.abc import Iterator
from pathlib import Path
from typing import Any

from app.config import settings
from app.api_execution.postgres_store import PostgresStore

logger = logging.getLogger(__name__)


class APIExecutionStore(PostgresStore):
    """Backward-compatible store constructor used by tests and callers."""

    def __init__(self, db_path: Path | None = None, database_url: str | None = None) -> None:
        _ = db_path
        super().__init__(database_url or settings.DATABASE_URL)


def _create_default_store() -> Any:
    logger.info("Using PostgreSQL API execution store")
    return PostgresStore(settings.DATABASE_URL)


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
