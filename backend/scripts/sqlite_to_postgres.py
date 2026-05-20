#!/usr/bin/env python3
"""Run SQLite -> PostgreSQL migration drills.

Examples:
  uv run python backend/scripts/sqlite_to_postgres.py plan --sqlite backend/runtime/data/openmelon.db
  uv run python backend/scripts/sqlite_to_postgres.py schema --sqlite backend/runtime/data/openmelon.db
  uv run --extra postgres python backend/scripts/sqlite_to_postgres.py copy --sqlite backend/runtime/data/openmelon.db --database-url "$DATABASE_URL"
  uv run --extra postgres python backend/scripts/sqlite_to_postgres.py verify --sqlite backend/runtime/data/openmelon.db --database-url "$DATABASE_URL"
"""

from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.runtime_paths import DB_PATH
from app.storage.postgres_migration import (
    build_migration_plan,
    build_postgres_schema_sql,
    copy_sqlite_to_postgres,
    inspect_sqlite_database,
    verify_sqlite_to_postgres,
)


def main() -> int:
    parser = argparse.ArgumentParser(description="SQLite -> PostgreSQL migration drill tool")
    subparsers = parser.add_subparsers(dest="command", required=True)

    for name in ("plan", "schema", "copy", "verify"):
        command = subparsers.add_parser(name)
        command.add_argument("--sqlite", default=str(DB_PATH), help="SQLite database path")
        if name in {"copy", "verify"}:
            command.add_argument("--database-url", required=True, help="PostgreSQL connection URL")
        if name == "copy":
            command.add_argument("--batch-size", type=int, default=500)
            command.add_argument("--no-schema", action="store_true", help="Do not create PostgreSQL tables/indexes")
            command.add_argument("--truncate", action="store_true", help="Truncate target tables before copying")

    args = parser.parse_args()
    sqlite_path = Path(args.sqlite)
    if not sqlite_path.exists():
        parser.error(f"SQLite database not found: {sqlite_path}")

    if args.command == "plan":
        print(json.dumps(build_migration_plan(sqlite_path), ensure_ascii=False, indent=2))
        return 0
    if args.command == "schema":
        print(build_postgres_schema_sql(inspect_sqlite_database(sqlite_path)))
        return 0
    if args.command == "copy":
        result = copy_sqlite_to_postgres(
            db_path=sqlite_path,
            database_url=args.database_url,
            apply_schema=not args.no_schema,
            truncate=args.truncate,
            batch_size=max(1, args.batch_size),
        )
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0
    if args.command == "verify":
        result = verify_sqlite_to_postgres(db_path=sqlite_path, database_url=args.database_url)
        print(json.dumps(result, ensure_ascii=False, indent=2))
        return 0 if result["ok"] else 1
    parser.error("unknown command")
    return 2


if __name__ == "__main__":
    raise SystemExit(main())
