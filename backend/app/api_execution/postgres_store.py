"""PostgreSQL storage backend for API execution."""

import logging
from typing import Any

from app.api_execution.api_execution_schema import API_EXECUTION_SCHEMA_SQL
from app.api_execution.api_execution_store import APIExecutionStoreBase
from app.storage.postgres_store import (
    PostgresConnection,
    PostgresCursor,
    PostgresRow,
    adapt_param,
    jsonb,
    postgres_schema_from_text,
    quote_ident,
    split_sql_script,
    translate_sql,
)

logger = logging.getLogger(__name__)


class PostgresStore(APIExecutionStoreBase):
    """PostgreSQL-backed store with the same public API as the runtime store."""

    storage_engine = "postgres"

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
    return postgres_schema_from_text(API_EXECUTION_SCHEMA_SQL)


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
