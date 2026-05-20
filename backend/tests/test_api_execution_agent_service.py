from app.api_execution.schemas import APIAgentTestPlanRequest, APIAssetInterfaceUpdateRequest
from app.api_execution.services import agent_service, asset_service
from app.api_execution.storage import APIExecutionStore


def _store(monkeypatch, tmp_path):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(agent_service, "api_execution_store", store)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    return store


def _project_with_env(store, *, base_url="http://localhost:8000"):
    project = store.save_project({"project_id": "project-1", "name": "Agent Project", "default_environment_id": "env-1"})
    store.save_environment({"environment_id": "env-1", "project_id": "project-1", "name": "本地", "base_url": base_url})
    return project


def _sync_spec(store, project, operations):
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-19T00:00:00Z",
            "operation_count": len(operations),
            "operations": operations,
        }
    )
    store.save_project({**project, "spec_id": spec["spec_id"]})
    return asset_service.sync_project_spec_assets({**project, "spec_id": spec["spec_id"]}, spec)


def test_agent_context_recommends_configuration_before_assets(tmp_path, monkeypatch):
    store = _store(monkeypatch, tmp_path)
    store.save_project({"project_id": "project-1", "name": "Agent Project"})

    context = agent_service.get_agent_context_service("project-1")

    assert context["readiness"]["environment_ready"] is False
    assert context["recommendation"]["action"] == "configure_environment"

    store.save_environment({"environment_id": "env-1", "project_id": "project-1", "name": "本地", "base_url": ""})
    context = agent_service.get_agent_context_service("project-1")
    assert context["readiness"]["base_url_ready"] is False
    assert context["recommendation"]["action"] == "configure_base_url"


def test_agent_context_prefers_changed_interfaces(tmp_path, monkeypatch):
    store = _store(monkeypatch, tmp_path)
    project = _project_with_env(store)
    sync = _sync_spec(
        store,
        project,
        [
            {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            {"id": "GET /orders", "method": "GET", "path": "/orders", "operation_id": "listOrders", "summary": "List orders", "tags": ["Order"]},
        ],
    )
    changed = sync["interfaces"][0]
    store.save_api_interface({**changed, "status": "changed", "change_state": "changed"})

    context = agent_service.get_agent_context_service("project-1")

    assert context["recommendation"]["scope_strategy"] == "changed"
    assert context["recommendation"]["interface_ids"] == [changed["interface_id"]]


def test_agent_context_recommends_largest_active_module_without_changes(tmp_path, monkeypatch):
    store = _store(monkeypatch, tmp_path)
    project = _project_with_env(store)
    sync = _sync_spec(
        store,
        project,
        [
            {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            {"id": "POST /users", "method": "POST", "path": "/users", "operation_id": "createUser", "summary": "Create user", "tags": ["User"]},
            {"id": "GET /orders", "method": "GET", "path": "/orders", "operation_id": "listOrders", "summary": "List orders", "tags": ["Order"]},
        ],
    )
    user_module = next(item for item in sync["modules"] if item["name"] == "User")

    context = agent_service.get_agent_context_service("project-1")

    assert context["recommendation"]["scope_strategy"] == "module"
    assert context["recommendation"]["module_id"] == user_module["module_id"]


def test_agent_excludes_non_executable_statuses_from_default_scope(tmp_path, monkeypatch):
    store = _store(monkeypatch, tmp_path)
    project = _project_with_env(store)
    sync = _sync_spec(
        store,
        project,
        [
            {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            {"id": "GET /orders", "method": "GET", "path": "/orders", "operation_id": "listOrders", "summary": "List orders", "tags": ["Order"]},
        ],
    )
    excluded = sync["interfaces"][1]
    asset_service.update_project_interface_service(excluded["interface_id"], APIAssetInterfaceUpdateRequest(status="excluded"))

    context = agent_service.get_agent_context_service("project-1")
    plan = agent_service.build_agent_test_plan_service("project-1", APIAgentTestPlanRequest(scope_strategy="auto"))

    assert context["asset_summary"]["excluded_interface_count"] == 1
    assert context["skipped_reason_groups"][0]["count"] == 1
    assert len(plan["included_interfaces"]) == 1
    assert plan["skipped_reason_groups"][0]["count"] == 1


def test_agent_high_risk_requires_confirmation_then_generates_compatible_dsl(tmp_path, monkeypatch):
    store = _store(monkeypatch, tmp_path)
    project = _project_with_env(store)
    sync = _sync_spec(
        store,
        project,
        [
            {"id": "DELETE /users/{id}", "method": "DELETE", "path": "/users/{id}", "operation_id": "deleteUser", "summary": "Delete user", "tags": ["User"]},
        ],
    )
    module = sync["modules"][0]

    blocked = agent_service.build_agent_test_plan_service(
        "project-1",
        APIAgentTestPlanRequest(scope_strategy="module", module_id=module["module_id"]),
    )
    allowed = agent_service.build_agent_test_plan_service(
        "project-1",
        APIAgentTestPlanRequest(scope_strategy="module", module_id=module["module_id"], include_high_risk=True),
    )

    assert blocked["requires_high_risk_confirmation"] is True
    assert blocked["next_action"]["action"] == "confirm_high_risk"
    assert allowed["script"]["agent_source"] == "api_asset_catalog"
    assert allowed["script"]["agent_test_intent"] == "smoke"
    assert allowed["script"]["steps"][0]["interface_id"]
    assert allowed["next_action"]["action"] == "go_orchestrate"
