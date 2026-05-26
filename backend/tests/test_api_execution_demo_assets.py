import asyncio

from app.api_execution.services import run_service
from app.api_execution.services import spec_service
from app.api_execution.storage import APIExecutionStore


def test_load_demo_openapi_asset_returns_parsed_spec(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(spec_service, "api_execution_store", store)

    response = spec_service.load_demo_openapi_service()

    assert response["spec_id"]
    assert response["operation_count"] > 0
    assert response["operations"]
    assert store.get_spec(response["spec_id"])["operation_count"] == response["operation_count"]


def test_bootstrap_demo_project_seeds_project_environment_runs_and_knowledge(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(spec_service, "api_execution_store", store)
    monkeypatch.setattr(run_service, "api_execution_store", store)

    response = asyncio.run(spec_service.bootstrap_demo_project_service())

    assert response["spec"]["operation_count"] == 3
    assert response["project"]["project_id"] == "demo-api-flow"
    assert response["environment"]["environment_id"] == "demo-api-flow-local"
    assert len(response["seeded_run_ids"]) == 3
    assert response["knowledge_item_count"] == 0
    assert response["knowledge_candidate_count"] == 3
    assert response["pending_task_count"] == 3
    assert store.get_project("demo-api-flow")["default_environment_id"] == "demo-api-flow-local"
    assert store.list_runs(project_id="demo-api-flow")
    assert not store.list_knowledge_items()
    assert len(store.list_automation_tasks(status="pending", project_id="demo-api-flow")) == 3
