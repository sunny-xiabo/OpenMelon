import json

from app.api_execution.postgres_store import PostgresRow, _translate_sql, _postgres_schema_sql


def test_postgres_row_serializes_jsonb_data_for_sqlite_store_methods():
    row = PostgresRow({"data": {"run_id": "run-1", "status": "passed"}, "count": 1})

    assert json.loads(row["data"]) == {"run_id": "run-1", "status": "passed"}
    assert row["count"] == 1
    assert row[0] == {"run_id": "run-1", "status": "passed"}


def test_translate_sql_uses_psycopg_placeholders_and_pg_offset():
    sql = "SELECT data FROM runs WHERE status = ? ORDER BY run_at DESC LIMIT -1 OFFSET ?"

    assert _translate_sql(sql) == "SELECT data FROM runs WHERE status = %s ORDER BY run_at DESC OFFSET %s"


def test_postgres_schema_maps_data_to_jsonb():
    schema = _postgres_schema_sql()

    assert "data JSONB NOT NULL" in schema
    assert "data TEXT NOT NULL" not in schema
