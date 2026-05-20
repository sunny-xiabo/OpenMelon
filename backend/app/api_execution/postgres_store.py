"""PostgreSQL storage backend for API execution.

This backend intentionally mirrors SQLiteStore's public API so callers can
switch storage through configuration without changing API/service code.
"""

from __future__ import annotations

import json
import logging
import re
from threading import Lock
from typing import Any

from app.api_execution.sqlite_schema import API_EXECUTION_SCHEMA_SQL
from app.api_execution.sqlite_store import SQLiteStore

logger = logging.getLogger(__name__)


class PostgresRow(dict):
    """Row adapter compatible with sqlite3.Row usage in SQLiteStore."""

    def __init__(self, values: dict[str, Any]) -> None:
        super().__init__(values)
        self._keys = list(values.keys())

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return dict.__getitem__(self, self._keys[key])
        value = dict.__getitem__(self, key)
        if key == "data" and not isinstance(value, str):
            return json.dumps(value, ensure_ascii=False)
        return value


class PostgresCursor:
    def __init__(self, cursor: Any) -> None:
        self._cursor = cursor

    @property
    def rowcount(self) -> int:
        return int(self._cursor.rowcount or 0)

    def fetchone(self) -> PostgresRow | None:
        row = self._cursor.fetchone()
        return PostgresRow(row) if row is not None else None

    def fetchall(self) -> list[PostgresRow]:
        return [PostgresRow(row) for row in self._cursor.fetchall()]


class PostgresConnection:
    def __init__(self, database_url: str) -> None:
        try:
            import psycopg
            from psycopg.rows import dict_row
        except Exception as exc:  # pragma: no cover - import guarded by optional extra
            raise RuntimeError("Install PostgreSQL runtime dependencies with: uv sync --extra postgres") from exc
        self._conn = psycopg.connect(database_url, row_factory=dict_row)

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> PostgresCursor:
        cursor = self._conn.execute(_translate_sql(sql), tuple(_adapt_param(item) for item in params))
        return PostgresCursor(cursor)

    def executescript(self, script: str) -> None:
        for statement in _split_sql_script(script):
            self.execute(statement)

    def commit(self) -> None:
        self._conn.commit()

    def close(self) -> None:
        self._conn.close()


class PostgresStore(SQLiteStore):
    """PostgreSQL-backed store with the same public API as SQLiteStore."""

    storage_engine = "postgres"

    def __init__(self, database_url: str) -> None:
        if not database_url:
            raise ValueError("DATABASE_URL is required when STORAGE_BACKEND=postgres")
        self._last_event_log_prune_at = 0.0
        self._database_url = database_url
        self._conn = PostgresConnection(database_url)
        self._lock = Lock()
        self._init_schema()

    @property
    def db_path(self):  # noqa: ANN201 - kept for readiness code compatibility
        return "postgresql"

    def _init_schema(self) -> None:
        self._conn.executescript(_postgres_schema_sql())
        self._ensure_column("runs", "environment_name", "TEXT DEFAULT ''")
        self._conn.execute(
            """
            UPDATE runs
            SET environment_name = COALESCE(data #>> '{execution_options,environment_snapshot,name}', '')
            WHERE environment_name = ''
            """
        )
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_environment_name ON runs(environment_name)")
        self._ensure_column("knowledge_items", "status", "TEXT DEFAULT ''")
        self._conn.execute(
            """
            UPDATE knowledge_items
            SET status = COALESCE(NULLIF(data #>> '{status}', ''), 'active')
            WHERE status = ''
            """
        )
        self._conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge_items(status);
            CREATE INDEX IF NOT EXISTS idx_knowledge_project_status_created ON knowledge_items(project_id, status, created_at);
            CREATE INDEX IF NOT EXISTS idx_knowledge_type_status_created ON knowledge_items(item_type, status, created_at);
        """)
        self._conn.commit()

    def _table_columns(self, table: str) -> set[str]:
        rows = self._query(
            """
            SELECT column_name AS name
            FROM information_schema.columns
            WHERE table_schema = 'public' AND table_name = ?
            """,
            (table,),
        )
        return {row["name"] for row in rows}

    def _upsert(self, table: str, id_col: str, id_val: str, columns: dict[str, Any], data: dict) -> None:
        cols = list(columns.keys())
        vals = [_adapt_param(value) for value in columns.values()]
        all_cols = [id_col, "data"] + cols
        placeholders = ", ".join(["%s"] * len(all_cols))
        col_names = ", ".join(_quote_ident(col) for col in all_cols)
        update_cols = ["data = EXCLUDED.data"] + [f"{_quote_ident(col)} = EXCLUDED.{_quote_ident(col)}" for col in cols]
        sql = (
            f"INSERT INTO {_quote_ident(table)} ({col_names}) VALUES ({placeholders}) "
            f"ON CONFLICT ({_quote_ident(id_col)}) DO UPDATE SET {', '.join(update_cols)}"
        )
        self._conn.execute(sql, (id_val, _jsonb(data), *vals))
        self._conn.commit()

    def _replace(self, table: str, columns: dict[str, Any]) -> None:
        cols = list(columns.keys())
        placeholders = ", ".join(["%s"] * len(cols))
        col_names = ", ".join(_quote_ident(col) for col in cols)
        conflict_col = cols[0]
        updates = ", ".join(f"{_quote_ident(col)} = EXCLUDED.{_quote_ident(col)}" for col in cols[1:])
        values = tuple(_adapt_param(value) for value in columns.values())
        sql = (
            f"INSERT INTO {_quote_ident(table)} ({col_names}) VALUES ({placeholders}) "
            f"ON CONFLICT ({_quote_ident(conflict_col)}) DO UPDATE SET {updates}"
        )
        self._conn.execute(sql, values)

    def _row_to_data(self, row: PostgresRow | None) -> dict[str, Any] | None:
        if row is None:
            return None
        value = dict.__getitem__(row, "data")
        if isinstance(value, str):
            return json.loads(value)
        return value


def _postgres_schema_sql() -> str:
    sql = API_EXECUTION_SCHEMA_SQL
    sql = re.sub(r"\bdata TEXT NOT NULL\b", "data JSONB NOT NULL", sql)
    return sql


def _translate_sql(sql: str) -> str:
    translated = sql.replace("?", "%s")
    translated = translated.replace("LIMIT -1 OFFSET %s", "OFFSET %s")
    return translated


def _adapt_param(value: Any) -> Any:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return value
        if isinstance(parsed, (dict, list)):
            return _jsonb(parsed)
    if isinstance(value, (dict, list)):
        return _jsonb(value)
    return value


def _jsonb(value: Any) -> Any:
    try:
        from psycopg.types.json import Jsonb
    except Exception as exc:  # pragma: no cover - import guarded by optional extra
        raise RuntimeError("Install PostgreSQL runtime dependencies with: uv sync --extra postgres") from exc
    return Jsonb(value)


def _split_sql_script(script: str) -> list[str]:
    return [part.strip() for part in script.split(";") if part.strip()]


def _quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'
