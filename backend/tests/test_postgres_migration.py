import json
import sqlite3

from app.storage.postgres_migration import (
    build_create_table_sql,
    build_migration_plan,
    build_postgres_schema_sql,
    canonical_json_hash,
    compare_sqlite_to_postgres,
    inspect_sqlite_database,
)


def _seed_db(path):
    conn = sqlite3.connect(str(path))
    conn.executescript(
        """
        CREATE TABLE runs (
            run_id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT 'queued',
            project_id TEXT DEFAULT '',
            data TEXT NOT NULL
        );
        CREATE INDEX idx_runs_project ON runs(project_id);
        """
    )
    conn.execute(
        "INSERT INTO runs (run_id, status, project_id, data) VALUES (?, ?, ?, ?)",
        ("run-1", "passed", "project-1", json.dumps({"result": "ok"})),
    )
    conn.commit()
    conn.close()


def test_inspect_sqlite_database_maps_data_column_to_jsonb(tmp_path):
    db_path = tmp_path / "openmelon.db"
    _seed_db(db_path)

    tables = inspect_sqlite_database(db_path)

    runs = next(table for table in tables if table.name == "runs")
    assert runs.row_count == 1
    assert runs.primary_key == ("run_id",)
    assert runs.data_column == "data"
    assert any(index.name == "idx_runs_project" for index in runs.indexes)

    ddl = build_create_table_sql(runs)
    assert '"data" JSONB NOT NULL' in ddl
    assert 'PRIMARY KEY ("run_id")' in ddl


def test_build_postgres_schema_sql_includes_indexes_and_jsonb_gin(tmp_path):
    db_path = tmp_path / "openmelon.db"
    _seed_db(db_path)

    ddl = build_postgres_schema_sql(inspect_sqlite_database(db_path))

    assert 'CREATE TABLE IF NOT EXISTS "runs"' in ddl
    assert 'CREATE INDEX IF NOT EXISTS "idx_runs_project" ON "runs" ("project_id");' in ddl
    assert 'USING GIN ("data")' in ddl


def test_build_migration_plan_reports_strategy(tmp_path):
    db_path = tmp_path / "openmelon.db"
    _seed_db(db_path)

    plan = build_migration_plan(db_path)

    assert plan["table_count"] == 1
    assert plan["total_rows"] == 1
    assert plan["tables"][0]["pg_strategy"] == "indexed columns + data JSONB"


def test_canonical_json_hash_is_order_insensitive():
    assert canonical_json_hash({"b": 2, "a": 1}) == canonical_json_hash({"a": 1, "b": 2})


def test_compare_sqlite_to_postgres_adds_samples(monkeypatch, tmp_path):
    db_path = tmp_path / "openmelon.db"
    _seed_db(db_path)

    monkeypatch.setattr(
        "app.storage.postgres_migration.verify_sqlite_to_postgres",
        lambda **_kwargs: {"ok": True, "tables": []},
    )

    result = compare_sqlite_to_postgres(db_path=db_path, database_url="postgresql://example", sample_size=1)

    assert result["ok"] is True
    assert result["samples"][0]["table"] == "runs"
    assert result["samples"][0]["sample_keys"] == [("run-1",)]
