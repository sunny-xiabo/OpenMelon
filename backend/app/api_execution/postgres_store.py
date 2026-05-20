"""PostgreSQL storage backend for API execution.

This backend intentionally mirrors SQLiteStore's public API so callers can
switch storage through configuration without changing API/service code.
"""

import logging
from typing import Any

from app.api_execution.sqlite_schema import API_EXECUTION_SCHEMA_SQL
from app.api_execution.sqlite_store import SQLiteStore
from app.storage.postgres_store import (
    BasePostgresStore,
    PostgresConnection,
    PostgresCursor,
    PostgresRow,
    adapt_param,
    jsonb,
    postgres_schema_from_sqlite,
    quote_ident,
    split_sql_script,
    translate_sql,
)

logger = logging.getLogger(__name__)


class PostgresStore(BasePostgresStore, SQLiteStore):
    """PostgreSQL-backed store with the same public API as SQLiteStore."""

    storage_engine = "postgres"

    def __init__(self, database_url: str) -> None:
        self._last_event_log_prune_at = 0.0
        super().__init__(database_url)

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

    def _upsert(self, table: str, id_col: str, id_val: str, columns: dict[str, Any], data: dict) -> None:
        cols = list(columns.keys())
        vals = [adapt_param(value) for value in columns.values()]
        all_cols = [id_col, "data"] + cols
        placeholders = ", ".join(["%s"] * len(all_cols))
        col_names = ", ".join(quote_ident(col) for col in all_cols)
        update_cols = ["data = EXCLUDED.data"] + [
            f"{quote_ident(col)} = EXCLUDED.{quote_ident(col)}" for col in cols
        ]
        sql = (
            f"INSERT INTO {quote_ident(table)} ({col_names}) VALUES ({placeholders}) "
            f"ON CONFLICT ({quote_ident(id_col)}) DO UPDATE SET {', '.join(update_cols)}"
        )
        self._conn.execute(sql, (id_val, jsonb(data), *vals))
        self._conn.commit()


def _postgres_schema_sql() -> str:
    return postgres_schema_from_sqlite(API_EXECUTION_SCHEMA_SQL)


def _translate_sql(sql: str) -> str:
    return translate_sql(sql)


__all__ = [
    "PostgresConnection",
    "PostgresCursor",
    "PostgresRow",
    "PostgresStore",
    "_postgres_schema_sql",
    "_translate_sql",
    "adapt_param",
    "jsonb",
    "quote_ident",
    "split_sql_script",
    "translate_sql",
]
