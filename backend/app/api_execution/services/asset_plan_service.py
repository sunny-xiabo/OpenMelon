"""Plan/sync operations for API asset catalog."""

from __future__ import annotations

import uuid
from copy import deepcopy
from typing import Any

from app.api.errors import InvalidRequestError, NotFoundError
from app.api_execution.dsl_generator import generate_api_dsl
from app.api_execution.orchestration_planner import plan_api_orchestration
from app.api_execution.schemas import APIAssetTestPlanRequest
from app.api_execution.utils import now_iso as _now_iso

from .asset_utils import (
    DEFAULT_MODULE_NAME,
    EXECUTABLE_INTERFACE_STATUSES,
    NEGATIVE_STATUS_CODES,
    _auth_injection,
    _infer_module_name,
    _interface_risk,
    _interface_to_operation,
    _json_hash,
    _matches_interface_pattern,
    _normalize_module_key,
    _orchestration_sort_key,
    _patterns,
    _risk_level,
    _source_type,
    _stable_id,
    _with_module_counts,
    _with_planned_module_counts,
)


def _get_store():
    from . import asset_service as _mod
    return _mod.api_execution_store


def _discover_dependencies_and_recommendations(
    project: dict[str, Any],
    steps: list[dict[str, Any]],
    interfaces: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], str]:
    planner_result = plan_api_orchestration(
        steps,
        operations=interfaces,
        project_context=project,
    )
    return (
        planner_result["steps"],
        planner_result["recommendations"],
        planner_result["dependency_graph"],
        planner_result["orchestration_summary"],
    )


def _normalize_setup_step(raw_step: dict[str, Any], index: int) -> dict[str, Any]:
    method = str(raw_step.get("method") or "GET").strip().upper()
    path = str(raw_step.get("path") or "").strip()
    step_id = str(raw_step.get("id") or raw_step.get("operation_id") or f"setup_{index + 1}").strip()
    if not path.startswith("/"):
        raise InvalidRequestError(message=str("前置步骤 path 必须以 / 开头"))
    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
        raise InvalidRequestError(message=str("前置步骤 method 不合法"))
    return {
        "id": step_id,
        "name": str(raw_step.get("name") or raw_step.get("summary") or f"前置步骤 {index + 1}").strip(),
        "method": method,
        "path": path,
        "operation_id": str(raw_step.get("operation_id") or step_id).strip(),
        "headers": dict(raw_step.get("headers") or {}),
        "query": dict(raw_step.get("query") or {}),
        "path_params": dict(raw_step.get("path_params") or {}),
        "body": raw_step.get("body"),
        "assertions": list(raw_step.get("assertions") or []),
        "extractions": list(raw_step.get("extractions") or []),
        "retry": raw_step.get("retry"),
        "depends_on": list(raw_step.get("depends_on") or []),
        "parallel_group": str(raw_step.get("parallel_group") or ""),
    }


def _project_dsl_steps(project: dict[str, Any], key: str, label: str) -> list[dict[str, Any]]:
    raw_steps = project.get(key) or []
    if not isinstance(raw_steps, list):
        return []
    normalized: list[dict[str, Any]] = []
    used_ids: set[str] = set()
    for index, raw_step in enumerate(raw_steps):
        if not isinstance(raw_step, dict):
            continue
        step = _normalize_setup_step(raw_step, index)
        step["phase"] = label
        base_id = step["id"]
        suffix = 1
        while step["id"] in used_ids:
            suffix += 1
            step["id"] = f"{base_id}_{suffix}"
        used_ids.add(step["id"])
        normalized.append(step)
    return normalized


def _apply_project_setup_and_auth(project: dict[str, Any], script: dict[str, Any]) -> dict[str, Any]:
    setup_steps = _project_dsl_steps(project, "setup_steps", "setup")
    cleanup_steps = _project_dsl_steps(project, "cleanup_steps", "cleanup")
    auth_headers, auth_query = _auth_injection(project)
    if not setup_steps and not cleanup_steps and not auth_headers and not auth_query:
        return script

    script = {**script}
    original_steps = [dict(step) for step in script.get("steps") or []]
    setup_ids = {step["id"] for step in setup_steps}
    rewritten_steps: list[dict[str, Any]] = []
    for step in original_steps:
        next_step = dict(step)
        if next_step.get("id") in setup_ids:
            next_step["id"] = f"asset_{next_step.get('id')}"
        if auth_headers:
            next_step["headers"] = {**auth_headers, **(next_step.get("headers") or {})}
        if auth_query:
            next_step["query"] = {**auth_query, **(next_step.get("query") or {})}
        rewritten_steps.append(next_step)
    script["steps"] = [*setup_steps, *rewritten_steps]
    script["cleanup_steps"] = cleanup_steps
    script["agent_setup_applied"] = bool(setup_steps)
    script["agent_cleanup_applied"] = bool(cleanup_steps)
    script["auth_applied"] = bool(auth_headers or auth_query)
    return script


def _is_negative_test_intent(intent: str | None) -> bool:
    normalized = str(intent or "").strip().lower()
    return normalized in {"negative", "schema_negative", "boundary"} or "负向" in normalized


def _negative_assertions() -> list[dict[str, Any]]:
    return [{"type": "status_code_in", "expected": NEGATIVE_STATUS_CODES}]


def _invalid_value_for_schema(schema: dict[str, Any]) -> Any:
    if not isinstance(schema, dict):
        return "__invalid__"
    enum_values = schema.get("enum")
    if isinstance(enum_values, list) and enum_values:
        return "__invalid_enum__"
    schema_type = schema.get("type", "string")
    if schema_type in {"integer", "number"}:
        return "not_a_number"
    if schema_type == "boolean":
        return "not_a_boolean"
    if schema_type == "array":
        return "not_an_array"
    if schema_type == "object":
        return "not_an_object"
    return ""


def _negative_step(base_step: dict[str, Any], interface: dict[str, Any], case_id: str, case_label: str) -> dict[str, Any]:
    step = deepcopy(base_step)
    step["id"] = f"{base_step.get('id', 's')}_{case_id}"
    step["name"] = f"{base_step.get('name') or interface.get('interface_key')} - {case_label}"
    step["module_id"] = interface.get("module_id", "")
    step["interface_id"] = interface.get("interface_id", "")
    step["interface_key"] = interface.get("interface_key", "")
    step["assertions"] = _negative_assertions()
    return step


def _negative_parameter_cases(base_step: dict[str, Any], interface: dict[str, Any], operation: dict[str, Any]) -> list[dict[str, Any]]:
    field_by_location = {"query": "query", "header": "headers", "path": "path_params"}
    cases: list[dict[str, Any]] = []
    for param in operation.get("parameters") or []:
        if len(cases) >= 3:
            break
        name = str(param.get("name") or "").strip()
        location = str(param.get("in") or "").strip()
        field = field_by_location.get(location)
        if not name or not field:
            continue
        schema = param.get("schema") or {}
        if param.get("required") is True and location in {"query", "header"}:
            step = _negative_step(base_step, interface, f"missing_{location}_{name}", f"缺少必填 {location} 参数 {name}")
            step.setdefault(field, {}).pop(name, None)
            cases.append(step)
        invalid_value = _invalid_value_for_schema(schema)
        if invalid_value not in (None, "") or schema.get("type") == "string" or schema.get("enum"):
            step = _negative_step(base_step, interface, f"invalid_{location}_{name}", f"非法 {location} 参数 {name}")
            step.setdefault(field, {})[name] = invalid_value
            cases.append(step)
    return cases[:3]


def _json_request_schema(operation: dict[str, Any]) -> dict[str, Any]:
    request_body = operation.get("request_body") or {}
    content = request_body.get("content", {}) if isinstance(request_body, dict) else {}
    json_content = content.get("application/json") or next(iter(content.values()), None) if content else None
    if not isinstance(json_content, dict):
        return {}
    schema = json_content.get("schema") or {}
    return schema if isinstance(schema, dict) else {}


def _negative_body_cases(base_step: dict[str, Any], interface: dict[str, Any], operation: dict[str, Any]) -> list[dict[str, Any]]:
    schema = _json_request_schema(operation)
    if not schema or not isinstance(base_step.get("body"), dict):
        return []
    body = base_step.get("body") or {}
    properties = schema.get("properties") or {}
    cases: list[dict[str, Any]] = []

    for name in schema.get("required") or []:
        if name in body:
            step = _negative_step(base_step, interface, f"missing_body_{name}", f"缺少必填 Body 字段 {name}")
            next_body = dict(step.get("body") or {})
            next_body.pop(name, None)
            step["body"] = next_body
            cases.append(step)
            break

    for name, prop_schema in properties.items():
        if name not in body:
            continue
        invalid_value = _invalid_value_for_schema(prop_schema if isinstance(prop_schema, dict) else {})
        if invalid_value is None:
            continue
        step = _negative_step(base_step, interface, f"invalid_body_{name}", f"非法 Body 字段 {name}")
        next_body = dict(step.get("body") or {})
        next_body[name] = invalid_value
        step["body"] = next_body
        cases.append(step)
        break

    return cases[:2]


def _build_negative_dsl(project: dict[str, Any], included: list[dict[str, Any]]) -> dict[str, Any] | None:
    if not included:
        return None
    spec = {
        "spec_id": f"asset-neg-{project.get('project_id', '')[:8]}",
        "info": {"title": project.get("name") or "项目接口资产"},
        "servers": [],
        "operations": [_interface_to_operation(item) for item in included],
    }
    generated = generate_api_dsl(spec, [item.get("interface_id", "") for item in included])
    negative_steps: list[dict[str, Any]] = []
    for index, base_step in enumerate(generated.get("steps") or []):
        interface = included[index]
        operation = _interface_to_operation(interface)
        cases = [
            *_negative_parameter_cases(base_step, interface, operation),
            *_negative_body_cases(base_step, interface, operation),
        ]
        negative_steps.extend(cases[:3])
    if not negative_steps:
        return None
    return {
        **generated,
        "case_id": f"NEG_{project.get('project_id', '')[:8]}_{uuid.uuid4().hex[:6]}",
        "name": f"{project.get('name') or 'API'} 参数负向测试",
        "target_project": project.get("name") or generated.get("target_project", ""),
        "agent_source": "api_asset_catalog",
        "agent_test_intent": "negative",
        "steps": negative_steps,
    }


def _failure_summary(result: dict[str, Any]) -> str:
    error = str(result.get("error") or "").strip()
    if error:
        return error[:300]
    for assertion in result.get("assertions") or []:
        if assertion.get("passed") is False:
            return str(assertion.get("message") or assertion.get("type") or "断言失败")[:300]
    return ""


def _active_interface_counts(project_id: str) -> dict[str, int]:
    store = _get_store()
    counts: dict[str, int] = {}
    for item in store.list_api_interfaces(project_id, limit=1000):
        if item.get("status") in {"removed", "deprecated", "hidden"} or item.get("hidden"):
            continue
        module_id = item.get("module_id", "")
        counts[module_id] = counts.get(module_id, 0) + 1
    return counts


def _build_project_asset_plan(project: dict[str, Any], spec: dict[str, Any], *, commit: bool) -> dict[str, Any]:
    store = _get_store()
    project_id = project.get("project_id", "")
    spec_id = spec.get("spec_id", "")
    imported_at = _now_iso()
    existing_interfaces = {
        item.get("interface_key", ""): item
        for item in store.list_api_interfaces(project_id, limit=1000)
    }
    existing_modules = {
        item.get("module_key", ""): item
        for item in store.list_api_modules(project_id)
    }

    diff = {"added": 0, "changed": 0, "removed": 0, "unchanged": 0}
    seen_keys: set[str] = set()
    saved_modules_by_key: dict[str, dict[str, Any]] = dict(existing_modules)
    saved_interfaces: list[dict[str, Any]] = []

    for operation in spec.get("operations") or []:
        method = str(operation.get("method") or "").upper()
        path = str(operation.get("path") or "")
        if not method or not path:
            continue
        interface_key = f"{method} {path}"
        seen_keys.add(interface_key)

        existing = existing_interfaces.get(interface_key) or {}
        inferred_module_name = _infer_module_name(operation)
        module_key = existing.get("module_key") or _normalize_module_key(inferred_module_name)
        module = saved_modules_by_key.get(module_key)
        if not module:
            module = {
                "module_id": _stable_id("module", project_id, module_key),
                "project_id": project_id,
                "module_key": module_key,
                "name": inferred_module_name,
                "description": "",
                "status": "active",
                "sort_order": len(saved_modules_by_key) * 10 + 100,
                "source": "auto",
                "path_prefixes": [],
                "tag_aliases": [inferred_module_name] if inferred_module_name != DEFAULT_MODULE_NAME else [],
                "updated_at": imported_at,
            }
            if commit:
                module = store.save_api_module(module)
            saved_modules_by_key[module_key] = module
        elif module.get("status") != "active":
            module = {**module, "status": "active", "updated_at": imported_at}
            if commit:
                module = store.save_api_module(module)
            saved_modules_by_key[module_key] = module

        op_hash = _json_hash(operation)
        if not existing:
            diff["added"] += 1
            change_state = "added"
            status = "active"
        elif existing.get("current_hash") != op_hash:
            diff["changed"] += 1
            change_state = "changed"
            status = existing.get("status") if existing.get("status") == "excluded" else "changed"
        else:
            diff["unchanged"] += 1
            change_state = "unchanged"
            status = existing.get("status") if existing.get("status") == "excluded" else "active"

        interface = {
            **existing,
            "interface_id": existing.get("interface_id") or _stable_id("interface", project_id, interface_key),
            "project_id": project_id,
            "module_id": module["module_id"],
            "module_key": module["module_key"],
            "module_name": module["name"],
            "interface_key": interface_key,
            "method": method,
            "path": path,
            "operation_id": operation.get("operation_id", ""),
            "summary": operation.get("summary", ""),
            "description": operation.get("description", ""),
            "tags": operation.get("tags") or [],
            "risk_level": existing.get("risk_level") or _risk_level(method, project, interface_key),
            "status": status,
            "current_spec_id": spec_id,
            "current_hash": op_hash,
            "last_seen_at": imported_at,
            "source": "openapi",
            "change_state": change_state,
            "operation": operation,
        }
        if commit:
            interface = store.save_api_interface(interface)
        saved_interfaces.append(interface)

    for interface_key, existing in existing_interfaces.items():
        if interface_key in seen_keys or existing.get("status") == "removed":
            continue
        removed = {
            **existing,
            "status": "removed",
            "change_state": "removed",
            "removed_at": imported_at,
        }
        if commit:
            removed = store.save_api_interface(removed)
        saved_interfaces.append(removed)
        diff["removed"] += 1

    spec_version = {
        "spec_version_id": str(uuid.uuid4()),
        "project_id": project_id,
        "spec_id": spec_id,
        "source_type": _source_type(spec),
        "source_url": spec.get("source_url") or "",
        "filename": spec.get("filename") or "",
        "content_hash": spec.get("content_hash") or "",
        "imported_at": imported_at,
        "operation_count": len(spec.get("operations") or []),
        "diff_summary": diff,
    }
    if commit:
        spec_version = store.save_api_spec_version(spec_version)
        modules = _with_module_counts(project_id, store.list_api_modules(project_id))
    else:
        modules = _with_planned_module_counts(list(saved_modules_by_key.values()), saved_interfaces)
    return {
        "project_id": project_id,
        "spec_id": spec_id,
        "spec_version": spec_version,
        "diff_summary": diff,
        "modules": modules,
        "interfaces": saved_interfaces,
    }


def preview_project_spec_assets(project: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
    """Calculate catalog changes without mutating persisted project assets."""
    return _build_project_asset_plan(project, spec, commit=False)


def sync_project_spec_assets(project: dict[str, Any], spec: dict[str, Any]) -> dict[str, Any]:
    """Sync parsed spec operations into the long-lived project API catalog."""
    return _build_project_asset_plan(project, spec, commit=True)


def ensure_project_assets(project: dict[str, Any]) -> dict[str, Any] | None:
    store = _get_store()
    project_id = project.get("project_id", "")
    if not project_id or not project.get("spec_id"):
        return None
    if store.count_api_interfaces(project_id) > 0:
        return None
    spec = store.get_spec(project.get("spec_id", ""))
    if not spec:
        return None
    return sync_project_spec_assets(project, spec)


def _project_and_spec(project_id: str, spec_id: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    store = _get_store()
    project = store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    resolved_spec_id = spec_id or project.get("spec_id", "")
    if not resolved_spec_id:
        raise InvalidRequestError(message=str("项目未绑定接口资产"))
    spec = store.get_spec(resolved_spec_id)
    if not spec:
        raise NotFoundError(message=str("OpenAPI 资产不存在"))
    return project, spec


def preview_project_assets_service(project_id: str, spec_id: str | None = None) -> dict[str, Any]:
    project, spec = _project_and_spec(project_id, spec_id)
    return preview_project_spec_assets(project, spec)


def sync_project_assets_service(project_id: str, spec_id: str | None = None) -> dict[str, Any]:
    store = _get_store()
    project, spec = _project_and_spec(project_id, spec_id)
    if spec.get("spec_id") and project.get("spec_id") != spec.get("spec_id"):
        project = store.save_project(
            {
                **project,
                "spec_id": spec.get("spec_id"),
                "updated_at": _now_iso(),
            }
        )
    return sync_project_spec_assets(project, spec)


def build_asset_test_plan_service(project_id: str, request: APIAssetTestPlanRequest) -> dict[str, Any]:
    store = _get_store()
    project = store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    ensure_project_assets(project)

    module_id = request.module_id or ""
    if request.interface_ids:
        selected = [
            item
            for interface_id in request.interface_ids
            if (item := store.get_api_interface(interface_id)) and item.get("project_id") == project_id
        ]
    else:
        selected = store.list_api_interfaces(project_id, module_id=module_id or None, limit=1000)

    selected_by_id = {item.get("interface_id", ""): item for item in selected if item.get("interface_id")}
    interfaces = list(selected_by_id.values())
    allowlist = _patterns(project.get("operation_allowlist"))
    blocklist = _patterns(project.get("operation_blocklist"))
    included: list[dict[str, Any]] = []
    skipped: list[dict[str, Any]] = []
    risk_summary = {"low": 0, "medium": 0, "high": 0, "blocked": 0, "included": 0, "skipped": 0}
    high_risk_candidates = 0

    for interface in interfaces:
        interface_key = interface.get("interface_key", "")
        risk = _interface_risk(project, interface)
        risk_summary[risk] = risk_summary.get(risk, 0) + 1
        reason = ""
        if interface.get("hidden"):
            reason = "接口已隐藏，默认不纳入 Agent 测试"
        elif interface.get("status") not in EXECUTABLE_INTERFACE_STATUSES:
            reason = f"接口状态为 {interface.get('status') or 'unknown'}，暂不执行"
        elif risk == "blocked":
            reason = "接口风险等级为 blocked，禁止自动执行"
        elif _matches_interface_pattern(interface_key, blocklist):
            reason = "命中项目接口黑名单"
        elif allowlist and not _matches_interface_pattern(interface_key, allowlist):
            reason = "不在项目接口白名单内"
        elif risk == "high" and not request.include_high_risk:
            high_risk_candidates += 1
            reason = "高风险接口，需要人工确认后纳入"

        if reason:
            risk_summary["skipped"] += 1
            skipped.append(
                {
                    "interface_id": interface.get("interface_id", ""),
                    "interface_key": interface_key,
                    "method": interface.get("method", ""),
                    "path": interface.get("path", ""),
                    "summary": interface.get("summary", ""),
                    "risk_level": risk,
                    "reason": reason,
                }
            )
            continue

        risk_summary["included"] += 1
        included.append({**interface, "risk_level": risk})

    script = None
    recommendations: list[dict[str, Any]] = []
    dependency_graph: list[dict[str, Any]] = []
    orchestration_summary = ""
    if included:
        included = sorted(included, key=_orchestration_sort_key)
        if _is_negative_test_intent(request.test_intent):
            script = _build_negative_dsl(project, included)
            orchestration_summary = "负向测试按接口资产顺序生成代表性参数校验场景，不自动串联业务依赖。"
        else:
            spec = {
                "spec_id": f"asset-{project_id[:8]}",
                "info": {"title": project.get("name") or "项目接口资产"},
                "servers": [],
                "operations": [_interface_to_operation(item) for item in included],
            }
            generated = generate_api_dsl(spec, [item.get("interface_id", "") for item in included])
            steps = []
            for index, step in enumerate(generated.get("steps") or []):
                interface = included[index]
                steps.append(
                    {
                        **step,
                        "module_id": interface.get("module_id", ""),
                        "interface_id": interface.get("interface_id", ""),
                        "interface_key": interface.get("interface_key", ""),
                    }
                )
            steps, recommendations, dependency_graph, orchestration_summary = _discover_dependencies_and_recommendations(project, steps, included)
            script = {
                **generated,
                "case_id": f"ASSET_{project_id[:8]}_{uuid.uuid4().hex[:6]}",
                "name": f"{project.get('name') or 'API'} 模块接口冒烟测试",
                "target_project": project.get("name") or generated.get("target_project", ""),
                "agent_source": "api_asset_catalog",
                "agent_test_intent": request.test_intent or "smoke",
                "agent_high_risk_approved": bool(request.include_high_risk and any(_interface_risk(project, item) == "high" for item in included)),
                "steps": steps,
            }
        if script:
            script["agent_high_risk_approved"] = bool(request.include_high_risk and any(_interface_risk(project, item) == "high" for item in included))
            script["agent_test_intent"] = request.test_intent or script.get("agent_test_intent") or "smoke"
            script = _apply_project_setup_and_auth(project, script)

    return {
        "project_id": project_id,
        "module_id": module_id,
        "test_intent": request.test_intent or "smoke",
        "script": script,
        "included_interfaces": included,
        "skipped_interfaces": skipped,
        "risk_summary": risk_summary,
        "recommendations": recommendations,
        "dependency_graph": dependency_graph,
        "orchestration_summary": orchestration_summary,
        "requires_high_risk_confirmation": bool(high_risk_candidates),
        "summary": f"计划纳入 {len(included)} 个接口，跳过 {len(skipped)} 个接口。",
    }


def _asset_impact_response(
    project_id: str,
    *,
    spec_id: str = "",
    diff_summary: dict[str, int] | None = None,
    modules: list[dict[str, Any]],
    interfaces: list[dict[str, Any]],
) -> dict[str, Any]:
    store = _get_store()
    impacted = [
        item
        for item in interfaces
        if item.get("source") != "manual" and item.get("change_state") in {"added", "changed", "removed"}
    ]
    suggested = [
        item
        for item in impacted
        if item.get("change_state") in {"added", "changed"}
        and item.get("status") in EXECUTABLE_INTERFACE_STATUSES
        and not item.get("hidden")
        and _interface_risk(store.get_project(project_id) or {}, item) != "blocked"
    ]
    removed = [item for item in impacted if item.get("change_state") == "removed" or item.get("status") == "removed"]
    impacted_counts: dict[str, int] = {}
    for item in impacted:
        module_id = item.get("module_id", "")
        impacted_counts[module_id] = impacted_counts.get(module_id, 0) + 1
    impacted_modules = [
        {**module, "interface_count": impacted_counts.get(module.get("module_id", ""), 0)}
        for module in modules
        if impacted_counts.get(module.get("module_id", ""), 0)
    ]
    return {
        "project_id": project_id,
        "spec_id": spec_id,
        "diff_summary": diff_summary or {},
        "impacted_modules": impacted_modules,
        "impacted_interfaces": impacted,
        "suggested_interface_ids": [item.get("interface_id", "") for item in suggested if item.get("interface_id")],
        "removed_interface_ids": [item.get("interface_id", "") for item in removed if item.get("interface_id")],
        "summary": f"发现 {len(impacted)} 个受影响接口，建议重测 {len(suggested)} 个接口。",
    }


def get_project_asset_impact_service(project_id: str, spec_id: str | None = None) -> dict[str, Any]:
    store = _get_store()
    project = store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    ensure_project_assets(project)
    if spec_id:
        _, spec = _project_and_spec(project_id, spec_id)
        preview = preview_project_spec_assets(project, spec)
        return _asset_impact_response(
            project_id,
            spec_id=spec.get("spec_id", ""),
            diff_summary=preview.get("diff_summary") or {},
            modules=preview.get("modules") or [],
            interfaces=preview.get("interfaces") or [],
        )
    modules = _with_module_counts(project_id, store.list_api_modules(project_id))
    interfaces = store.list_api_interfaces(project_id, limit=1000)
    versions = store.list_api_spec_versions(project_id, limit=1)
    return _asset_impact_response(
        project_id,
        spec_id=project.get("spec_id") or "",
        diff_summary=(versions[0].get("diff_summary", {}) if versions else {}),
        modules=modules,
        interfaces=interfaces,
    )
