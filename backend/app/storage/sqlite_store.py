"""Shared SQLite connection and base store infrastructure.

All modules that need SQLite storage should subclass BaseSQLiteStore
or use get_shared_connection() to share a single DB file.
"""

import json
import logging
import sqlite3
from pathlib import Path
from threading import Lock
from typing import Any

logger = logging.getLogger(__name__)

from app.runtime_paths import DB_DIR as _DEFAULT_DB_DIR
_shared_connections: dict[Path, sqlite3.Connection] = {}
_shared_locks: dict[Path, Lock] = {}
_shared_lock = Lock()


def get_shared_connection(db_path: Path | None = None) -> sqlite3.Connection:
    """Return the shared SQLite connection for a DB file. Thread-safe."""
    path = (db_path or (_DEFAULT_DB_DIR / "openmelon.db")).expanduser().resolve()
    existing = _shared_connections.get(path)
    if existing is not None:
        return existing
    with _shared_lock:
        existing = _shared_connections.get(path)
        if existing is not None:
            return existing
        path.parent.mkdir(parents=True, exist_ok=True)
        conn = sqlite3.connect(str(path), check_same_thread=False)
        conn.execute("PRAGMA journal_mode=WAL")
        conn.execute("PRAGMA busy_timeout=5000")
        conn.row_factory = sqlite3.Row
        _shared_connections[path] = conn
        _shared_locks[path] = Lock()
        logger.info("Shared SQLite connection opened: %s", path)
        return conn


def get_shared_lock(db_path: Path | None = None) -> Lock:
    """Return the shared Lock for a DB file. Ensures connection exists first."""
    path = (db_path or (_DEFAULT_DB_DIR / "openmelon.db")).expanduser().resolve()
    # Ensure connection (and lock) is initialized
    if path not in _shared_locks:
        get_shared_connection(db_path)
    return _shared_locks[path]


class BaseSQLiteStore:
    """Base class for module-specific SQLite stores.

    Subclasses define their schema in _init_schema() and add domain methods.
    All instances sharing the same db_path will use a single connection.
    """

    def __init__(self, db_path: Path | None = None) -> None:
        self._db_path = (db_path or (_DEFAULT_DB_DIR / "openmelon.db")).expanduser().resolve()
        self._conn = get_shared_connection(db_path)
        self._lock = get_shared_lock(db_path)
        self._init_schema()

    def _init_schema(self) -> None:
        """Override in subclasses to CREATE TABLE / INDEX."""

    # ---- low-level helpers ----

    @property
    def db_path(self) -> Path:
        return self._db_path

    def _enable_foreign_keys(self) -> None:
        self._conn.execute("PRAGMA foreign_keys = ON")

    def _table_columns(self, table: str) -> set[str]:
        return {row["name"] for row in self._query(f"PRAGMA table_info({table})")}

    def _query(self, sql: str, params: tuple = ()) -> list[sqlite3.Row]:
        return self._conn.execute(sql, params).fetchall()

    def _query_one(self, sql: str, params: tuple = ()) -> sqlite3.Row | None:
        return self._conn.execute(sql, params).fetchone()

    def _execute(self, sql: str, params: tuple = ()) -> None:
        self._conn.execute(sql, params)
        self._conn.commit()

    def _upsert(self, table: str, id_col: str, id_val: str, columns: dict[str, Any], data: dict) -> None:
        cols = list(columns.keys())
        vals = list(columns.values())
        placeholders = ", ".join(["?"] * (len(cols) + 2))
        col_names = ", ".join([id_col, "data"] + cols)
        update_cols = ["data = excluded.data"] + [f"{c} = excluded.{c}" for c in cols]
        update_clause = ", ".join(update_cols)
        self._conn.execute(
            f"INSERT INTO {table} ({col_names}) VALUES ({placeholders})"
            f" ON CONFLICT({id_col}) DO UPDATE SET {update_clause}",
            (id_val, json.dumps(data, ensure_ascii=False)) + tuple(vals),
        )
        self._conn.commit()

    def _replace(self, table: str, columns: dict[str, Any]) -> None:
        col_names = ", ".join(columns.keys())
        placeholders = ", ".join(["?"] * len(columns))
        self._conn.execute(
            f"INSERT OR REPLACE INTO {table} ({col_names}) VALUES ({placeholders})",
            tuple(columns.values()),
        )

    def _row_to_data(self, row: sqlite3.Row | None) -> dict[str, Any] | None:
        if row is None:
            return None
        return json.loads(row["data"])
