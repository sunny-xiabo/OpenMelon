from app.api_execution.storage import APIExecutionStore
from app.storage.migration_readiness import build_sqlite_to_pg_readiness


def test_storage_migration_readiness_reports_table_profiles_and_jsonb_mapping(tmp_path):
    store = APIExecutionStore(tmp_path)
    store.save_project(
        {
            "project_id": "project-1",
            "name": "Demo",
            "auth_config": {"type": "bearer", "token_variable": "token"},
        }
    )
    store.save_run(
        {
            "run_id": "run-1",
            "status": "failed",
            "case_id": "case-1",
            "case_name": "Failed sample",
            "run_at": "2026-05-18T10:00:00Z",
            "execution_options": {"project_id": "project-1"},
            "script": {"steps": []},
            "results": [],
        }
    )

    response = build_sqlite_to_pg_readiness(store, generated_at="2026-05-20T00:00:00Z")

    assert response["storage_engine"] == "sqlite"
    assert response["pg_readiness"] == "ready_with_jsonb_mapping"
    assert response["database_path"].endswith("api_execution.db")
    runs_profile = next(item for item in response["table_profiles"] if item["table"] == "runs")
    projects_profile = next(item for item in response["table_profiles"] if item["table"] == "projects")
    assert runs_profile["row_count"] == 1
    assert runs_profile["pg_jsonb_column"] == "data"
    assert runs_profile["invalid_json_rows"] == 0
    assert "project_id" in runs_profile["indexed_columns"]
    assert projects_profile["row_count"] == 1
    assert response["retention_plan"]["run_count"] == 1
    assert response["recommended_steps"]
    assert any(risk["area"] == "projects" and risk["risk_level"] == "medium" for risk in response["json_field_risks"])


def test_storage_migration_readiness_flags_invalid_json_payloads(tmp_path):
    store = APIExecutionStore(tmp_path)
    with store._lock:
        store._conn.execute(
            """
            INSERT INTO runs (run_id, status, project_id, case_id, case_name, run_at, data)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            ("bad-json", "failed", "project-1", "case-1", "Bad JSON", "2026-05-18T10:00:00Z", "{bad"),
        )
        store._conn.commit()

    response = build_sqlite_to_pg_readiness(store, generated_at="2026-05-20T00:00:00Z")

    assert response["pg_readiness"] == "needs_cleanup"
    runs_profile = next(item for item in response["table_profiles"] if item["table"] == "runs")
    assert runs_profile["invalid_json_rows"] == 1
    assert any(risk["area"] == "runs" and risk["risk_level"] == "high" for risk in response["json_field_risks"])
