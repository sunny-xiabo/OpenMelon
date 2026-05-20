"""SQLite to PostgreSQL migration drill helpers.

These helpers are intentionally separate from runtime storage. They prepare
and verify a one-time migration into PostgreSQL without changing the active
SQLite-backed application path.
"""

from __future__ import annotations

import hashlib
import json
import sqlite3
from dataclasses import dataclass
from pathlib import Path
from typing import Any


SQLITE_TO_PG_TYPE = {
    "INTEGER": "INTEGER",
    "INT": "INTEGER",
    "REAL": "DOUBLE PRECISION",
    "BLOB": "BYTEA",
}


@dataclass(frozen=True)
class SQLiteColumn:
    name: str
    sqlite_type: str
    not_null: bool
    default: str | None
    primary_order: int


@dataclass(frozen=True)
class SQLiteIndex:
    name: str
    columns: tuple[str, ...]
    unique: bool


@dataclass(frozen=True)
class SQLiteTable:
    name: str
    columns: tuple[SQLiteColumn, ...]
    indexes: tuple[SQLiteIndex, ...]
    row_count: int

    @property
    def primary_key(self) -> tuple[str, ...]:
        return tuple(column.name for column in sorted(self.columns, key=lambda item: item.primary_order) if column.primary_order)

    @property
    def data_column(self) -> str | None:
        return "data" if any(column.name == "data" for column in self.columns) else None


def inspect_sqlite_database(db_path: Path | str) -> list[SQLiteTable]:
    path = Path(db_path)
    conn = sqlite3.connect(str(path))
    conn.row_factory = sqlite3.Row
    try:
        tables = [
            row["name"]
            for row in conn.execute(
                """
                SELECT name
                FROM sqlite_master
                WHERE type = 'table'
                  AND name NOT LIKE 'sqlite_%'
                ORDER BY name
                """
            )
        ]
        return [_inspect_table(conn, table) for table in tables]
    finally:
        conn.close()


def build_postgres_schema_sql(tables: list[SQLiteTable]) -> str:
    statements: list[str] = []
    for table in tables:
        statements.append(build_create_table_sql(table))
        statements.extend(build_index_sql(table))
    return "\n\n".join(statements) + ("\n" if statements else "")


def build_create_table_sql(table: SQLiteTable) -> str:
    column_defs = []
    primary_key = table.primary_key
    for column in table.columns:
        column_def = f"{quote_ident(column.name)} {_postgres_type(column)}"
        if column.not_null or column.primary_order:
            column_def += " NOT NULL"
        if column.default is not None and _safe_default(column.default):
            column_def += f" DEFAULT {column.default}"
        column_defs.append(column_def)
    if primary_key:
        column_defs.append("PRIMARY KEY (" + ", ".join(quote_ident(column) for column in primary_key) + ")")
    joined = ",\n    ".join(column_defs)
    return f"CREATE TABLE IF NOT EXISTS {quote_ident(table.name)} (\n    {joined}\n);"


def build_index_sql(table: SQLiteTable) -> list[str]:
    statements: list[str] = []
    primary_key = set(table.primary_key)
    for index in table.indexes:
        if not index.columns or set(index.columns) == primary_key:
            continue
        unique = "UNIQUE " if index.unique else ""
        columns = ", ".join(quote_ident(column) for column in index.columns)
        statements.append(f"CREATE {unique}INDEX IF NOT EXISTS {quote_ident(index.name)} ON {quote_ident(table.name)} ({columns});")
    if table.data_column:
        statements.append(
            f"CREATE INDEX IF NOT EXISTS {quote_ident(f'idx_{table.name}_data_gin')} "
            f"ON {quote_ident(table.name)} USING GIN ({quote_ident(table.data_column)});"
        )
    return statements


def build_migration_plan(db_path: Path | str) -> dict[str, Any]:
    tables = inspect_sqlite_database(db_path)
    return {
        "database_path": str(Path(db_path)),
        "table_count": len(tables),
        "total_rows": sum(table.row_count for table in tables),
        "tables": [
            {
                "table": table.name,
                "row_count": table.row_count,
                "primary_key": list(table.primary_key),
                "columns": [
                    {
                        "name": column.name,
                        "sqlite_type": column.sqlite_type,
                        "postgres_type": _postgres_type(column),
                        "not_null": column.not_null or bool(column.primary_order),
                    }
                    for column in table.columns
                ],
                "indexes": [
                    {"name": index.name, "columns": list(index.columns), "unique": index.unique}
                    for index in table.indexes
                ],
                "pg_strategy": "indexed columns + data JSONB" if table.data_column else "plain relational table",
            }
            for table in tables
        ],
    }


def copy_sqlite_to_postgres(
    *,
    db_path: Path | str,
    database_url: str,
    apply_schema: bool = True,
    truncate: bool = False,
    batch_size: int = 500,
) -> dict[str, Any]:
    try:
        import psycopg
        from psycopg.types.json import Jsonb
    except Exception as exc:  # pragma: no cover - depends on optional local extra
        raise RuntimeError("Install PostgreSQL migration dependencies with: uv sync --extra postgres") from exc

    tables = inspect_sqlite_database(db_path)
    sqlite_conn = sqlite3.connect(str(db_path))
    sqlite_conn.row_factory = sqlite3.Row
    copied: list[dict[str, Any]] = []
    try:
        with psycopg.connect(database_url) as pg_conn:
            with pg_conn.cursor() as cursor:
                if apply_schema:
                    cursor.execute(build_postgres_schema_sql(tables))
                if truncate:
                    for table in reversed(tables):
                        cursor.execute(f"TRUNCATE TABLE {quote_ident(table.name)}")
                for table in tables:
                    copied_rows = _copy_table(sqlite_conn, cursor, table, Jsonb, batch_size=batch_size)
                    copied.append({"table": table.name, "rows": copied_rows})
            pg_conn.commit()
    finally:
        sqlite_conn.close()
    return {"tables": copied, "total_rows": sum(item["rows"] for item in copied)}


def verify_sqlite_to_postgres(*, db_path: Path | str, database_url: str) -> dict[str, Any]:
    try:
        import psycopg
    except Exception as exc:  # pragma: no cover - depends on optional local extra
        raise RuntimeError("Install PostgreSQL migration dependencies with: uv sync --extra postgres") from exc

    tables = inspect_sqlite_database(db_path)
    sqlite_conn = sqlite3.connect(str(db_path))
    sqlite_conn.row_factory = sqlite3.Row
    results: list[dict[str, Any]] = []
    try:
        with psycopg.connect(database_url) as pg_conn:
            with pg_conn.cursor() as cursor:
                for table in tables:
                    results.append(_verify_table(sqlite_conn, cursor, table))
    finally:
        sqlite_conn.close()
    return {
        "ok": all(item["ok"] for item in results),
        "tables": results,
    }


def compare_sqlite_to_postgres(*, db_path: Path | str, database_url: str, sample_size: int = 5) -> dict[str, Any]:
    verification = verify_sqlite_to_postgres(db_path=db_path, database_url=database_url)
    tables = inspect_sqlite_database(db_path)
    sqlite_conn = sqlite3.connect(str(db_path))
    sqlite_conn.row_factory = sqlite3.Row
    samples: list[dict[str, Any]] = []
    try:
        for table in tables:
            primary_key = table.primary_key
            if not primary_key:
                continue
            order_by = ", ".join(quote_ident(column) for column in primary_key)
            rows = sqlite_conn.execute(
                f"SELECT {', '.join(quote_ident(column) for column in primary_key)} "
                f"FROM {quote_ident(table.name)} ORDER BY {order_by} LIMIT ?",
                (max(1, sample_size),),
            ).fetchall()
            samples.append({
                "table": table.name,
                "primary_key": list(primary_key),
                "sample_keys": [tuple(row[column] for column in primary_key) for row in rows],
            })
    finally:
        sqlite_conn.close()
    return {**verification, "samples": samples}


def quote_ident(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def canonical_json_hash(value: Any) -> str:
    return hashlib.sha256(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8")).hexdigest()


def _inspect_table(conn: sqlite3.Connection, table: str) -> SQLiteTable:
    columns = tuple(
        SQLiteColumn(
            name=row["name"],
            sqlite_type=(row["type"] or "TEXT").upper(),
            not_null=bool(row["notnull"]),
            default=row["dflt_value"],
            primary_order=int(row["pk"] or 0),
        )
        for row in conn.execute(f"PRAGMA table_info({quote_string(table)})")
    )
    indexes = []
    for index in conn.execute(f"PRAGMA index_list({quote_string(table)})"):
        index_name = index["name"]
        index_columns = tuple(
            row["name"]
            for row in conn.execute(f"PRAGMA index_info({quote_string(index_name)})")
            if row["name"]
        )
        indexes.append(SQLiteIndex(index_name, index_columns, bool(index["unique"])))
    row_count = int(conn.execute(f"SELECT COUNT(*) AS count FROM {quote_ident(table)}").fetchone()["count"])
    return SQLiteTable(table, columns, tuple(indexes), row_count)


def _postgres_type(column: SQLiteColumn) -> str:
    if column.name == "data":
        return "JSONB"
    return SQLITE_TO_PG_TYPE.get(column.sqlite_type.split("(", 1)[0], "TEXT")


def _safe_default(default: str) -> bool:
    lowered = default.strip().lower()
    return lowered.startswith("'") or lowered in {"0", "1", "100", "''"} or lowered.isdigit()


def _copy_table(
    sqlite_conn: sqlite3.Connection,
    cursor: Any,
    table: SQLiteTable,
    jsonb_type: Any,
    *,
    batch_size: int,
) -> int:
    columns = [column.name for column in table.columns]
    primary_key = table.primary_key
    order_by = ", ".join(quote_ident(column) for column in primary_key) if primary_key else "rowid"
    insert_sql = _insert_sql(table.name, columns, primary_key)
    offset = 0
    copied = 0
    while True:
        rows = sqlite_conn.execute(
            f"SELECT {', '.join(quote_ident(column) for column in columns)} FROM {quote_ident(table.name)} "
            f"ORDER BY {order_by} LIMIT ? OFFSET ?",
            (batch_size, offset),
        ).fetchall()
        if not rows:
            return copied
        payload = [_pg_values(row, columns, jsonb_type) for row in rows]
        cursor.executemany(insert_sql, payload)
        copied += len(rows)
        offset += batch_size


def _insert_sql(table: str, columns: list[str], primary_key: tuple[str, ...]) -> str:
    placeholders = ", ".join(["%s"] * len(columns))
    column_list = ", ".join(quote_ident(column) for column in columns)
    base = f"INSERT INTO {quote_ident(table)} ({column_list}) VALUES ({placeholders})"
    if not primary_key:
        return base
    update_columns = [column for column in columns if column not in primary_key]
    if not update_columns:
        return base + " ON CONFLICT DO NOTHING"
    conflict = ", ".join(quote_ident(column) for column in primary_key)
    updates = ", ".join(f"{quote_ident(column)} = EXCLUDED.{quote_ident(column)}" for column in update_columns)
    return base + f" ON CONFLICT ({conflict}) DO UPDATE SET {updates}"


def _pg_values(row: sqlite3.Row, columns: list[str], jsonb_type: Any) -> tuple[Any, ...]:
    values = []
    for column in columns:
        value = row[column]
        if column == "data":
            value = jsonb_type(json.loads(value))
        values.append(value)
    return tuple(values)


def _verify_table(sqlite_conn: sqlite3.Connection, cursor: Any, table: SQLiteTable) -> dict[str, Any]:
    cursor.execute(f"SELECT COUNT(*) FROM {quote_ident(table.name)}")
    pg_count = int(cursor.fetchone()[0])
    row_count_ok = pg_count == table.row_count
    sqlite_hash = _sqlite_table_hash(sqlite_conn, table)
    pg_hash = _postgres_table_hash(cursor, table)
    return {
        "table": table.name,
        "sqlite_rows": table.row_count,
        "postgres_rows": pg_count,
        "row_count_ok": row_count_ok,
        "sqlite_hash": sqlite_hash,
        "postgres_hash": pg_hash,
        "json_hash_ok": sqlite_hash == pg_hash,
        "ok": row_count_ok and sqlite_hash == pg_hash,
    }


def _sqlite_table_hash(conn: sqlite3.Connection, table: SQLiteTable) -> str:
    digest = hashlib.sha256()
    columns = [column.name for column in table.columns]
    order_by = ", ".join(quote_ident(column) for column in table.primary_key) if table.primary_key else "rowid"
    for row in conn.execute(
        f"SELECT {', '.join(quote_ident(column) for column in columns)} FROM {quote_ident(table.name)} ORDER BY {order_by}"
    ):
        data = {column: (json.loads(row[column]) if column == "data" else row[column]) for column in columns}
        digest.update(canonical_json_hash(data).encode("ascii"))
    return digest.hexdigest()


def _postgres_table_hash(cursor: Any, table: SQLiteTable) -> str:
    digest = hashlib.sha256()
    columns = [column.name for column in table.columns]
    order_by = ", ".join(quote_ident(column) for column in table.primary_key) if table.primary_key else ", ".join(quote_ident(column) for column in columns)
    cursor.execute(
        f"SELECT {', '.join(quote_ident(column) for column in columns)} FROM {quote_ident(table.name)} ORDER BY {order_by}"
    )
    for row in cursor.fetchall():
        data = {column: row[index] for index, column in enumerate(columns)}
        digest.update(canonical_json_hash(data).encode("ascii"))
    return digest.hexdigest()


def quote_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
