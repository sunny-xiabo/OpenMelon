from app.api_execution.storage import APIExecutionStore


def test_api_execution_store_uses_sqlite_without_json_writes(tmp_path):
    store = APIExecutionStore(tmp_path)
    run = {
        "run_id": "run-1",
        "run_at": "2026-05-08T00:00:00Z",
        "case_id": "case-1",
        "case_name": "SQLite only",
        "status": "passed",
        "execution_options": {"project_id": "project-1"},
    }

    store.save_run(run)

    assert store.get_run("run-1") == run
    assert (tmp_path / "api_execution.db").exists()
    assert list(tmp_path.glob("*.json")) == []


def test_api_execution_store_deletes_all_runs(tmp_path):
    store = APIExecutionStore(tmp_path)
    store.save_run({"run_id": "run-1", "run_at": "2026-05-08T00:00:00Z", "status": "passed"})
    store.save_run({"run_id": "run-2", "run_at": "2026-05-08T00:00:01Z", "status": "failed"})

    assert store.delete_all_runs() == 2
    assert store.list_runs(limit=10) == []
