"""Shared PostgreSQL store infrastructure.

The runtime PostgreSQL path keeps the same helper surface so module stores can
preserve their domain methods while switching connections.
"""

from __future__ import annotations

import json
import re
from threading import Lock, RLock
from typing import Any

from app.config import settings


_POOL_LOCK = RLock()
_POOLS: dict[str, Any] = {}


class PostgresRow(dict):
    """Row adapter compatible with mapping-style row access."""

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
    def __init__(self, rows: list[Any] | None = None, rowcount: int = 0) -> None:
        self._rows = list(rows or [])
        self._rowcount = rowcount
        self._position = 0

    @property
    def rowcount(self) -> int:
        return int(self._rowcount or 0)

    def fetchone(self) -> PostgresRow | None:
        if self._position >= len(self._rows):
            return None
        row = self._rows[self._position]
        self._position += 1
        return PostgresRow(row) if row is not None else None

    def fetchall(self) -> list[PostgresRow]:
        rows = self._rows[self._position :]
        self._position = len(self._rows)
        return [PostgresRow(row) for row in rows]


class PostgresConnection:
    def __init__(self, database_url: str) -> None:
        self._database_url = database_url
        self._pool = get_postgres_pool(database_url)

    def execute(self, sql: str, params: tuple[Any, ...] = ()) -> PostgresCursor:
        with self._pool.connection() as conn:
            cursor = conn.execute(
                translate_sql(sql),
                tuple(adapt_param(item) for item in params),
            )
            return materialize_cursor(cursor)

    def executemany(self, sql: str, params_seq: list[tuple[Any, ...]] | tuple[tuple[Any, ...], ...]) -> None:
        translated = translate_sql(sql)
        with self._pool.connection() as conn:
            with conn.cursor() as cursor:
                cursor.executemany(
                    translated,
                    [tuple(adapt_param(item) for item in params) for params in params_seq],
                )

    def executescript(self, script: str) -> None:
        for statement in split_sql_script(script):
            self.execute(statement)

    def commit(self) -> None:
        return None

    def close(self) -> None:
        return None


def get_postgres_pool(database_url: str) -> Any:
    if not database_url:
        raise ValueError("DATABASE_URL is required for PostgreSQL runtime")
    with _POOL_LOCK:
        pool = _POOLS.get(database_url)
        if pool is not None:
            return pool
        try:
            from psycopg.rows import dict_row
            from psycopg_pool import ConnectionPool
        except Exception as exc:  # pragma: no cover - import guarded by optional extra
            raise RuntimeError(
                "Install PostgreSQL runtime dependencies with: uv sync --extra postgres"
            ) from exc
        pool = ConnectionPool(
            conninfo=database_url,
            min_size=max(0, int(settings.POSTGRES_POOL_MIN_SIZE or 0)),
            max_size=max(1, int(settings.POSTGRES_POOL_MAX_SIZE or 1)),
            timeout=max(1.0, float(settings.POSTGRES_POOL_TIMEOUT_S or 30.0)),
            kwargs={"row_factory": dict_row, "autocommit": True},
            open=True,
        )
        _POOLS[database_url] = pool
        return pool


def close_postgres_pools() -> None:
    with _POOL_LOCK:
        pools = list(_POOLS.values())
        _POOLS.clear()
    for pool in pools:
        pool.close()


def materialize_cursor(cursor: Any) -> PostgresCursor:
    rowcount = int(cursor.rowcount or 0)
    rows: list[Any] = []
    if getattr(cursor, "description", None):
        rows = cursor.fetchall()
    return PostgresCursor(rows=rows, rowcount=rowcount)


class BasePostgresStore:
    storage_engine = "postgres"

    def __init__(self, database_url: str) -> None:
        if not database_url:
            raise ValueError("DATABASE_URL is required for PostgreSQL runtime")
        self._database_url = database_url
        self._conn = PostgresConnection(database_url)
        self._lock = Lock()
        self._init_schema()

    @property
    def db_path(self) -> str:
        return "postgresql"

    def _init_schema(self) -> None:
        """Override in subclasses to CREATE TABLE / INDEX."""

    def _enable_foreign_keys(self) -> None:
        return None

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

    def _query(self, sql: str, params: tuple = ()) -> list[PostgresRow]:
        return self._conn.execute(sql, params).fetchall()

    def _query_one(self, sql: str, params: tuple = ()) -> PostgresRow | None:
        return self._conn.execute(sql, params).fetchone()

    def _execute(self, sql: str, params: tuple = ()) -> None:
        self._conn.execute(sql, params)
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

    def _replace(self, table: str, columns: dict[str, Any]) -> None:
        cols = list(columns.keys())
        placeholders = ", ".join(["%s"] * len(cols))
        col_names = ", ".join(quote_ident(col) for col in cols)
        conflict_col = cols[0]
        updates = ", ".join(
            f"{quote_ident(col)} = EXCLUDED.{quote_ident(col)}" for col in cols[1:]
        )
        values = tuple(adapt_param(value) for value in columns.values())
        sql = (
            f"INSERT INTO {quote_ident(table)} ({col_names}) VALUES ({placeholders}) "
            f"ON CONFLICT ({quote_ident(conflict_col)}) DO UPDATE SET {updates}"
        )
        self._conn.execute(sql, values)

    def _row_to_data(self, row: PostgresRow | None) -> dict[str, Any] | None:
        if row is None:
            return None
        value = dict.__getitem__(row, "data")
        if isinstance(value, str):
            return json.loads(value)
        return value


def postgres_schema_from_text(sql: str) -> str:
    return re.sub(r"\bdata TEXT NOT NULL\b", "data JSONB NOT NULL", sql)


def translate_sql(sql: str) -> str:
    translated = sql.replace("?", "%s")
    translated = translated.replace("LIMIT -1 OFFSET %s", "OFFSET %s")
    return translated


def adapt_param(value: Any) -> Any:
    if isinstance(value, str):
        try:
            parsed = json.loads(value)
        except Exception:
            return value
        if isinstance(parsed, (dict, list)):
            return jsonb(parsed)
    if isinstance(value, (dict, list)):
        return jsonb(value)
    return value


def jsonb(value: Any) -> Any:
    try:
        from psycopg.types.json import Jsonb
    except Exception as exc:  # pragma: no cover - import guarded by optional extra
        raise RuntimeError(
            "Install PostgreSQL runtime dependencies with: uv sync --extra postgres"
        ) from exc
    return Jsonb(value)


def split_sql_script(script: str) -> list[str]:
    return [part.strip() for part in script.split(";") if part.strip()]


def quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'
