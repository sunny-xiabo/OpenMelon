import json

from app.api_execution.postgres_store import PostgresRow, _translate_sql, _postgres_schema_sql
from app.models.graph_types import PostgresNodeTypeStore
from app.services.file_tracker import PostgresFileTracker
from app.services.prompt_hub_tracker import PostgresPromptHubTracker
from app.storage.postgres_store import postgres_schema_from_text


def test_postgres_row_serializes_jsonb_data_for_store_methods():
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


def test_shared_postgres_schema_mapper_keeps_index_columns_and_maps_payload():
    schema = postgres_schema_from_text(
        """
        CREATE TABLE IF NOT EXISTS sample_records (
            id TEXT PRIMARY KEY,
            status TEXT NOT NULL DEFAULT '',
            count INTEGER NOT NULL DEFAULT 0,
            data TEXT NOT NULL
        );
        """
    )

    assert "status TEXT NOT NULL DEFAULT ''" in schema
    assert "count INTEGER NOT NULL DEFAULT 0" in schema
    assert "data JSONB NOT NULL" in schema
    assert "data TEXT NOT NULL" not in schema


def test_metadata_postgres_store_classes_are_runtime_overrides():
    assert PostgresFileTracker.storage_engine == "postgres"
    assert PostgresPromptHubTracker.storage_engine == "postgres"
    assert PostgresNodeTypeStore.storage_engine == "postgres"
