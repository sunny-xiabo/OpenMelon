"""Lightweight deterministic orchestration planner for API execution DSL steps."""

from __future__ import annotations

import re
from copy import deepcopy
from typing import Any

AUTH_TOKENS = {"auth", "login", "signin", "token", "session", "oauth"}
CREATE_TOKENS = {"create", "add", "new", "submit", "register", "生成", "创建", "新增"}
RESOURCE_STOPWORDS = {"api", "v1", "v2", "v3"}
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
READ_METHODS = {"GET", "HEAD"}


def plan_api_orchestration(
    steps: list[dict[str, Any]],
    *,
    operations: list[dict[str, Any]] | None = None,
    variables: dict[str, Any] | None = None,
    project_context: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Apply conservative dependency and parallel-group orchestration rules."""
    planned_steps = deepcopy(steps or [])
    operation_by_step_id = _operation_lookup(planned_steps, operations or [])
    patch_operations: list[dict[str, Any]] = []
    dependency_graph: list[dict[str, Any]] = []
    recommendations: list[dict[str, Any]] = []
    known_vars: dict[str, dict[str, str]] = {
        str(name): {"source_step_id": "", "source": "variable"}
        for name in (variables or {})
        if str(name).strip()
    }
    producers: dict[str, dict[str, str]] = {}
    last_write_by_resource: dict[str, str] = {}
    auth_step_id = ""

    if not _has_project_auth(project_context) and not any(_looks_like_auth_step(step, operation_by_step_id.get(step.get("id", ""))) for step in planned_steps):
        recommendations.append(
            {
                "type": "missing_config",
                "severity": "warning",
                "title": "缺少项目级认证或登录前置",
                "message": "如果这些接口需要登录，建议维护认证配置、setup_steps，或把登录接口纳入本次链路。",
            }
        )

    for step in planned_steps:
        step_id = str(step.get("id") or "")
        operation = operation_by_step_id.get(step_id)
        method = str(step.get("method") or (operation or {}).get("method") or "").upper()
        resource = _resource_name(step.get("path") or (operation or {}).get("path") or "")
        is_auth = _looks_like_auth_step(step, operation)
        variable_consumed = False

        if is_auth:
            auth_step_id = auth_step_id or step_id
            if _ensure_extraction(step, "access_token"):
                patch_operations.append(
                    _operation(step, "extractions", None, {"name": "access_token", "source": "body", "path": "data.token"}, "疑似登录/鉴权接口，补充 token 提取占位。", True)
                )
                recommendations.append(
                    {
                        "type": "dependency",
                        "severity": "info",
                        "title": "已补充登录 token 提取占位",
                        "message": f"{step.get('name') or step_id} 暂按 data.token 提取 access_token，请按真实响应确认。",
                        "step_id": step_id,
                    }
                )
            known_vars["access_token"] = {"source_step_id": step_id, "source": "auth"}
        elif auth_step_id:
            if _add_dependency(step, auth_step_id):
                patch_operations.append(_operation(step, "depends_on", None, list(step.get("depends_on") or []), "后续接口依赖登录/鉴权步骤提供 access_token。", True))
            _add_dependency_graph(
                dependency_graph,
                auth_step_id,
                step_id,
                "auth",
                "登录/鉴权步骤先提取 access_token，后续接口使用 Authorization。",
            )
            headers_before = deepcopy(step.get("headers") or {})
            headers = step.setdefault("headers", {})
            if not any(str(key).lower() == "authorization" for key in headers):
                headers["Authorization"] = "Bearer {{access_token}}"
                patch_operations.append(
                    _operation(step, "headers", headers_before, deepcopy(headers), "检测到 token 提取，补充后续步骤鉴权 Header。", True)
                )

        if _looks_like_create_step(step, operation):
            variable_name = _variable_name_for_resource(resource)
            if _ensure_extraction(step, variable_name):
                patch_operations.append(
                    _operation(step, "extractions", None, {"name": variable_name, "source": "body", "path": "data.id"}, "创建类接口补充 ID 提取，便于后续详情、更新或删除步骤引用。", True)
                )
            known_vars[variable_name] = {"source_step_id": step_id, "source": "resource_id", "resource": resource}
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

        for extraction in step.get("extractions") or []:
            name = str(extraction.get("name") or "").strip()
            if name and name not in known_vars:
                known_vars[name] = {"source_step_id": step_id, "source": "extraction"}

        for field_name in ("path_params", "query", "headers"):
            changed, consumed = _replace_mapping_variables(
                step,
                field_name,
                known_vars,
                producers,
                resource,
                dependency_graph,
                patch_operations,
            )
            variable_consumed = variable_consumed or consumed
            if changed:
                _mark_variable_consumer(step)
        changed, consumed = _replace_body_variables(step, known_vars, dependency_graph, patch_operations)
        variable_consumed = variable_consumed or consumed
        if changed:
            _mark_variable_consumer(step)

        for name, value in (step.get("path_params") or {}).items():
            if isinstance(value, str) and value.startswith("example_"):
                recommendations.append(
                    {
                        "type": "missing_dependency",
                        "severity": "warning",
                        "title": "路径参数仍需确认来源",
                        "message": f"{step.get('name') or step_id} 的 {name} 仍是示例值，建议补充前置创建/查询步骤或手工绑定变量。",
                        "step_id": step_id,
                    }
                )

        if method in WRITE_METHODS and resource:
            previous_write = last_write_by_resource.get(resource)
            if previous_write and previous_write != step_id:
                if _add_dependency(step, previous_write):
                    patch_operations.append(_operation(step, "depends_on", None, list(step.get("depends_on") or []), "同一资源写操作保持串行，避免数据竞争。", True))
                _add_dependency_graph(dependency_graph, previous_write, step_id, "serial_write", "同一资源的写操作按原始顺序串行执行。")
            last_write_by_resource[resource] = step_id

        if variable_consumed:
            _mark_variable_consumer(step)

    parallel_group_count = _assign_parallel_groups(planned_steps, patch_operations, recommendations)
    for step in planned_steps:
        step.pop("_planner_consumes_variable", None)
    pending_count = len([item for item in recommendations if item.get("severity") == "warning"])
    summary = f"已发现 {len(dependency_graph)} 条串行依赖，生成 {parallel_group_count} 个并行组，仍有 {pending_count} 个待确认项。"
    return {
        "steps": planned_steps,
        "patch_operations": patch_operations,
        "dependency_graph": dependency_graph,
        "recommendations": _unique_recommendations(recommendations),
        "orchestration_summary": summary,
        "quality_score": _quality_score(planned_steps, dependency_graph, parallel_group_count, pending_count),
    }


def _operation_lookup(steps: list[dict[str, Any]], operations: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    by_id = {str(item.get("id") or ""): item for item in operations if item.get("id")}
    by_operation_id = {str(item.get("operation_id") or ""): item for item in operations if item.get("operation_id")}
    lookup: dict[str, dict[str, Any]] = {}
    for index, step in enumerate(steps):
        step_id = str(step.get("id") or "")
        lookup[step_id] = (
            by_id.get(str(step.get("operation_id") or ""))
            or by_operation_id.get(str(step.get("operation_id") or ""))
            or (operations[index] if index < len(operations) else {})
            or {}
        )
    return lookup


def _operation(
    step: dict[str, Any],
    field: str,
    before: Any,
    after: Any,
    reason: str,
    safe_to_apply: bool,
) -> dict[str, Any]:
    return {
        "step_id": step.get("id", ""),
        "field": field,
        "before": before,
        "after": after,
        "reason": reason,
        "safe_to_apply": safe_to_apply,
    }


def _has_project_auth(project_context: dict[str, Any] | None) -> bool:
    if not isinstance(project_context, dict):
        return False
    auth_config = project_context.get("auth_config") or {}
    has_auth_config = isinstance(auth_config, dict) and str(auth_config.get("type") or "").lower() not in {"", "none"}
    return bool(has_auth_config or project_context.get("setup_steps"))


def _tokenize(value: str) -> set[str]:
    normalized = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", " ", str(value or "").lower())
    return {item for item in normalized.split() if item}


def _step_text(step: dict[str, Any], operation: dict[str, Any] | None = None) -> str:
    operation = operation or {}
    return " ".join(
        str(value or "")
        for value in (
            step.get("name"),
            step.get("path"),
            step.get("operation_id"),
            operation.get("summary"),
            operation.get("description"),
            operation.get("operation_id"),
            " ".join(map(str, operation.get("tags") or [])),
        )
    )


def _looks_like_auth_step(step: dict[str, Any], operation: dict[str, Any] | None = None) -> bool:
    return bool(_tokenize(_step_text(step, operation)) & AUTH_TOKENS)


def _looks_like_create_step(step: dict[str, Any], operation: dict[str, Any] | None = None) -> bool:
    if _looks_like_auth_step(step, operation):
        return False
    method = str(step.get("method") or (operation or {}).get("method") or "").upper()
    if method != "POST":
        return False
    text_tokens = _tokenize(_step_text(step, operation))
    return bool(text_tokens & CREATE_TOKENS) or "{" not in str(step.get("path") or (operation or {}).get("path") or "")


def _resource_name(path: str) -> str:
    segments = []
    for raw_segment in str(path or "").split("/"):
        segment = raw_segment.strip().strip("{}")
        if not segment or raw_segment.strip().startswith("{"):
            continue
        if segment.lower() in RESOURCE_STOPWORDS or re.fullmatch(r"v\d+", segment.lower()):
            continue
        segments.append(segment)
    if not segments:
        return ""
    text = re.sub(r"[^0-9a-zA-Z]+", "_", segments[-1].lower()).strip("_")
    if text.endswith("ies") and len(text) > 3:
        text = f"{text[:-3]}y"
    elif text.endswith("s") and len(text) > 3:
        text = text[:-1]
    return text


def _variable_name_for_resource(resource: str) -> str:
    return f"{resource or 'created'}_id"


def _ensure_extraction(step: dict[str, Any], name: str) -> bool:
    if any(item.get("name") == name for item in step.get("extractions") or []):
        return False
    step.setdefault("extractions", []).append({"name": name, "source": "body", "path": "data.id" if name != "access_token" else "data.token"})
    return True


def _add_dependency(step: dict[str, Any], dependency: str) -> bool:
    if not dependency or dependency == step.get("id"):
        return False
    current = list(step.get("depends_on") or [])
    if dependency in current:
        return False
    current.append(dependency)
    step["depends_on"] = current
    return True


def _add_dependency_graph(
    dependency_graph: list[dict[str, Any]],
    source: str,
    target: str,
    edge_type: str,
    reason: str,
    variable: str = "",
) -> None:
    if not source or not target or source == target:
        return
    edge = {"from": source, "to": target, "type": edge_type, "reason": reason}
    if variable:
        edge["variable"] = variable
    key = (edge["from"], edge["to"], edge["type"], edge.get("variable", ""))
    if not any((item.get("from"), item.get("to"), item.get("type"), item.get("variable", "")) == key for item in dependency_graph):
        dependency_graph.append(edge)


def _matches_resource_param(param_name: str, resource: str, step_resource: str) -> bool:
    normalized = str(param_name or "").lower().replace("-", "_")
    resource = resource.lower()
    step_resource = step_resource.lower()
    if normalized in {"id", "uuid"}:
        return bool(resource and step_resource and resource == step_resource)
    if normalized == f"{resource}_id":
        return True
    if normalized.endswith("_id"):
        name_resource = normalized.removesuffix("_id")
        return bool(resource and (name_resource == resource or name_resource in resource or resource in name_resource))
    return False


def _placeholder_for_field(
    field_name: str,
    known_vars: dict[str, dict[str, str]],
    producers: dict[str, dict[str, str]],
    step_resource: str = "",
) -> tuple[str, str]:
    normalized = str(field_name or "").lower().replace("-", "_")
    if normalized in known_vars:
        return normalized, known_vars[normalized].get("source_step_id", "")
    if "token" in normalized and "access_token" in known_vars:
        return "access_token", known_vars["access_token"].get("source_step_id", "")
    for resource, producer in producers.items():
        if _matches_resource_param(normalized, resource, step_resource):
            return producer["variable"], producer["step_id"]
    return "", ""


def _replace_mapping_variables(
    step: dict[str, Any],
    field_name: str,
    known_vars: dict[str, dict[str, str]],
    producers: dict[str, dict[str, str]],
    step_resource: str,
    dependency_graph: list[dict[str, Any]],
    patch_operations: list[dict[str, Any]],
) -> tuple[bool, bool]:
    value = step.get(field_name)
    if not isinstance(value, dict):
        return False, False
    before = deepcopy(value)
    changed = False
    consumed = False
    for name, item in list(value.items()):
        matched_var, source_step_id = _placeholder_for_field(name, known_vars, producers, step_resource)
        if not matched_var:
            continue
        placeholder = "{{" + matched_var + "}}"
        if item != placeholder and _is_replaceable_value(item):
            value[name] = placeholder
            changed = True
        if source_step_id:
            consumed = True
            if _add_dependency(step, source_step_id):
                patch_operations.append(_operation(step, "depends_on", None, list(step.get("depends_on") or []), f"{field_name}.{name} 引用前置步骤变量 {matched_var}。", True))
            _add_dependency_graph(dependency_graph, source_step_id, str(step.get("id") or ""), "variable", f"{field_name}.{name} 复用前置步骤提取的 {matched_var}。", matched_var)
    if changed:
        patch_operations.append(_operation(step, field_name, before, deepcopy(value), "补全变量引用，串联前置步骤提取结果。", True))
    return changed, consumed


def _replace_body_variables(
    step: dict[str, Any],
    known_vars: dict[str, dict[str, str]],
    dependency_graph: list[dict[str, Any]],
    patch_operations: list[dict[str, Any]],
) -> tuple[bool, bool]:
    body = step.get("body")
    before = deepcopy(body)
    changed, consumed = _replace_nested_body_variables(body, known_vars, step, dependency_graph, patch_operations, "body")
    if changed:
        patch_operations.append(_operation(step, "body", before, deepcopy(step.get("body")), "补全 Body 字段变量引用，串联前置步骤提取结果。", True))
    return changed, consumed


def _replace_nested_body_variables(
    value: Any,
    known_vars: dict[str, dict[str, str]],
    step: dict[str, Any],
    dependency_graph: list[dict[str, Any]],
    patch_operations: list[dict[str, Any]],
    location: str,
) -> tuple[bool, bool]:
    changed = False
    consumed = False
    if isinstance(value, dict):
        for key, item in list(value.items()):
            normalized = str(key or "").lower().replace("-", "_")
            if normalized in known_vars and _is_replaceable_value(item):
                matched_var = normalized
                value[key] = "{{" + matched_var + "}}"
                changed = True
                source_step_id = known_vars[matched_var].get("source_step_id", "")
                if source_step_id:
                    consumed = True
                    if _add_dependency(step, source_step_id):
                        patch_operations.append(_operation(step, "depends_on", None, list(step.get("depends_on") or []), f"{location}.{key} 引用前置步骤变量 {matched_var}。", True))
                    _add_dependency_graph(dependency_graph, source_step_id, str(step.get("id") or ""), "variable", f"{location}.{key} 复用前置步骤提取的 {matched_var}。", matched_var)
                continue
            child_changed, child_consumed = _replace_nested_body_variables(item, known_vars, step, dependency_graph, patch_operations, f"{location}.{key}")
            changed = changed or child_changed
            consumed = consumed or child_consumed
    elif isinstance(value, list):
        for index, item in enumerate(value):
            child_changed, child_consumed = _replace_nested_body_variables(item, known_vars, step, dependency_graph, patch_operations, f"{location}[{index}]")
            changed = changed or child_changed
            consumed = consumed or child_consumed
    return changed, consumed


def _is_replaceable_value(value: Any) -> bool:
    return isinstance(value, str) and (
        value.startswith("example_")
        or value in {"string", "id", "token", "uuid"}
        or re.fullmatch(r"\{\{\s*[^}]+\s*\}\}", value or "") is not None
    )


def _mark_variable_consumer(step: dict[str, Any]) -> None:
    step["_planner_consumes_variable"] = True


def _assign_parallel_groups(
    steps: list[dict[str, Any]],
    patch_operations: list[dict[str, Any]],
    recommendations: list[dict[str, Any]],
) -> int:
    grouped: dict[tuple[str, ...], list[dict[str, Any]]] = {}
    for step in steps:
        if step.get("parallel_group"):
            continue
        if not _is_safe_parallel_read(step):
            continue
        grouped.setdefault(tuple(step.get("depends_on") or []), []).append(step)

    group_index = 0
    for candidates in grouped.values():
        pending_group: list[dict[str, Any]] = []
        pending_extractions: set[str] = set()
        for step in candidates:
            extraction_names = _extraction_names(step)
            if pending_extractions & extraction_names:
                recommendations.append(
                    {
                        "type": "parallel_group",
                        "severity": "warning",
                        "title": "同名变量提取未自动并行",
                        "message": f"{step.get('name') or step.get('id')} 与同层查询步骤提取同名变量，已保守跳过自动并行分组。",
                        "step_id": step.get("id", ""),
                    }
                )
                continue
            pending_group.append(step)
            pending_extractions.update(extraction_names)
        if len(pending_group) < 2:
            continue
        group_index += 1
        group_name = f"parallel_read_{group_index}"
        for step in pending_group:
            before = step.get("parallel_group") or ""
            step["parallel_group"] = group_name
            patch_operations.append(_operation(step, "parallel_group", before, group_name, "独立安全读接口共享同一依赖集合，可在该拓扑层并行执行。", True))
    return group_index


def _is_safe_parallel_read(step: dict[str, Any]) -> bool:
    method = str(step.get("method") or "").upper()
    if method not in READ_METHODS:
        return False
    if _looks_like_auth_step(step):
        return False
    if step.get("_planner_consumes_variable"):
        return False
    refs = _variable_references(step)
    return refs <= {"access_token"}


def _variable_references(step: dict[str, Any]) -> set[str]:
    refs: set[str] = set()

    def visit(value: Any) -> None:
        if isinstance(value, dict):
            for item in value.values():
                visit(item)
            return
        if isinstance(value, list):
            for item in value:
                visit(item)
            return
        if not isinstance(value, str):
            return
        refs.update(re.findall(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", value))

    for field_name in ("headers", "query", "path_params", "body"):
        visit(step.get(field_name))
    return refs


def _extraction_names(step: dict[str, Any]) -> set[str]:
    return {str(item.get("name") or "") for item in step.get("extractions") or [] if item.get("name")}


def _quality_score(
    steps: list[dict[str, Any]],
    dependency_graph: list[dict[str, Any]],
    parallel_group_count: int,
    pending_count: int,
) -> dict[str, Any]:
    score = 80
    items: list[dict[str, Any]] = []
    if not steps:
        score -= 40
        items.append({"level": "error", "label": "缺少步骤", "detail": "至少需要一个执行步骤。"})
    if dependency_graph:
        score += min(10, len(dependency_graph) * 2)
    if parallel_group_count:
        score += min(5, parallel_group_count * 2)
    if pending_count:
        score -= min(20, pending_count * 5)
        items.append({"level": "warning", "label": "存在待确认项", "detail": f"{pending_count} 个变量、认证或路径参数来源需要确认。"})
    score = max(0, min(100, score))
    if score >= 85:
        level = "good"
        label = "编排清晰"
    elif score >= 65:
        level = "medium"
        label = "需少量确认"
    else:
        level = "low"
        label = "需重点调整"
    return {"score": score, "level": level, "label": label, "items": items}


def _unique_recommendations(recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[tuple[str, str, str], dict[str, Any]] = {}
    for item in recommendations:
        key = (str(item.get("type") or ""), str(item.get("step_id") or ""), str(item.get("message") or ""))
        unique[key] = item
    return list(unique.values())
