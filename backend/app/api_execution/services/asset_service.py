"""Project API asset catalog services."""

from __future__ import annotations

import hashlib
import json
import re
import uuid
from copy import deepcopy
from base64 import b64encode
from fnmatch import fnmatch
from typing import Any

from app.api.errors import InvalidRequestError, NotFoundError
from app.api_execution.dsl_generator import generate_api_dsl
from app.api_execution.schemas import (
    APIAssetInterfaceCreateRequest,
    APIAssetInterfaceUpdateRequest,
    APIAssetModuleCreateRequest,
    APIAssetModuleMergeRequest,
    APIAssetModuleRemoveRequest,
    APIAssetModuleUpdateRequest,
    APIAssetTestPlanRequest,
)
from app.api_execution.storage import api_execution_store
from app.api_execution.utils import now_iso as _now_iso

DEFAULT_MODULE_NAME = "未分组"
EXECUTABLE_INTERFACE_STATUSES = {"active", "changed"}
VALID_INTERFACE_RISKS = {"low", "medium", "high", "blocked"}
VALID_INTERFACE_STATUSES = {"active", "changed", "deprecated", "removed", "hidden", "excluded"}
NEGATIVE_STATUS_CODES = [400, 401, 403, 404, 409, 422]
AUTH_TOKENS = {"auth", "login", "signin", "token", "session", "oauth"}
CREATE_TOKENS = {"create", "add", "new", "submit", "register", "生成", "创建", "新增"}
RESOURCE_STOPWORDS = {"api", "v1", "v2", "v3"}


def _json_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _stable_id(prefix: str, *parts: str) -> str:
    raw = "|".join(str(part or "") for part in parts)
    return f"{prefix}-{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:24]}"


def _normalize_module_key(name: str) -> str:
    normalized = re.sub(r"\s+", "-", (name or "").strip().lower())
    normalized = re.sub(r"[^0-9a-zA-Z_\-\u4e00-\u9fff]+", "-", normalized).strip("-")
    return normalized or "ungrouped"


def _module_name_from_path(path: str) -> str:
    for segment in (path or "").strip("/").split("/"):
        clean = segment.strip()
        if not clean or clean.startswith("{"):
            continue
        if clean.lower() == "api" or re.fullmatch(r"v\d+", clean.lower()):
            continue
        return clean.replace("-", " ").replace("_", " ").strip().title() or DEFAULT_MODULE_NAME
    return DEFAULT_MODULE_NAME


def _infer_module_name(operation: dict[str, Any]) -> str:
    tags = [str(tag).strip() for tag in operation.get("tags") or [] if str(tag).strip()]
    if tags:
        return tags[0]
    return _module_name_from_path(operation.get("path", ""))


def _source_type(spec: dict[str, Any]) -> str:
    if spec.get("source_url"):
        return "url"
    if spec.get("filename"):
        return "file"
    return "unknown"


def _risk_level(method: str, project: dict[str, Any], interface_key: str) -> str:
    overrides = project.get("risk_overrides") or {}
    if interface_key in overrides:
        return overrides[interface_key]
    method = method.upper()
    if method == "DELETE":
        return "high"
    if method in {"POST", "PUT", "PATCH"}:
        return "medium"
    return "low"


def _patterns(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip().lower() for item in value if str(item).strip()]


def _matches_interface_pattern(interface_key: str, patterns: list[str]) -> bool:
    signature = str(interface_key or "").lower()
    path = signature.split(" ", 1)[1] if " " in signature else signature
    return any(fnmatch(candidate, pattern) or candidate == pattern for pattern in patterns for candidate in (signature, path))


def _interface_risk(project: dict[str, Any], interface: dict[str, Any]) -> str:
    stored = str(interface.get("risk_level") or "").lower()
    if stored in VALID_INTERFACE_RISKS:
        return stored
    return _risk_level(interface.get("method", ""), project, interface.get("interface_key", ""))


def _interface_to_operation(interface: dict[str, Any]) -> dict[str, Any]:
    operation = dict(interface.get("operation") or {})
    operation.update(
        {
            "id": interface.get("interface_id", ""),
            "method": (interface.get("method") or operation.get("method") or "GET").upper(),
            "path": interface.get("path") or operation.get("path") or "",
            "operation_id": interface.get("operation_id") or operation.get("operation_id") or interface.get("interface_key", ""),
            "summary": interface.get("summary") or operation.get("summary") or interface.get("interface_key", ""),
            "description": interface.get("description") or operation.get("description", ""),
            "tags": interface.get("tags") or operation.get("tags") or [],
        }
    )
    operation.setdefault("parameters", [])
    operation.setdefault("request_body", {})
    operation.setdefault("responses", {"200": {"description": "OK"}})
    operation.setdefault("security", [])
    return operation


def _tokenize_text(value: str) -> set[str]:
    normalized = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", " ", str(value or "").lower())
    return {item for item in normalized.split() if item}


def _singular_resource(value: str) -> str:
    text = re.sub(r"[^0-9a-zA-Z]+", "_", str(value or "").lower()).strip("_")
    if text.endswith("ies") and len(text) > 3:
        text = f"{text[:-3]}y"
    elif text.endswith("s") and len(text) > 3:
        text = text[:-1]
    return text


def _resource_name_from_path(path: str) -> str:
    segments: list[str] = []
    for raw_segment in str(path or "").split("/"):
        stripped = raw_segment.strip()
        if not stripped or (stripped.startswith("{") and stripped.endswith("}")):
            continue
        segments.append(stripped)
    static_segments = [
        segment
        for segment in segments
        if segment.lower() not in RESOURCE_STOPWORDS
        and not re.fullmatch(r"v\d+", segment.lower())
    ]
    if static_segments:
        return _singular_resource(static_segments[-1])
    return _singular_resource(segments[-1] if segments else "")


def _interface_text(interface: dict[str, Any]) -> str:
    return " ".join(
        str(interface.get(key) or "")
        for key in ("operation_id", "summary", "description", "interface_key", "path")
    ).lower()


def _looks_like_auth_interface(interface: dict[str, Any]) -> bool:
    tokens = _tokenize_text(_interface_text(interface))
    return bool(tokens & AUTH_TOKENS)


def _looks_like_create_interface(interface: dict[str, Any]) -> bool:
    if _looks_like_auth_interface(interface):
        return False
    if str(interface.get("method") or "").upper() != "POST":
        return False
    tokens = _tokenize_text(_interface_text(interface))
    return bool(tokens & CREATE_TOKENS) or "{" not in str(interface.get("path") or "")


def _orchestration_sort_key(interface: dict[str, Any]) -> tuple[int, str]:
    method = str(interface.get("method") or "").upper()
    path = str(interface.get("path") or "")
    if _looks_like_auth_interface(interface):
        bucket = 0
    elif _looks_like_create_interface(interface):
        bucket = 1
    elif method == "GET" and "{" in path:
        bucket = 2
    elif method in {"PUT", "PATCH"}:
        bucket = 3
    elif method == "GET":
        bucket = 4
    elif method == "DELETE":
        bucket = 5
    else:
        bucket = 6
    return bucket, _resource_name_from_path(path), path


def _variable_name_for_resource(resource: str) -> str:
    return f"{resource or 'created'}_id"


def _step_has_extraction(step: dict[str, Any], name: str) -> bool:
    return any(item.get("name") == name for item in step.get("extractions") or [])


def _ensure_depends_on(step: dict[str, Any], dependency: str) -> None:
    if not dependency or dependency == step.get("id"):
        return
    current = list(step.get("depends_on") or [])
    if dependency not in current:
        current.append(dependency)
    step["depends_on"] = current


def _matches_resource_param(param_name: str, resource: str) -> bool:
    param = _singular_resource(str(param_name or "").replace("_id", "").replace("id", ""))
    resource = _singular_resource(resource)
    return bool(param and resource and (param == resource or param in resource or resource in param))


def _is_generic_id_param(param_name: str) -> bool:
    return str(param_name or "").lower() in {"id", "uuid"}


def _discover_dependencies_and_recommendations(
    project: dict[str, Any],
    steps: list[dict[str, Any]],
    interfaces: list[dict[str, Any]],
) -> tuple[list[dict[str, Any]], list[dict[str, Any]], list[dict[str, Any]], str]:
    recommendations: list[dict[str, Any]] = []
    dependency_graph: list[dict[str, Any]] = []
    producers: dict[str, dict[str, str]] = {}
    auth_step_id = ""

    if not project.get("auth_config") and not project.get("setup_steps") and not any(_looks_like_auth_interface(item) for item in interfaces):
        recommendations.append(
            {
                "type": "missing_config",
                "severity": "warning",
                "title": "缺少项目级认证或登录前置",
                "message": "如果这些接口需要登录，建议在项目配置中维护认证和 setup_steps，或把登录接口纳入本次链路。",
            }
        )

    for step, interface in zip(steps, interfaces):
        resource = _resource_name_from_path(interface.get("path", ""))
        step_id = step.get("id", "")
        if _looks_like_auth_interface(interface):
            auth_step_id = auth_step_id or step_id
            if not _step_has_extraction(step, "access_token"):
                step.setdefault("extractions", []).append({"name": "access_token", "source": "body", "path": "data.token"})
                recommendations.append(
                    {
                        "type": "dependency",
                        "severity": "info",
                        "title": "已补充登录 token 提取占位",
                        "message": f"{step.get('name') or step_id} 暂按 data.token 提取 access_token，请按真实响应确认。",
                        "step_id": step_id,
                    }
                )
        elif auth_step_id:
            _ensure_depends_on(step, auth_step_id)
            if not any(str(key).lower() == "authorization" for key in (step.get("headers") or {})):
                step.setdefault("headers", {})["Authorization"] = "Bearer {{access_token}}"
            dependency_graph.append(
                {
                    "from": auth_step_id,
                    "to": step_id,
                    "type": "auth",
                    "reason": "登录/鉴权步骤先提取 access_token，后续接口使用 Authorization。",
                }
            )

        if _looks_like_create_interface(interface):
            variable_name = _variable_name_for_resource(resource)
            if not _step_has_extraction(step, variable_name):
                step.setdefault("extractions", []).append({"name": variable_name, "source": "body", "path": "data.id"})
            producers[resource] = {"step_id": step_id, "variable": variable_name}
            recommendations.append(
                {
                    "type": "dependency",
                    "severity": "info",
                    "title": "已识别创建接口",
                    "message": f"{step.get('name') or step_id} 会尝试提取 {variable_name}，供后续详情、更新或删除接口引用。",
                    "step_id": step_id,
                }
            )

        for param_name, param_value in list((step.get("path_params") or {}).items()):
            for resource_name, producer in producers.items():
                resource_matches_path = bool(resource and resource == resource_name and _is_generic_id_param(param_name))
                if not (_matches_resource_param(param_name, resource_name) or resource_matches_path):
                    continue
                step["path_params"][param_name] = "{{" + producer["variable"] + "}}"
                _ensure_depends_on(step, producer["step_id"])
                dependency_graph.append(
                    {
                        "from": producer["step_id"],
                        "to": step_id,
                        "type": "resource_id",
                        "variable": producer["variable"],
                        "reason": f"路径参数 {param_name} 复用前置创建接口提取的 {producer['variable']}。",
                    }
                )
                break
            if isinstance(param_value, str) and param_value.startswith("example_") and param_value == step.get("path_params", {}).get(param_name):
                recommendations.append(
                    {
                        "type": "missing_dependency",
                        "severity": "warning",
                        "title": "路径参数仍需确认来源",
                        "message": f"{step.get('name') or step_id} 的 {param_name} 仍是示例值，建议补充前置创建/查询步骤或手工绑定变量。",
                        "step_id": step_id,
                    }
                )

    if dependency_graph:
        summary = f"已发现 {len(dependency_graph)} 条前后置依赖，并按 登录 -> 创建 -> 详情/更新 -> 查询 -> 删除 的顺序编排。"
    else:
        summary = "未发现明确前后置依赖，已按接口风险和方法顺序生成可独立执行的测试步骤。"
    return steps, recommendations, dependency_graph, summary


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


def _auth_secret(config: dict[str, Any], value_key: str, variable_key: str) -> str:
    variable = str(config.get(variable_key) or "").strip()
    if variable:
        return "{{" + variable + "}}"
    return str(config.get(value_key) or "").strip()


def _auth_injection(project: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    config = project.get("auth_config") or {}
    if not isinstance(config, dict) or not config.get("type"):
        return {}, {}
    auth_type = str(config.get("type") or "none").strip().lower()
    if auth_type in {"", "none"}:
        return {}, {}

    headers: dict[str, Any] = {}
    query: dict[str, Any] = {}
    if auth_type == "bearer":
        token = _auth_secret(config, "token", "token_variable")
        if token:
            header_name = str(config.get("header_name") or "Authorization").strip() or "Authorization"
            prefix = str(config.get("prefix") if config.get("prefix") is not None else "Bearer").strip()
            headers[header_name] = f"{prefix} {token}".strip()
    elif auth_type == "api_key":
        name = str(config.get("name") or config.get("api_key_name") or "").strip()
        value = _auth_secret(config, "value", "value_variable")
        target = str(config.get("in") or config.get("api_key_in") or "header").strip().lower()
        if name and value:
            if target == "query":
                query[name] = value
            else:
                headers[name] = value
    elif auth_type == "basic":
        header_name = str(config.get("header_name") or "Authorization").strip() or "Authorization"
        encoded = _auth_secret(config, "encoded", "encoded_variable")
        if not encoded:
            username = str(config.get("username") or "").strip()
            password = str(config.get("password") or "").strip()
            if username or password:
                encoded = b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        if encoded:
            headers[header_name] = f"Basic {encoded}"
    return headers, query


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
    counts: dict[str, int] = {}
    for item in api_execution_store.list_api_interfaces(project_id, limit=1000):
        if item.get("status") in {"removed", "deprecated", "hidden"} or item.get("hidden"):
            continue
        module_id = item.get("module_id", "")
        counts[module_id] = counts.get(module_id, 0) + 1
    return counts


def _with_module_counts(project_id: str, modules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts = _active_interface_counts(project_id)
    return [{**module, "interface_count": counts.get(module.get("module_id", ""), 0)} for module in modules]


def _with_planned_module_counts(modules: list[dict[str, Any]], interfaces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for item in interfaces:
        if item.get("status") == "removed":
            continue
        module_id = item.get("module_id", "")
        counts[module_id] = counts.get(module_id, 0) + 1
    return [{**module, "interface_count": counts.get(module.get("module_id", ""), 0)} for module in modules]


def _build_project_asset_plan(project: dict[str, Any], spec: dict[str, Any], *, commit: bool) -> dict[str, Any]:
    project_id = project.get("project_id", "")
    spec_id = spec.get("spec_id", "")
    imported_at = _now_iso()
    existing_interfaces = {
        item.get("interface_key", ""): item
        for item in api_execution_store.list_api_interfaces(project_id, limit=1000)
    }
    existing_modules = {
        item.get("module_key", ""): item
        for item in api_execution_store.list_api_modules(project_id)
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
                module = api_execution_store.save_api_module(module)
            saved_modules_by_key[module_key] = module
        elif module.get("status") != "active":
            module = {**module, "status": "active", "updated_at": imported_at}
            if commit:
                module = api_execution_store.save_api_module(module)
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
            interface = api_execution_store.save_api_interface(interface)
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
            removed = api_execution_store.save_api_interface(removed)
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
        spec_version = api_execution_store.save_api_spec_version(spec_version)
        modules = _with_module_counts(project_id, api_execution_store.list_api_modules(project_id))
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
    project_id = project.get("project_id", "")
    if not project_id or not project.get("spec_id"):
        return None
    if api_execution_store.count_api_interfaces(project_id) > 0:
        return None
    spec = api_execution_store.get_spec(project.get("spec_id", ""))
    if not spec:
        return None
    return sync_project_spec_assets(project, spec)


def _project_and_spec(project_id: str, spec_id: str | None = None) -> tuple[dict[str, Any], dict[str, Any]]:
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    resolved_spec_id = spec_id or project.get("spec_id", "")
    if not resolved_spec_id:
        raise InvalidRequestError(message=str("项目未绑定接口资产"))
    spec = api_execution_store.get_spec(resolved_spec_id)
    if not spec:
        raise NotFoundError(message=str("OpenAPI 资产不存在"))
    return project, spec


def preview_project_assets_service(project_id: str, spec_id: str | None = None) -> dict[str, Any]:
    project, spec = _project_and_spec(project_id, spec_id)
    return preview_project_spec_assets(project, spec)


def sync_project_assets_service(project_id: str, spec_id: str | None = None) -> dict[str, Any]:
    project, spec = _project_and_spec(project_id, spec_id)
    if spec.get("spec_id") and project.get("spec_id") != spec.get("spec_id"):
        project = api_execution_store.save_project(
            {
                **project,
                "spec_id": spec.get("spec_id"),
                "updated_at": _now_iso(),
            }
        )
    return sync_project_spec_assets(project, spec)


def build_asset_test_plan_service(project_id: str, request: APIAssetTestPlanRequest) -> dict[str, Any]:
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    ensure_project_assets(project)

    module_id = request.module_id or ""
    if request.interface_ids:
        selected = [
            item
            for interface_id in request.interface_ids
            if (item := api_execution_store.get_api_interface(interface_id)) and item.get("project_id") == project_id
        ]
    else:
        selected = api_execution_store.list_api_interfaces(project_id, module_id=module_id or None, limit=1000)

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


def list_project_modules_service(project_id: str) -> dict[str, Any]:
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    ensure_project_assets(project)
    modules = _with_module_counts(project_id, api_execution_store.list_api_modules(project_id))
    return {"modules": modules}


def _asset_impact_response(
    project_id: str,
    *,
    spec_id: str = "",
    diff_summary: dict[str, int] | None = None,
    modules: list[dict[str, Any]],
    interfaces: list[dict[str, Any]],
) -> dict[str, Any]:
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
        and _interface_risk(api_execution_store.get_project(project_id) or {}, item) != "blocked"
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
    project = api_execution_store.get_project(project_id)
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
    modules = _with_module_counts(project_id, api_execution_store.list_api_modules(project_id))
    interfaces = api_execution_store.list_api_interfaces(project_id, limit=1000)
    versions = api_execution_store.list_api_spec_versions(project_id, limit=1)
    return _asset_impact_response(
        project_id,
        spec_id=project.get("spec_id") or "",
        diff_summary=(versions[0].get("diff_summary", {}) if versions else {}),
        modules=modules,
        interfaces=interfaces,
    )


def create_project_module_service(project_id: str, request: APIAssetModuleCreateRequest) -> dict[str, Any]:
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    name = str(request.name or "").strip()
    if not name:
        raise InvalidRequestError(message=str("模块名称不能为空"))
    module_key = _normalize_module_key(name)
    existing = api_execution_store.get_api_module_by_key(project_id, module_key)
    if existing and existing.get("status") != "removed":
        raise InvalidRequestError(message=str("同名模块已存在"))
    modules = api_execution_store.list_api_modules(project_id)
    now = _now_iso()
    module = {
        "module_id": str(uuid.uuid4()),
        "project_id": project_id,
        "module_key": module_key,
        "name": name,
        "description": str(request.description or "").strip(),
        "status": "active",
        "sort_order": len(modules) * 10 + 100,
        "source": "manual",
        "path_prefixes": [],
        "tag_aliases": [name],
        "updated_at": now,
    }
    return {**api_execution_store.save_api_module(module), "interface_count": 0}


def update_project_module_service(module_id: str, request: APIAssetModuleUpdateRequest) -> dict[str, Any]:
    module = api_execution_store.get_api_module(module_id)
    if not module:
        raise NotFoundError(message=str("模块不存在"))
    if request.name is not None:
        name = str(request.name).strip()
        if not name:
            raise InvalidRequestError(message=str("模块名称不能为空"))
        module["name"] = name
        module["module_key"] = _normalize_module_key(name)
    if request.description is not None:
        module["description"] = str(request.description).strip()
    if request.status is not None:
        module["status"] = str(request.status).strip()
    if request.sort_order is not None:
        module["sort_order"] = int(request.sort_order)
    module["updated_at"] = _now_iso()
    return api_execution_store.save_api_module(module)


def remove_project_module_service(module_id: str, request: APIAssetModuleRemoveRequest) -> dict[str, Any]:
    module = api_execution_store.get_api_module(module_id)
    if not module:
        raise NotFoundError(message=str("模块不存在"))
    mode = str(request.mode or "").strip()
    if mode == "delete":
        interfaces = api_execution_store.list_api_interfaces(module.get("project_id"), module_id=module_id)
        if interfaces:
            raise InvalidRequestError(message=str("模块下有接口，不能直接删除，请先迁移或排除"))
        api_execution_store.delete_api_module(module_id)
        return {**module, "deleted": True}
    if mode == "exclude":
        interfaces = api_execution_store.list_api_interfaces(module.get("project_id"), module_id=module_id)
        for iface in interfaces:
            iface["status"] = "excluded"
            iface["hidden"] = True
            iface["excluded_by_user"] = True
            iface["excluded_at"] = _now_iso()
            iface["updated_at"] = _now_iso()
            api_execution_store.save_api_interface(iface)
        module["status"] = "excluded"
        module["updated_at"] = _now_iso()
        return api_execution_store.save_api_module(module)
    target_id = str(request.target_module_id or "").strip()
    if not target_id:
        raise InvalidRequestError(message=str("迁移模式需要指定目标模块"))
    target = api_execution_store.get_api_module(target_id)
    if not target or target.get("project_id") != module.get("project_id"):
        raise InvalidRequestError(message=str("目标模块不存在或不属于同一项目"))
    interfaces = api_execution_store.list_api_interfaces(module.get("project_id"), module_id=module_id)
    for iface in interfaces:
        iface["module_id"] = target_id
        iface["module_name"] = target.get("name", "")
        iface["updated_at"] = _now_iso()
        api_execution_store.save_api_interface(iface)
    api_execution_store.delete_api_module(module_id)
    return {**module, "deleted": True}


def merge_project_module_service(module_id: str, request: APIAssetModuleMergeRequest) -> dict[str, Any]:
    module = api_execution_store.get_api_module(module_id)
    if not module:
        raise NotFoundError(message=str("模块不存在"))
    target_id = str(request.target_module_id or "").strip()
    if not target_id:
        raise InvalidRequestError(message=str("合并目标模块不能为空"))
    target = api_execution_store.get_api_module(target_id)
    if not target or target.get("project_id") != module.get("project_id"):
        raise InvalidRequestError(message=str("目标模块不存在或不属于同一项目"))
    if module_id == target_id:
        raise InvalidRequestError(message=str("不能合并到自身"))
    interfaces = api_execution_store.list_api_interfaces(module.get("project_id"), module_id=module_id)
    for iface in interfaces:
        iface["module_id"] = target_id
        iface["module_name"] = target.get("name", "")
        iface["updated_at"] = _now_iso()
        api_execution_store.save_api_interface(iface)
    module["status"] = "excluded"
    module["merged_into_module_id"] = target_id
    module["updated_at"] = _now_iso()
    return api_execution_store.save_api_module(module)


def delete_project_module_service(module_id: str) -> dict[str, Any]:
    module = api_execution_store.get_api_module(module_id)
    if not module:
        raise NotFoundError(message=str("模块不存在"))
    interfaces = api_execution_store.list_api_interfaces(module.get("project_id"), module_id=module_id)
    if interfaces:
        raise InvalidRequestError(message=str("模块下有接口，不能直接删除，请先迁移或排除"))
    api_execution_store.delete_api_module(module_id)
    return {**module, "deleted": True}


def create_project_interface_service(project_id: str, request: APIAssetInterfaceCreateRequest) -> dict[str, Any]:
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    module = api_execution_store.get_api_module(str(request.module_id or ""))
    if not module or module.get("project_id") != project_id:
        raise InvalidRequestError(message=str("目标模块不存在或不属于当前项目"))
    method = str(request.method or "").strip().upper()
    path = str(request.path or "").strip()
    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
        raise InvalidRequestError(message=str("请求方法不合法"))
    if not path.startswith("/"):
        raise InvalidRequestError(message=str("接口路径必须以 / 开头"))
    interface_key = f"{method} {path}"
    existing = api_execution_store.get_api_interface_by_key(project_id, interface_key)
    if existing:
        raise InvalidRequestError(message=str("同方法同路径接口已存在"))
    risk_level = str(request.risk_level or "low").strip().lower()
    if risk_level not in VALID_INTERFACE_RISKS:
        raise InvalidRequestError(message=str("接口风险等级不合法"))
    tags = [str(item).strip() for item in request.tags if str(item).strip()]
    now = _now_iso()
    operation = {
        "id": interface_key,
        "method": method,
        "path": path,
        "operation_id": str(request.operation_id or "").strip(),
        "summary": str(request.summary or "").strip(),
        "description": str(request.description or "").strip(),
        "tags": tags,
        "parameters": [],
        "request_body": {},
        "responses": {"200": {"description": "OK"}},
        "security": [],
    }
    interface = {
        "interface_id": str(uuid.uuid4()),
        "project_id": project_id,
        "module_id": module.get("module_id", ""),
        "module_key": module.get("module_key", ""),
        "module_name": module.get("name", ""),
        "interface_key": interface_key,
        "method": method,
        "path": path,
        "operation_id": operation["operation_id"],
        "summary": operation["summary"],
        "description": operation["description"],
        "tags": tags,
        "risk_level": risk_level,
        "status": "active",
        "current_spec_id": "",
        "current_hash": _json_hash(operation),
        "last_seen_at": now,
        "source": "manual",
        "change_state": "added",
        "operation": operation,
        "updated_at": now,
    }
    return api_execution_store.save_api_interface(interface)


def update_project_interface_service(interface_id: str, request: APIAssetInterfaceUpdateRequest) -> dict[str, Any]:
    interface = api_execution_store.get_api_interface(interface_id)
    if not interface:
        raise NotFoundError(message=str("接口资产不存在"))
    project_id = interface.get("project_id", "")
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))

    patch = request.model_dump(exclude_unset=True)
    next_interface = dict(interface)

    if "module_id" in patch and patch["module_id"]:
        module = api_execution_store.get_api_module(str(patch["module_id"]))
        if not module or module.get("project_id") != project_id:
            raise InvalidRequestError(message=str("目标模块不存在或不属于当前项目"))
        next_interface.update(
            {
                "module_id": module.get("module_id", ""),
                "module_key": module.get("module_key", ""),
                "module_name": module.get("name", ""),
            }
        )

    for field in ("summary", "description", "operation_id"):
        if field in patch and patch[field] is not None:
            next_interface[field] = str(patch[field]).strip()

    if "tags" in patch and patch["tags"] is not None:
        next_interface["tags"] = [str(item).strip() for item in patch["tags"] if str(item).strip()]

    if "risk_level" in patch and patch["risk_level"] is not None:
        risk_level = str(patch["risk_level"]).strip().lower()
        if risk_level not in VALID_INTERFACE_RISKS:
            raise InvalidRequestError(message=str("接口风险等级不合法"))
        next_interface["risk_level"] = risk_level

    if "status" in patch and patch["status"] is not None:
        status = str(patch["status"]).strip().lower()
        if status not in VALID_INTERFACE_STATUSES:
            raise InvalidRequestError(message=str("接口状态不合法"))
        next_interface["status"] = status
        if status == "excluded":
            next_interface["hidden"] = True
            next_interface["excluded_by_user"] = True
            next_interface["excluded_at"] = _now_iso()
        elif interface.get("status") == "excluded":
            next_interface["hidden"] = False
            next_interface["excluded_by_user"] = False
            next_interface.pop("excluded_at", None)

    if "hidden" in patch and patch["hidden"] is not None:
        hidden = bool(patch["hidden"])
        next_interface["hidden"] = hidden
        if hidden:
            next_interface["status"] = "hidden"
        elif next_interface.get("status") == "hidden":
            next_interface["status"] = "active"

    if interface.get("source") == "manual":
        method = patch.get("method")
        path = patch.get("path")
        if method is not None:
            next_method = str(method).strip().upper()
            if next_method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
                raise InvalidRequestError(message=str("请求方法不合法"))
            next_interface["method"] = next_method
        if path is not None:
            next_path = str(path).strip()
            if not next_path.startswith("/"):
                raise InvalidRequestError(message=str("接口路径必须以 / 开头"))
            next_interface["path"] = next_path
        next_key = f"{next_interface.get('method', '').upper()} {next_interface.get('path', '')}".strip()
        existing = api_execution_store.get_api_interface_by_key(project_id, next_key)
        if existing and existing.get("interface_id") != interface_id:
            raise InvalidRequestError(message=str("同方法同路径接口已存在"))
        next_interface["interface_key"] = next_key
    elif "method" in patch or "path" in patch:
        raise InvalidRequestError(message=str("OpenAPI 导入接口不允许修改 method/path，请从规范同步变更"))

    next_interface["updated_at"] = _now_iso()
    if next_interface.get("operation"):
        operation = dict(next_interface.get("operation") or {})
        for field in ("summary", "description", "operation_id", "tags", "method", "path"):
            if field in next_interface:
                operation[field] = next_interface[field]
        next_interface["current_hash"] = _json_hash(operation)
        next_interface["operation"] = operation

    return api_execution_store.save_api_interface(next_interface)


def delete_project_interface_service(interface_id: str) -> dict[str, Any]:
    interface = api_execution_store.get_api_interface(interface_id)
    if not interface:
        raise NotFoundError(message=str("接口资产不存在"))
    if interface.get("source") != "manual":
        raise InvalidRequestError(message=str("OpenAPI 同步接口不支持物理删除，请通过隐藏、废弃或规范同步移除"))
    deleted = api_execution_store.delete_api_interface(interface_id)
    return {"deleted": bool(deleted), "interface_id": interface_id}


def list_project_interfaces_service(
    project_id: str,
    *,
    module_id: str | None = None,
    status: str | None = None,
    risk_level: str | None = None,
    keyword: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    ensure_project_assets(project)
    safe_limit = max(1, min(limit, 1000))
    safe_offset = max(0, offset)
    safe_status = status if status in {"active", "changed", "removed", "deprecated"} else None
    safe_risk = risk_level if risk_level in VALID_INTERFACE_RISKS else None
    items = api_execution_store.list_api_interfaces(
        project_id,
        module_id=module_id,
        status=safe_status,
        risk_level=safe_risk,
        keyword=keyword,
        limit=safe_limit,
        offset=safe_offset,
    )
    total = api_execution_store.count_api_interfaces(project_id, module_id=module_id, status=safe_status, risk_level=safe_risk, keyword=keyword)
    return {"total": total, "limit": safe_limit, "offset": safe_offset, "items": items, "interfaces": items}


def get_project_assets_service(project_id: str) -> dict[str, Any]:
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    sync_result = ensure_project_assets(project)
    modules = _with_module_counts(project_id, api_execution_store.list_api_modules(project_id))
    interfaces = api_execution_store.list_api_interfaces(project_id, limit=1000)
    versions = api_execution_store.list_api_spec_versions(project_id, limit=10)
    latest_diff = (sync_result or {}).get("diff_summary") or (versions[0].get("diff_summary", {}) if versions else {})
    return {
        "project": project,
        "modules": modules,
        "interfaces": interfaces,
        "spec_versions": versions,
        "latest_diff_summary": latest_diff,
    }


def update_interface_test_results(report: dict[str, Any]) -> None:
    project_id = str((report.get("execution_options") or {}).get("project_id") or "")
    if not project_id:
        return
    script = report.get("script") or {}
    steps_by_id = {
        str(step.get("id")): step
        for step in script.get("steps") or []
        if step.get("id")
    }
    tested_at = report.get("finished_at") or report.get("run_at") or _now_iso()
    for result in report.get("results") or []:
        step = steps_by_id.get(str(result.get("step_id") or ""))
        if not step:
            continue
        interface = None
        interface_id = step.get("interface_id")
        if interface_id:
            interface = api_execution_store.get_api_interface(interface_id)
        if not interface:
            interface_key = f"{str(step.get('method') or '').upper()} {step.get('path') or ''}".strip()
            interface = api_execution_store.get_api_interface_by_key(project_id, interface_key)
        if not interface or interface.get("project_id") != project_id:
            continue
        status_code = result.get("status_code")
        api_execution_store.save_api_interface(
            {
                **interface,
                "last_tested_at": tested_at,
                "last_test_status": result.get("status") or "failed",
                "last_status_code": status_code if isinstance(status_code, int) else None,
                "last_failure_summary": _failure_summary(result),
            }
        )


__all__ = [name for name in globals() if not name.startswith("__")]
