import asyncio

import pytest

from app.api.errors import InvalidRequestError, NotFoundError
from app.api_execution.schemas import (
    APITestCaseDsl,
    APITestStep,
    APIAssetInterfaceCreateRequest,
    APIAssetInterfaceUpdateRequest,
    APIAssetModuleCreateRequest,
    APIAssetModuleMergeRequest,
    APIAssetModuleRemoveRequest,
    APIAssetModuleUpdateRequest,
    APIAssetTestPlanRequest,
    APIProjectUpsertRequest,
    RunScriptRequest,
)
from app.api_execution.services import asset_service
from app.api_execution.services import knowledge_service
from app.api_execution.services import run_service
from app.api_execution.services import spec_service
from app.api_execution.storage import APIExecutionStore


def test_project_and_environment_store_roundtrip(tmp_path):
    store = APIExecutionStore(tmp_path)

    project = store.save_project(
        {
            "project_id": "project-1",
            "name": "OpenMelon",
            "default_environment_id": "",
            "enabled": True,
        }
    )
    environment = store.save_environment(
        {
            "environment_id": "env-1",
            "project_id": "project-1",
            "name": "本地测试",
            "environment_type": "test",
            "base_url": "http://localhost:8000",
            "headers": {"Accept": "application/json"},
            "variables": {},
            "timeout_ms": 30000,
            "continue_on_failure": True,
            "enabled": True,
        }
    )

    assert store.get_project("project-1") == project
    assert store.get_environment("env-1") == environment
    assert store.list_projects()[0]["project_id"] == "project-1"
    assert store.list_environments("project-1")[0]["environment_id"] == "env-1"


def test_delete_project_also_deletes_environments(tmp_path):
    store = APIExecutionStore(tmp_path)
    store.save_project({"project_id": "project-1", "name": "OpenMelon"})
    store.save_environment({"environment_id": "env-1", "project_id": "project-1", "name": "本地测试"})
    store.save_api_module({"module_id": "module-1", "project_id": "project-1", "module_key": "users", "name": "Users"})
    store.save_api_interface(
        {
            "interface_id": "interface-1",
            "project_id": "project-1",
            "module_id": "module-1",
            "interface_key": "GET /users",
            "method": "GET",
            "path": "/users",
        }
    )
    store.save_api_spec_version({"spec_version_id": "version-1", "project_id": "project-1", "spec_id": "spec-1"})

    assert store.delete_project("project-1") is True
    assert store.get_project("project-1") is None
    assert store.list_environments("project-1") == []
    assert store.list_api_modules("project-1") == []
    assert store.list_api_interfaces("project-1") == []
    assert store.list_api_spec_versions("project-1") == []


def test_project_policy_and_history_project_filter(tmp_path):
    store = APIExecutionStore(tmp_path)
    project = store.save_project(
        {
            "project_id": "project-1",
            "name": "OpenMelon",
            "allow_ai_execution": True,
            "allow_ai_repair": True,
            "allow_scheduled_execution": False,
            "allow_ai_generate_dsl": True,
            "allow_overwrite_history": True,
            "max_auto_repairs": 2,
            "max_reruns": 3,
            "max_requests_per_run": 5,
            "risk_overrides": {"DELETE /users/{id}": "high"},
            "operation_allowlist": ["GET /health", "GET /users"],
            "operation_blocklist": ["DELETE /users/{id}"],
        }
    )
    store.save_run(
        {
            "run_id": "run-1",
            "run_at": "2026-04-29T00:00:01Z",
            "case_name": "project run",
            "status": "passed",
            "execution_options": {"project_id": "project-1", "environment_snapshot": {"name": "本地测试"}},
        }
    )
    store.save_run(
        {
            "run_id": "run-2",
            "run_at": "2026-04-29T00:00:02Z",
            "case_name": "other run",
            "status": "passed",
            "execution_options": {"project_id": "project-2"},
        }
    )

    assert project["allow_ai_execution"] is True
    assert project["operation_blocklist"] == ["DELETE /users/{id}"]
    assert project["max_requests_per_run"] == 5
    assert project["risk_overrides"]["DELETE /users/{id}"] == "high"
    assert [run["run_id"] for run in store.list_runs(project_id="project-1")] == ["run-1"]
    assert [run["run_id"] for run in store.list_runs(keyword="本地测试")] == ["run-1"]


def test_policy_audit_store_roundtrip(tmp_path):
    store = APIExecutionStore(tmp_path)
    audit = store.save_policy_audit(
        {
            "audit_id": "audit-1",
            "created_at": "2026-04-29T00:00:01Z",
            "action": "execute",
            "project_id": "project-1",
            "environment_id": "env-1",
            "trigger_source": "manual",
            "decision": {"allowed": True, "risk_level": "low"},
            "approved": True,
            "approval_note": "系统策略自动判定",
        }
    )

    assert store.list_policy_audits()[0] == audit
    assert store.list_policy_audits(project_id="project-1")[0]["audit_id"] == "audit-1"
    assert store.list_policy_audits(action="execute")[0]["audit_id"] == "audit-1"


def test_automation_task_store_roundtrip(tmp_path):
    store = APIExecutionStore(tmp_path)
    task = store.save_automation_task(
        {
            "task_id": "task-1",
            "created_at": "2026-04-29T00:00:01Z",
            "updated_at": "2026-04-29T00:00:01Z",
            "task_type": "manual_review",
            "status": "pending",
            "run_id": "run-1",
            "project_id": "project-1",
            "environment_id": "env-1",
            "risk_level": "medium",
            "reason": "需要人工确认",
            "summary": {"failed": 1},
            "decision": {"allowed": False},
        }
    )

    assert store.get_automation_task("task-1") == task
    assert store.list_automation_tasks(status="pending")[0]["task_id"] == "task-1"
    assert store.list_automation_tasks(project_id="project-1")[0]["task_id"] == "task-1"
    assert store.update_automation_task("task-1", {"status": "resolved"})["status"] == "resolved"


def test_unified_automation_and_knowledge_store_roundtrip(tmp_path):
    store = APIExecutionStore(tmp_path)
    store.save_automation_definition(
        {
            "definition_id": "api:case-1",
            "automation_type": "api",
            "name": "API case",
            "created_at": "2026-04-29T00:00:01Z",
            "updated_at": "2026-04-29T00:00:01Z",
        }
    )
    store.save_automation_run(
        {
            "automation_run_id": "api-run:run-1",
            "automation_type": "api",
            "source_run_id": "run-1",
            "status": "passed",
            "run_at": "2026-04-29T00:00:02Z",
            "summary": {"passed": 1},
        }
    )
    store.save_run_stage_event(
        {
            "event_id": "event-1",
            "automation_run_id": "api-run:run-1",
            "stage": "execute",
            "status": "passed",
            "created_at": "2026-04-29T00:00:02Z",
            "detail": {},
        }
    )
    store.save_artifact_meta(
        {
            "artifact_id": "artifact-1",
            "automation_run_id": "api-run:run-1",
            "artifact_type": "report_json",
            "name": "报告",
            "created_at": "2026-04-29T00:00:02Z",
            "metadata": {},
        }
    )
    store.save_knowledge_item(
        {
            "knowledge_id": "knowledge-1",
            "item_type": "api_run_summary",
            "source_run_id": "run-1",
            "project_id": "project-1",
            "created_at": "2026-04-29T00:00:02Z",
            "summary": "执行通过",
            "payload": {},
        }
    )

    assert store.list_automation_runs()[0]["automation_run_id"] == "api-run:run-1"
    assert store.list_knowledge_items(item_type="api_run_summary")[0]["knowledge_id"] == "knowledge-1"


def test_flow_template_automation_definition_store_roundtrip(tmp_path):
    store = APIExecutionStore(tmp_path)
    template = store.save_automation_definition(
        {
            "definition_id": "flow-template:template-1",
            "definition_type": "flow_template",
            "automation_type": "api",
            "template_id": "template-1",
            "project_id": "project-1",
            "name": "登录流程",
            "description": "登录后查询用户",
            "tags": ["smoke"],
            "script": {
                "case_id": "case-1",
                "name": "登录流程",
                "steps": [{"id": "login", "name": "login", "method": "POST", "path": "/login", "operation_id": "login"}],
            },
            "created_at": "2026-05-11T00:00:01Z",
            "updated_at": "2026-05-11T00:00:02Z",
        }
    )
    store.save_automation_definition(
        {
            "definition_id": "api:case-1",
            "automation_type": "api",
            "name": "普通自动化定义",
            "created_at": "2026-05-11T00:00:01Z",
            "updated_at": "2026-05-11T00:00:03Z",
        }
    )

    assert store.get_automation_definition("flow-template:template-1") == template
    assert [item["template_id"] for item in store.list_automation_definitions(definition_type="flow_template")] == ["template-1"]
    assert [item["template_id"] for item in store.list_automation_definitions(project_id="project-1", definition_type="flow_template")] == ["template-1"]
    assert store.list_automation_definitions(project_id="project-2", definition_type="flow_template") == []
    assert store.delete_automation_definition("flow-template:template-1") is True


def test_get_spec_service_returns_saved_spec(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(spec_service, "api_execution_store", store)
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "filename": "openapi.json",
            "parsed_at": "2026-05-15T00:00:00Z",
            "info": {"title": "Project API"},
            "servers": [{"url": "http://localhost:8000"}],
            "tags": [],
            "operation_count": 1,
            "operations": [
                {
                    "id": "GET /health",
                    "method": "GET",
                    "path": "/health",
                    "operation_id": "health",
                    "summary": "Health check",
                    "description": "",
                    "tags": [],
                    "parameters": [],
                    "request_body": {},
                    "responses": {},
                    "security": [],
                }
            ],
        }
    )

    assert spec_service.get_spec_service("spec-1") == spec
    with pytest.raises(NotFoundError):
        spec_service.get_spec_service("missing")


def test_project_spec_sync_builds_module_interface_catalog(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project(
        {
            "project_id": "project-1",
            "name": "Catalog Project",
            "risk_overrides": {"POST /orders": "high"},
        }
    )
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "filename": "openapi.json",
            "content_hash": "hash-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "info": {"title": "Catalog API"},
            "servers": [],
            "tags": [],
            "operation_count": 2,
            "operations": [
                {
                    "id": "GET /users",
                    "method": "GET",
                    "path": "/users",
                    "operation_id": "listUsers",
                    "summary": "List users",
                    "tags": ["User"],
                },
                {
                    "id": "POST /orders",
                    "method": "POST",
                    "path": "/orders",
                    "operation_id": "createOrder",
                    "summary": "Create order",
                    "tags": ["Order"],
                },
            ],
        }
    )

    result = asset_service.sync_project_spec_assets(project, spec)

    assert result["diff_summary"] == {"added": 2, "changed": 0, "removed": 0, "unchanged": 0}
    modules = store.list_api_modules("project-1")
    assert {item["name"] for item in modules} == {"User", "Order"}
    interfaces = store.list_api_interfaces("project-1")
    assert {item["interface_key"] for item in interfaces} == {"GET /users", "POST /orders"}
    order = store.get_api_interface_by_key("project-1", "POST /orders")
    assert order["risk_level"] == "high"
    assert store.list_api_spec_versions("project-1")[0]["diff_summary"]["added"] == 2


def test_project_spec_sync_marks_changed_and_removed(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    first = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 2,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
                {"id": "POST /orders", "method": "POST", "path": "/orders", "operation_id": "createOrder", "summary": "Create order", "tags": ["Order"]},
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, first)
    user_interface = store.get_api_interface_by_key("project-1", "GET /users")
    custom_module = store.save_api_module(
        {"module_id": "module-custom", "project_id": "project-1", "module_key": "custom", "name": "人工模块", "source": "manual"}
    )
    store.save_api_interface({**user_interface, "module_id": custom_module["module_id"], "module_key": "custom", "module_name": "人工模块"})
    second = store.save_spec(
        {
            "spec_id": "spec-2",
            "parsed_at": "2026-05-15T00:01:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users v2", "tags": ["User"]},
            ],
        }
    )

    result = asset_service.sync_project_spec_assets(project, second)

    assert result["diff_summary"] == {"added": 0, "changed": 1, "removed": 1, "unchanged": 0}
    updated_user = store.get_api_interface_by_key("project-1", "GET /users")
    removed_order = store.get_api_interface_by_key("project-1", "POST /orders")
    assert updated_user["status"] == "changed"
    assert updated_user["module_id"] == "module-custom"
    assert removed_order["status"] == "removed"


def test_project_asset_preview_does_not_persist_changes(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    first = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, first)
    second = store.save_spec(
        {
            "spec_id": "spec-2",
            "parsed_at": "2026-05-15T00:01:00Z",
            "operation_count": 2,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users v2", "tags": ["User"]},
                {"id": "POST /orders", "method": "POST", "path": "/orders", "operation_id": "createOrder", "summary": "Create order", "tags": ["Order"]},
            ],
        }
    )

    result = asset_service.preview_project_assets_service("project-1", spec_id="spec-2")

    assert result["diff_summary"] == {"added": 1, "changed": 1, "removed": 0, "unchanged": 0}
    assert store.get_api_interface_by_key("project-1", "POST /orders") is None
    assert store.get_api_interface_by_key("project-1", "GET /users")["summary"] == "List users"
    assert len(store.list_api_spec_versions("project-1")) == 1
    assert second["spec_id"] == "spec-2"


def test_confirmed_project_asset_sync_rebinds_project_spec(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    store.save_project({"project_id": "project-1", "name": "Catalog Project", "spec_id": "spec-1"})
    store.save_spec(
        {
            "spec_id": "spec-2",
            "parsed_at": "2026-05-15T00:01:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /orders", "method": "GET", "path": "/orders", "operation_id": "listOrders", "summary": "List orders", "tags": ["Order"]},
            ],
        }
    )

    result = asset_service.sync_project_assets_service("project-1", spec_id="spec-2")

    assert result["diff_summary"]["added"] == 1
    assert store.get_project("project-1")["spec_id"] == "spec-2"
    assert store.get_api_interface_by_key("project-1", "GET /orders")["current_spec_id"] == "spec-2"


def test_project_upsert_does_not_silently_refresh_existing_catalog(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    monkeypatch.setattr(spec_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project", "spec_id": "spec-1"})
    first = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, first)
    store.save_spec(
        {
            "spec_id": "spec-2",
            "parsed_at": "2026-05-15T00:01:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "POST /orders", "method": "POST", "path": "/orders", "operation_id": "createOrder", "summary": "Create order", "tags": ["Order"]},
            ],
        }
    )

    spec_service.upsert_project_service(APIProjectUpsertRequest(project_id="project-1", name="Catalog Project", spec_id="spec-2"))

    assert store.get_project("project-1")["spec_id"] == "spec-2"
    assert store.get_api_interface_by_key("project-1", "GET /users") is not None
    assert store.get_api_interface_by_key("project-1", "POST /orders") is None


def test_asset_test_plan_builds_smoke_dsl_from_module(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 2,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
                {"id": "DELETE /users/{id}", "method": "DELETE", "path": "/users/{id}", "operation_id": "deleteUser", "summary": "Delete user", "tags": ["User"]},
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, spec)
    module = store.list_api_modules("project-1")[0]

    result = asset_service.build_asset_test_plan_service(
        "project-1",
        APIAssetTestPlanRequest(module_id=module["module_id"], test_intent="smoke"),
    )

    assert result["risk_summary"]["included"] == 1
    assert result["requires_high_risk_confirmation"] is True
    assert result["script"]["agent_source"] == "api_asset_catalog"
    assert result["script"]["steps"][0]["interface_id"]
    assert result["script"]["steps"][0]["module_id"] == module["module_id"]
    assert result["skipped_interfaces"][0]["risk_level"] == "high"


def test_asset_test_plan_discovers_business_dependencies(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 3,
            "operations": [
                {
                    "id": "GET /orders/{id}",
                    "method": "GET",
                    "path": "/orders/{id}",
                    "operation_id": "getOrder",
                    "summary": "Get order",
                    "tags": ["Order"],
                    "parameters": [{"name": "id", "in": "path", "required": True, "schema": {"type": "string"}}],
                },
                {
                    "id": "POST /orders",
                    "method": "POST",
                    "path": "/orders",
                    "operation_id": "createOrder",
                    "summary": "Create order",
                    "tags": ["Order"],
                    "responses": {"201": {"description": "created"}},
                },
                {
                    "id": "POST /auth/login",
                    "method": "POST",
                    "path": "/auth/login",
                    "operation_id": "login",
                    "summary": "Login",
                    "tags": ["Auth"],
                },
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, spec)

    result = asset_service.build_asset_test_plan_service("project-1", APIAssetTestPlanRequest())
    steps = result["script"]["steps"]

    assert [step["operation_id"] for step in steps] == ["login", "createOrder", "getOrder"]
    assert steps[0]["extractions"][0]["name"] == "access_token"
    assert steps[1]["depends_on"] == ["s1"]
    assert steps[1]["headers"]["Authorization"] == "Bearer {{access_token}}"
    assert steps[1]["extractions"][0]["name"] == "order_id"
    assert "s2" in steps[2]["depends_on"]
    assert steps[2]["path_params"]["id"] == "{{order_id}}"
    assert len(result["dependency_graph"]) >= 2
    assert result["orchestration_summary"].startswith("已发现")


def test_asset_test_plan_applies_project_setup_and_bearer_auth(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project(
        {
            "project_id": "project-1",
            "name": "Catalog Project",
            "auth_config": {"type": "bearer", "token_variable": "access_token"},
            "setup_steps": [
                {
                    "id": "login",
                    "name": "登录",
                    "method": "POST",
                    "path": "/auth/login",
                    "operation_id": "login",
                    "body": {"username": "{{username}}", "password": "{{password}}"},
                    "extractions": [{"name": "access_token", "source": "body", "path": "data.token"}],
                }
            ],
            "cleanup_steps": [
                {
                    "id": "cleanup_order",
                    "name": "清理订单",
                    "method": "DELETE",
                    "path": "/orders/{{order_id}}",
                    "operation_id": "cleanupOrder",
                    "assertions": [{"type": "status_code_in", "expected": [200, 204, 404]}],
                }
            ],
        }
    )
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /orders", "method": "GET", "path": "/orders", "operation_id": "listOrders", "summary": "List orders", "tags": ["Order"]},
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, spec)

    result = asset_service.build_asset_test_plan_service("project-1", APIAssetTestPlanRequest())
    steps = result["script"]["steps"]

    assert result["script"]["agent_setup_applied"] is True
    assert result["script"]["agent_cleanup_applied"] is True
    assert result["script"]["auth_applied"] is True
    assert steps[0]["id"] == "login"
    assert steps[0]["extractions"][0]["name"] == "access_token"
    assert steps[1]["headers"]["Authorization"] == "Bearer {{access_token}}"
    assert result["script"]["cleanup_steps"][0]["id"] == "cleanup_order"


def test_asset_test_plan_applies_project_api_key_query_auth(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project(
        {
            "project_id": "project-1",
            "name": "Catalog Project",
            "auth_config": {"type": "api_key", "in": "query", "name": "api_key", "value_variable": "api_key"},
        }
    )
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /orders", "method": "GET", "path": "/orders", "operation_id": "listOrders", "summary": "List orders", "tags": ["Order"]},
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, spec)

    result = asset_service.build_asset_test_plan_service("project-1", APIAssetTestPlanRequest())
    step = result["script"]["steps"][0]

    assert result["script"]["auth_applied"] is True
    assert step["query"]["api_key"] == "{{api_key}}"


def test_asset_test_plan_builds_negative_cases_from_schema(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {
                    "id": "POST /orders",
                    "method": "POST",
                    "path": "/orders",
                    "operation_id": "createOrder",
                    "summary": "Create order",
                    "tags": ["Order"],
                    "parameters": [
                        {"name": "tenant_id", "in": "query", "required": True, "schema": {"type": "string"}},
                    ],
                    "request_body": {
                        "content": {
                            "application/json": {
                                "schema": {
                                    "type": "object",
                                    "required": ["sku"],
                                    "properties": {
                                        "sku": {"type": "string"},
                                        "quantity": {"type": "integer"},
                                    },
                                }
                            }
                        }
                    },
                    "responses": {"201": {"description": "created"}, "422": {"description": "invalid"}},
                }
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, spec)

    result = asset_service.build_asset_test_plan_service("project-1", APIAssetTestPlanRequest(test_intent="negative"))
    steps = result["script"]["steps"]

    assert result["script"]["agent_test_intent"] == "negative"
    assert result["script"]["name"] == "Catalog Project 参数负向测试"
    assert len(steps) >= 3
    assert any("缺少必填 query 参数 tenant_id" in step["name"] for step in steps)
    assert any("缺少必填 Body 字段 sku" in step["name"] for step in steps)
    assert all(step["assertions"][0]["expected"] == [400, 401, 403, 404, 409, 422] for step in steps)
    assert all(step["interface_id"] for step in steps)


def test_project_asset_impact_recommends_changed_and_added_interfaces(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project", "spec_id": "spec-1"})
    first = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    second = store.save_spec(
        {
            "spec_id": "spec-2",
            "parsed_at": "2026-05-16T00:00:00Z",
            "operation_count": 2,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List active users", "tags": ["User"]},
                {"id": "POST /orders", "method": "POST", "path": "/orders", "operation_id": "createOrder", "summary": "Create order", "tags": ["Order"]},
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, first)

    preview = asset_service.get_project_asset_impact_service("project-1", spec_id=second["spec_id"])

    assert preview["diff_summary"]["added"] == 1
    assert preview["diff_summary"]["changed"] == 1
    assert len(preview["suggested_interface_ids"]) == 2
    assert {item["change_state"] for item in preview["impacted_interfaces"]} == {"added", "changed"}

    synced = asset_service.sync_project_assets_service("project-1", spec_id=second["spec_id"])
    current = asset_service.get_project_asset_impact_service("project-1")

    assert synced["diff_summary"]["added"] == 1
    assert len(current["suggested_interface_ids"]) == 2


def test_run_service_merges_environment_variables_server_side(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(run_service, "api_execution_store", store)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    monkeypatch.setattr(knowledge_service, "api_execution_store", store)

    async def fake_run_all_steps(script, **kwargs):
        assert script.variables["username"] == "demo-user"
        return {
            "status": "passed",
            "duration_ms": 1,
            "total": 1,
            "passed": 1,
            "failed": 0,
            "skipped": 0,
            "results": [],
        }

    monkeypatch.setattr(run_service, "run_all_steps", fake_run_all_steps)
    script = APITestCaseDsl(
        case_id="case-env",
        name="Env merge",
        steps=[
            APITestStep(
                id="s1",
                name="Health",
                method="GET",
                path="/health",
                operation_id="health",
            )
        ],
    )

    report = asyncio.run(
        run_service.run_all_steps_service(
            RunScriptRequest(
                script=script,
                base_url="http://example.test",
                environment_snapshot={"variables": {"username": "demo-user"}},
            )
        )
    )

    assert report["status"] == "passed"
    assert report["script"]["variables"]["username"] == "demo-user"


def test_asset_test_plan_includes_high_risk_after_confirmation(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "DELETE /users/{id}", "method": "DELETE", "path": "/users/{id}", "operation_id": "deleteUser", "summary": "Delete user", "tags": ["User"]},
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, spec)

    result = asset_service.build_asset_test_plan_service(
        "project-1",
        APIAssetTestPlanRequest(include_high_risk=True),
    )

    assert result["risk_summary"]["included"] == 1
    assert result["requires_high_risk_confirmation"] is False
    assert result["script"]["agent_high_risk_approved"] is True


def test_update_interface_test_results_writes_latest_status(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    sync = asset_service.sync_project_spec_assets(project, spec)
    interface = sync["interfaces"][0]

    asset_service.update_interface_test_results(
        {
            "run_id": "run-1",
            "run_at": "2026-05-18T00:00:00Z",
            "execution_options": {"project_id": "project-1"},
            "script": {
                "steps": [
                    {
                        "id": "s1",
                        "method": "GET",
                        "path": "/users",
                        "interface_id": interface["interface_id"],
                    }
                ]
            },
            "results": [
                {
                    "step_id": "s1",
                    "status": "failed",
                    "status_code": 500,
                    "error": "server error",
                }
            ],
        }
    )

    updated = store.get_api_interface(interface["interface_id"])
    assert updated["last_test_status"] == "failed"
    assert updated["last_status_code"] == 500
    assert updated["last_failure_summary"] == "server error"


def test_update_openapi_interface_metadata_and_status(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    sync = asset_service.sync_project_spec_assets(project, spec)
    interface = sync["interfaces"][0]
    module = store.save_api_module({"module_id": "module-manual", "project_id": "project-1", "module_key": "manual", "name": "人工模块"})

    updated = asset_service.update_project_interface_service(
        interface["interface_id"],
        APIAssetInterfaceUpdateRequest(
            module_id=module["module_id"],
            summary="用户列表",
            description="人工维护描述",
            risk_level="blocked",
            status="deprecated",
        ),
    )

    assert updated["module_id"] == "module-manual"
    assert updated["module_name"] == "人工模块"
    assert updated["summary"] == "用户列表"
    assert updated["description"] == "人工维护描述"
    assert updated["risk_level"] == "blocked"
    assert updated["status"] == "deprecated"


def test_openapi_interface_cannot_change_method_or_path(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    sync = asset_service.sync_project_spec_assets(project, spec)
    interface = sync["interfaces"][0]

    with pytest.raises(InvalidRequestError):
        asset_service.update_project_interface_service(interface["interface_id"], APIAssetInterfaceUpdateRequest(method="POST"))


def test_hidden_interface_is_skipped_by_asset_test_plan(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    sync = asset_service.sync_project_spec_assets(project, spec)
    interface = sync["interfaces"][0]
    asset_service.update_project_interface_service(interface["interface_id"], APIAssetInterfaceUpdateRequest(hidden=True))

    result = asset_service.build_asset_test_plan_service("project-1", APIAssetTestPlanRequest())

    assert result["risk_summary"]["included"] == 0
    assert result["risk_summary"]["skipped"] == 1
    assert result["skipped_interfaces"][0]["reason"] == "接口已隐藏，默认不纳入 Agent 测试"
    hidden_list = asset_service.list_project_interfaces_service("project-1", status="hidden")
    assert hidden_list["total"] == 1


def test_create_manual_module_and_interface_then_delete(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    store.save_project({"project_id": "project-1", "name": "Catalog Project"})

    module = asset_service.create_project_module_service(
        "project-1",
        APIAssetModuleCreateRequest(name="手工模块", description="补录接口"),
    )
    interface = asset_service.create_project_interface_service(
        "project-1",
        APIAssetInterfaceCreateRequest(
            module_id=module["module_id"],
            method="POST",
            path="/manual/orders",
            operation_id="createManualOrder",
            summary="手工创建订单",
            risk_level="medium",
        ),
    )

    assert module["source"] == "manual"
    assert interface["source"] == "manual"
    assert interface["module_name"] == "手工模块"
    assert interface["interface_key"] == "POST /manual/orders"

    deleted = asset_service.delete_project_interface_service(interface["interface_id"])

    assert deleted["deleted"] is True
    assert store.get_api_interface(interface["interface_id"]) is None


def test_openapi_interface_cannot_be_physically_deleted(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    sync = asset_service.sync_project_spec_assets(project, spec)
    interface = sync["interfaces"][0]

    with pytest.raises(InvalidRequestError):
        asset_service.delete_project_interface_service(interface["interface_id"])


def test_openapi_interface_exclusion_survives_spec_resync(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project", "spec_id": "spec-1"})
    first = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    sync = asset_service.sync_project_spec_assets(project, first)
    interface = sync["interfaces"][0]

    excluded = asset_service.update_project_interface_service(interface["interface_id"], APIAssetInterfaceUpdateRequest(status="excluded"))
    assert excluded["status"] == "excluded"
    assert excluded["hidden"] is True

    second = store.save_spec(
        {
            "spec_id": "spec-2",
            "parsed_at": "2026-05-15T00:01:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users v2", "tags": ["User"]},
            ],
        }
    )
    result = asset_service.sync_project_spec_assets(project, second)

    assert result["diff_summary"]["changed"] == 1
    updated = store.get_api_interface(interface["interface_id"])
    assert updated["status"] == "excluded"
    assert updated["summary"] == "List users v2"
    excluded_list = asset_service.list_project_interfaces_service("project-1", status="excluded")
    assert excluded_list["total"] == 1


def test_interface_status_change_from_excluded_clears_exclusion_metadata(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    sync = asset_service.sync_project_spec_assets(project, spec)
    interface = sync["interfaces"][0]

    excluded = asset_service.update_project_interface_service(interface["interface_id"], APIAssetInterfaceUpdateRequest(status="excluded"))
    assert excluded["hidden"] is True
    assert excluded["excluded_by_user"] is True
    assert excluded["excluded_at"]

    deprecated = asset_service.update_project_interface_service(interface["interface_id"], APIAssetInterfaceUpdateRequest(status="deprecated"))

    assert deprecated["status"] == "deprecated"
    assert deprecated["hidden"] is False
    assert deprecated["excluded_by_user"] is False
    assert "excluded_at" not in deprecated


def test_empty_manual_module_can_delete_but_non_empty_module_must_be_migrated_or_excluded(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    store.save_project({"project_id": "project-1", "name": "Catalog Project"})

    empty_module = asset_service.create_project_module_service("project-1", APIAssetModuleCreateRequest(name="空模块"))
    deleted = asset_service.delete_project_module_service(empty_module["module_id"])
    assert deleted["deleted"] is True
    assert store.get_api_module(empty_module["module_id"]) is None

    module = asset_service.create_project_module_service("project-1", APIAssetModuleCreateRequest(name="手工模块"))
    asset_service.create_project_interface_service(
        "project-1",
        APIAssetInterfaceCreateRequest(module_id=module["module_id"], method="GET", path="/manual/users"),
    )

    with pytest.raises(InvalidRequestError):
        asset_service.delete_project_module_service(module["module_id"])


def test_module_merge_moves_interfaces_and_excludes_source_module(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 2,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
                {"id": "GET /orders", "method": "GET", "path": "/orders", "operation_id": "listOrders", "summary": "List orders", "tags": ["Order"]},
            ],
        }
    )
    asset_service.sync_project_spec_assets(project, spec)
    user_module = store.get_api_module_by_key("project-1", "user")
    order_module = store.get_api_module_by_key("project-1", "order")

    merged = asset_service.merge_project_module_service(
        order_module["module_id"],
        APIAssetModuleMergeRequest(target_module_id=user_module["module_id"]),
    )

    order_interface = store.get_api_interface_by_key("project-1", "GET /orders")
    assert merged["status"] == "excluded"
    assert merged["merged_into_module_id"] == user_module["module_id"]
    assert order_interface["module_id"] == user_module["module_id"]
    assert order_interface["module_name"] == user_module["name"]


def test_module_exclusion_excludes_interfaces_and_asset_test_plan(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(asset_service, "api_execution_store", store)
    project = store.save_project({"project_id": "project-1", "name": "Catalog Project"})
    spec = store.save_spec(
        {
            "spec_id": "spec-1",
            "parsed_at": "2026-05-15T00:00:00Z",
            "operation_count": 1,
            "operations": [
                {"id": "GET /users", "method": "GET", "path": "/users", "operation_id": "listUsers", "summary": "List users", "tags": ["User"]},
            ],
        }
    )
    sync = asset_service.sync_project_spec_assets(project, spec)
    module = sync["modules"][0]
    interface = sync["interfaces"][0]

    removed = asset_service.remove_project_module_service(module["module_id"], APIAssetModuleRemoveRequest(mode="exclude"))

    assert removed["status"] == "excluded"
    assert store.get_api_interface(interface["interface_id"])["status"] == "excluded"
    assert store.get_api_interface(interface["interface_id"])["hidden"] is True
    plan = asset_service.build_asset_test_plan_service("project-1", APIAssetTestPlanRequest(module_id=module["module_id"]))
    assert plan["risk_summary"]["included"] == 0
    assert plan["risk_summary"]["skipped"] == 1
