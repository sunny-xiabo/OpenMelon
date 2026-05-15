import json

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


def test_api_execution_store_migrates_json_seed_files(tmp_path):
    seed_dir = tmp_path / "seed"
    seed_dir.mkdir()
    (seed_dir / "api_runs.json").write_text(
        json.dumps({
            "run-1": {
                "run_id": "run-1",
                "run_at": "2026-05-08T00:00:00Z",
                "case_id": "case-1",
                "case_name": "Migrated run",
                "status": "passed",
                "execution_options": {"project_id": "project-1"},
            }
        }),
        encoding="utf-8",
    )
    (seed_dir / "projects.json").write_text(
        json.dumps({
            "project-1": {
                "project_id": "project-1",
                "name": "Migrated project",
                "updated_at": "2026-05-08T00:00:00Z",
            }
        }),
        encoding="utf-8",
    )

    store = APIExecutionStore(tmp_path)

    assert store.migrate_from_json(seed_dir) == 2
    assert store.get_run("run-1")["case_name"] == "Migrated run"
    assert store.list_runs(project_id="project-1")[0]["run_id"] == "run-1"
    assert store.get_project("project-1")["name"] == "Migrated project"
