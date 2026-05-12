from copy import deepcopy
import json
import re
from typing import Any

from openai import AsyncOpenAI

from app.api.logging_service import safe_log_event
from app.config import settings
from app.api_execution.dsl_generator import generate_api_dsl
from app.api_execution.policy import evaluate_execution_policy
from app.api_execution.schemas import APITestCaseDsl


AI_ASSISTANT_TIMEOUT_SECONDS = 20


def _log_ai_event(level: str, event_type: str, title: str, message: str = "", **kwargs):
    return safe_log_event(level, "ai_assistant", event_type, title, message, **kwargs)


def enhance_dsl(script: APITestCaseDsl, project_policy_snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    patched = deepcopy(script.model_dump())
    operations: list[dict[str, Any]] = []

    for step in patched.get("steps", []):
        assertions = step.setdefault("assertions", [])
        if not _has_assertion(assertions, "response_time_lt"):
            assertion = {"type": "response_time_lt", "expected": 3000}
            assertions.append(assertion)
            operations.append(
                _operation(step, "assertions", None, assertion, "补充基础响应耗时断言，便于识别慢接口。", True)
            )

        if _looks_like_login(step) and not step.get("extractions"):
            extraction = {"name": "access_token", "source": "body", "path": "data.token"}
            step.setdefault("extractions", []).append(extraction)
            operations.append(
                _operation(step, "extractions", None, extraction, "疑似登录/鉴权接口，补充 token 提取占位。", True)
            )

    patched_script = APITestCaseDsl(**patched)
    decision = evaluate_execution_policy(patched_script, project_policy_snapshot=project_policy_snapshot or {})
    return {
        "patched_script": patched_script,
        "patch_operations": operations,
        "summary": f"AI 补全生成 {len(operations)} 条建议，已通过策略预评估。",
        "automatic_applicable": bool(operations) and decision["allowed"],
        "risk_level": decision["risk_level"],
        "requires_approval": True,
        "ai_mode": "heuristic",
        "model_name": "",
        "fallback_reason": "",
    }


async def enhance_dsl_with_configured_ai(
    script: APITestCaseDsl,
    project_policy_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fallback = enhance_dsl(script, project_policy_snapshot)
    if not _is_llm_configured():
        _log_ai_event(
            "info",
            "ai_assistant_fallback_used",
            "AI DSL 补全使用启发式规则",
            "LLM 未配置",
            data={"task": "enhance_dsl", "step_count": len(script.steps)},
        )
        return fallback
    try:
        result = await _build_patch_with_llm(
            task="enhance_dsl",
            script=script,
            report=None,
            project_policy_snapshot=project_policy_snapshot or {},
            fallback=fallback,
        )
        _log_ai_event(
            "info",
            "ai_assistant_llm_completed",
            "AI DSL 补全完成",
            result.get("summary", ""),
            data={
                "task": "enhance_dsl",
                "ai_mode": result.get("ai_mode", ""),
                "model_name": result.get("model_name", ""),
                "operation_count": len(result.get("patch_operations") or []),
                "step_count": len(script.steps),
            },
        )
        return result
    except Exception as exc:
        _log_ai_event(
            "warning",
            "ai_assistant_llm_fallback",
            "AI DSL 补全回退",
            str(exc),
            data={"task": "enhance_dsl", "error": str(exc), "step_count": len(script.steps)},
        )
        return {**fallback, "fallback_reason": f"已回退启发式规则: {exc}"}


def build_flow_draft(
    spec: dict[str, Any],
    business_goal: str,
    operation_ids: list[str] | None = None,
    *,
    project_name: str = "",
    environment_name: str = "",
    base_url: str = "",
    flow_templates: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    operations = spec.get("operations") or []
    selected_ids = _select_flow_operations(operations, business_goal, operation_ids or [])
    if not selected_ids:
        _log_ai_event(
            "warning",
            "ai_flow_draft_rejected",
            "AI 流程草稿未生成",
            "未找到可用于生成流程草稿的接口",
            data={"business_goal": business_goal, "operation_ids": operation_ids or []},
        )
        raise ValueError("未找到可用于生成流程草稿的接口，请先选择接口范围或调整业务目标")

    draft = generate_api_dsl(spec, selected_ids)
    draft["name"] = business_goal.strip() or draft.get("name") or "AI 流程草稿"
    draft["target_project"] = project_name.strip() or draft.get("target_project") or spec.get("info", {}).get("title", "")
    draft["environment"] = environment_name.strip() or draft.get("environment", "")
    if base_url.strip():
        draft["base_url"] = base_url.strip()

    operations_by_id = {str(operation.get("id")): operation for operation in operations if operation.get("id")}
    operations_by_operation_id = {str(operation.get("operation_id")): operation for operation in operations if operation.get("operation_id")}
    uncertainties = _enrich_flow_draft(draft, operations_by_id, operations_by_operation_id)
    steps = draft.get("steps") or []
    step_summaries = [
        {
            "step_id": step.get("id", ""),
            "name": step.get("name", ""),
            "method": step.get("method", ""),
            "path": step.get("path", ""),
            "depends_on": step.get("depends_on") or [],
            "extractions": step.get("extractions") or [],
            "variable_references": _collect_variable_references(step),
            "assertion_recommendations": _summarize_assertions(step.get("assertions") or []),
            "assertion_count": len(step.get("assertions") or []),
        }
        for step in steps
    ]
    result = {
        "draft_script": APITestCaseDsl(**draft),
        "selected_operation_ids": selected_ids,
        "step_summaries": step_summaries,
        "uncertainties": uncertainties,
        "template_recommendations": _recommend_flow_templates(flow_templates or [], business_goal, selected_ids),
        "quality_score": _score_flow_draft(draft, step_summaries, uncertainties),
        "summary": f"已根据业务目标生成 {len(steps)} 步流程草稿，应用前请确认变量、账号和断言口径。",
        "requires_approval": True,
        "ai_mode": "heuristic",
        "model_name": "",
        "fallback_reason": "",
    }
    _log_ai_event(
        "info",
        "ai_flow_draft_completed",
        "AI 流程草稿生成完成",
        result["summary"],
        data={
            "business_goal": business_goal,
            "selected_operation_ids": selected_ids,
            "step_count": len(steps),
            "quality_score": result["quality_score"],
            "template_recommendation_count": len(result["template_recommendations"]),
        },
    )
    return result


def build_repair_patch(
    script: APITestCaseDsl,
    report: dict[str, Any],
    project_policy_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    patched = deepcopy(script.model_dump())
    operations: list[dict[str, Any]] = []
    steps_by_id = {step["id"]: step for step in patched.get("steps", [])}

    for result in report.get("results", []) or []:
        if result.get("status") == "passed":
            continue
        step = steps_by_id.get(str(result.get("step_id")))
        if not step:
            continue
        actual_status = result.get("status_code")
        if _can_relax_success_status(result, actual_status):
            assertion = _first_status_assertion(step.setdefault("assertions", []))
            before = deepcopy(assertion)
            expected = assertion.get("expected")
            if assertion.get("type") == "status_code":
                assertion["type"] = "status_code_in"
                assertion["expected"] = sorted({int(expected), int(actual_status)} if isinstance(expected, int) else {int(actual_status)})
            else:
                values = expected if isinstance(expected, list) else []
                assertion["expected"] = sorted({*values, int(actual_status)})
            operations.append(
                _operation(step, "assertions", before, deepcopy(assertion), "接口返回 2xx 但断言未覆盖该成功码，建议扩展状态码断言。", True)
            )
        operations.extend(_repair_response_time(step, result))

    patched_script = APITestCaseDsl(**patched)
    decision = evaluate_execution_policy(patched_script, project_policy_snapshot=project_policy_snapshot or {})
    safe_operations = operations and all(item.get("safe_to_apply") for item in operations)
    repair_draft = _build_repair_draft(
        patched,
        operations,
        report,
        historical_context=(project_policy_snapshot or {}).get("historical_repair_context") or [],
    )
    return {
        "patched_script": patched_script,
        "patch_operations": operations,
        "repair_draft": repair_draft,
        "summary": _repair_summary(operations),
        "automatic_applicable": bool(safe_operations and decision["allowed"]),
        "risk_level": decision["risk_level"],
        "requires_approval": True,
        "ai_mode": "heuristic",
        "model_name": "",
        "fallback_reason": "",
    }


async def build_repair_patch_with_configured_ai(
    script: APITestCaseDsl,
    report: dict[str, Any],
    project_policy_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fallback = build_repair_patch(script, report, project_policy_snapshot)
    if not _is_llm_configured():
        _log_ai_event(
            "info",
            "ai_assistant_fallback_used",
            "AI 修复建议使用启发式规则",
            "LLM 未配置",
            source_id=str(report.get("run_id") or ""),
            refs=[report.get("run_id")],
            data={"task": "repair_patch", "run_id": report.get("run_id") or "", "step_count": len(script.steps)},
        )
        return fallback
    try:
        result = await _build_patch_with_llm(
            task="repair_patch",
            script=script,
            report=report,
            project_policy_snapshot=project_policy_snapshot or {},
            fallback=fallback,
        )
        _log_ai_event(
            "info",
            "ai_assistant_llm_completed",
            "AI 修复建议生成完成",
            result.get("summary", ""),
            trace_id=str(report.get("run_id") or ""),
            source_id=str(report.get("run_id") or ""),
            refs=[report.get("run_id")],
            data={
                "task": "repair_patch",
                "run_id": report.get("run_id") or "",
                "ai_mode": result.get("ai_mode", ""),
                "model_name": result.get("model_name", ""),
                "operation_count": len(result.get("patch_operations") or []),
            },
        )
        return result
    except Exception as exc:
        _log_ai_event(
            "warning",
            "ai_assistant_llm_fallback",
            "AI 修复建议回退",
            str(exc),
            trace_id=str(report.get("run_id") or ""),
            source_id=str(report.get("run_id") or ""),
            refs=[report.get("run_id")],
            data={"task": "repair_patch", "run_id": report.get("run_id") or "", "error": str(exc)},
        )
        return {**fallback, "fallback_reason": f"已回退启发式规则: {exc}"}


def _select_flow_operations(
    operations: list[dict[str, Any]],
    business_goal: str,
    operation_ids: list[str],
    limit: int = 8,
) -> list[str]:
    available = {str(operation.get("id") or ""): operation for operation in operations if operation.get("id")}
    scoped = [available[item] for item in operation_ids if item in available] if operation_ids else operations
    goal_tokens = _flow_tokens(business_goal)

    scored = []
    for index, operation in enumerate(scoped):
        text = _operation_text(operation)
        tokens = _flow_tokens(text)
        score = len(goal_tokens & tokens) * 10
        score += _intent_score(operation, goal_tokens)
        if operation_ids:
            score += 3
        if score > 0 or operation_ids:
            scored.append((score, index, operation))

    if not scored:
        scored = [(1, index, operation) for index, operation in enumerate(scoped[:limit])]

    selected = [item[2] for item in sorted(scored, key=lambda row: (-row[0], row[1]))[:limit]]
    selected = sorted(selected, key=_flow_order_key)
    return [str(operation.get("id")) for operation in selected if operation.get("id")]


def _flow_tokens(text: str) -> set[str]:
    raw = re.findall(r"[a-zA-Z0-9_\u4e00-\u9fff]+", str(text).lower())
    tokens = set(raw)
    aliases = {
        "登录": "login",
        "鉴权": "auth",
        "创建": "create",
        "新增": "create",
        "查询": "get",
        "列表": "list",
        "删除": "delete",
        "订单": "order",
        "用户": "user",
    }
    for word, alias in aliases.items():
        if word in text:
            tokens.add(alias)
    return tokens


def _operation_text(operation: dict[str, Any]) -> str:
    return " ".join(
        str(value)
        for value in (
            operation.get("method"),
            operation.get("path"),
            operation.get("summary"),
            operation.get("operation_id"),
            " ".join(map(str, operation.get("tags") or [])),
        )
        if value
    )


def _intent_score(operation: dict[str, Any], goal_tokens: set[str]) -> int:
    text = _operation_text(operation).lower()
    method = str(operation.get("method") or "").upper()
    score = 0
    if {"login", "auth", "token"} & goal_tokens and any(token in text for token in ("login", "auth", "token", "signin")):
        score += 12
    if {"create", "post"} & goal_tokens and method == "POST":
        score += 8
    if {"get", "list", "查询"} & goal_tokens and method == "GET":
        score += 6
    if "delete" in goal_tokens and method == "DELETE":
        score += 6
    return score


def _flow_order_key(operation: dict[str, Any]) -> tuple[int, str]:
    text = _operation_text(operation).lower()
    method = str(operation.get("method") or "").upper()
    if any(token in text for token in ("login", "auth", "token", "signin")):
        bucket = 0
    elif method == "POST":
        bucket = 1
    elif method in {"PUT", "PATCH"}:
        bucket = 2
    elif method == "GET":
        bucket = 3
    elif method == "DELETE":
        bucket = 4
    else:
        bucket = 5
    return bucket, str(operation.get("path") or "")


def _enrich_flow_draft(
    draft: dict[str, Any],
    operations_by_id: dict[str, dict[str, Any]] | None = None,
    operations_by_operation_id: dict[str, dict[str, Any]] | None = None,
) -> list[str]:
    uncertainties = []
    steps = draft.get("steps") or []
    known_vars: dict[str, str] = {key: f"全局变量 {key}" for key in draft.get("variables") or {}}
    last_step_id = ""
    preferred_id_var = ""

    for step in steps:
        if last_step_id:
            step["depends_on"] = sorted({*(step.get("depends_on") or []), last_step_id})
        last_step_id = step.get("id", "")

        if _looks_like_login(step) and not step.get("extractions"):
            step.setdefault("extractions", []).append({"name": "access_token", "source": "body", "path": "data.token"})
            known_vars["access_token"] = f"{step.get('name') or step.get('id')} 提取"
            uncertainties.append("登录/鉴权步骤的 token 提取路径暂按 data.token 生成，请按真实响应确认。")

        if step.get("method", "").upper() == "POST":
            resource = _resource_name(step.get("path", ""))
            resource_id_var = f"{resource}_id" if resource else "created_id"
            if not any(item.get("name") == resource_id_var for item in step.get("extractions") or []):
                step.setdefault("extractions", []).append({"name": resource_id_var, "source": "body", "path": "data.id"})
                uncertainties.append(f"{step.get('name') or step.get('id')} 的 ID 提取路径暂按 data.id 生成，请按真实响应确认。")
            known_vars[resource_id_var] = f"{step.get('name') or step.get('id')} 提取"
            preferred_id_var = resource_id_var

        for extraction in step.get("extractions") or []:
            name = str(extraction.get("name") or "").strip()
            if name:
                known_vars[name] = f"{step.get('name') or step.get('id')} 提取"

        if "access_token" in known_vars and not _looks_like_login(step):
            headers = step.setdefault("headers", {})
            if not any(str(key).lower() == "authorization" for key in headers):
                headers["Authorization"] = "Bearer {{access_token}}"

        for name, value in list((step.get("path_params") or {}).items()):
            matched_var = _match_variable_for_field(name, known_vars, preferred_id_var)
            if matched_var:
                step["path_params"][name] = f"{{{{{matched_var}}}}}"
            elif isinstance(value, str) and value.startswith("example_"):
                uncertainties.append(f"{step.get('name') or step.get('id')} 的路径参数 {name} 需要确认真实来源。")

        _replace_field_variables(step.setdefault("query", {}), known_vars, preferred_id_var, step, uncertainties, "Query")
        _replace_field_variables(step.setdefault("headers", {}), known_vars, preferred_id_var, step, uncertainties, "Header")
        _replace_field_variables(step.get("body"), known_vars, preferred_id_var, step, uncertainties, "Body")

        operation = (operations_by_operation_id or {}).get(str(step.get("operation_id"))) or (operations_by_id or {}).get(str(step.get("operation_id")))
        _apply_assertion_recommendations(step, operation)

    if not any(_looks_like_login(step) for step in steps):
        uncertainties.append("未识别到明确登录/鉴权步骤，如目标接口需要认证，请补充 token 获取或全局请求头。")
    return list(dict.fromkeys(uncertainties))


def _resource_name(path: str) -> str:
    parts = [part.strip("{}") for part in str(path).split("/") if part and not part.startswith("{")]
    if not parts:
        return ""
    name = parts[-1].replace("-", "_")
    if name.endswith("s") and len(name) > 3:
        name = name[:-1]
    return re.sub(r"\W+", "_", name).strip("_")


def _match_variable_for_field(field_name: str, known_vars: dict[str, str], preferred_id_var: str = "") -> str:
    normalized = str(field_name or "").lower().replace("-", "_")
    if normalized in known_vars:
        return normalized
    if normalized == "id" and preferred_id_var:
        return preferred_id_var
    if normalized.endswith("_id") and normalized in known_vars:
        return normalized
    if normalized.endswith("_id"):
        resource = normalized.removesuffix("_id")
        for var_name in known_vars:
            if var_name.endswith("_id") and (resource in var_name or var_name.removesuffix("_id") in resource):
                return var_name
    if "token" in normalized and "access_token" in known_vars:
        return "access_token"
    return ""


def _replace_field_variables(
    value: Any,
    known_vars: dict[str, str],
    preferred_id_var: str,
    step: dict[str, Any],
    uncertainties: list[str],
    location: str,
) -> Any:
    if isinstance(value, dict):
        for key, item in list(value.items()):
            matched_var = _match_variable_for_field(key, known_vars, preferred_id_var)
            if matched_var and _is_placeholder_value(item):
                value[key] = f"{{{{{matched_var}}}}}"
            else:
                value[key] = _replace_field_variables(item, known_vars, preferred_id_var, step, uncertainties, location)
                if _is_placeholder_value(item) and not matched_var:
                    uncertainties.append(f"{step.get('name') or step.get('id')} 的 {location} 字段 {key} 需要确认真实取值来源。")
        return value
    if isinstance(value, list):
        for index, item in enumerate(value):
            value[index] = _replace_field_variables(item, known_vars, preferred_id_var, step, uncertainties, location)
        return value
    return value


def _is_placeholder_value(value: Any) -> bool:
    return isinstance(value, str) and (value.startswith("example_") or value in {"string", "id", "token"})


def _collect_variable_references(step: dict[str, Any]) -> list[dict[str, str]]:
    refs: list[dict[str, str]] = []

    def visit(value: Any, location: str):
        if isinstance(value, dict):
            for key, item in value.items():
                visit(item, f"{location}.{key}" if location else str(key))
            return
        if isinstance(value, list):
            for index, item in enumerate(value):
                visit(item, f"{location}[{index}]")
            return
        if not isinstance(value, str):
            return
        for name in re.findall(r"\{\{\s*([a-zA-Z0-9_]+)\s*\}\}", value):
            refs.append({"name": name, "location": location})

    for field in ("headers", "query", "path_params", "body"):
        visit(step.get(field), field)
    unique = {}
    for ref in refs:
        unique[f"{ref['name']}@{ref['location']}"] = ref
    return list(unique.values())


def _apply_assertion_recommendations(step: dict[str, Any], operation: dict[str, Any] | None) -> None:
    assertions = step.setdefault("assertions", [])
    success_codes = _operation_success_codes(operation)
    status_assertion = next((item for item in assertions if item.get("type") in {"status_code", "status_code_in"}), None)
    if status_assertion:
        status_assertion["type"] = "status_code_in"
        status_assertion["expected"] = success_codes
    else:
        assertions.append({"type": "status_code_in", "expected": success_codes})

    for path in _response_schema_paths(operation)[:4]:
        if not any(item.get("type") == "json_path_exists" and item.get("path") == path for item in assertions):
            assertions.append({"type": "json_path_exists", "path": path})
    if not any(item.get("type") == "response_time_lt" for item in assertions):
        assertions.append({"type": "response_time_lt", "expected": 3000})


def _operation_success_codes(operation: dict[str, Any] | None) -> list[int]:
    responses = (operation or {}).get("responses") or {}
    codes = []
    for status_code in responses:
        if str(status_code).isdigit() and str(status_code).startswith("2"):
            codes.append(int(status_code))
    return sorted(codes) or [200, 201, 204]


def _response_schema_paths(operation: dict[str, Any] | None) -> list[str]:
    responses = (operation or {}).get("responses") or {}
    schemas = []
    for status_code, response in responses.items():
        if not str(status_code).startswith("2") or not isinstance(response, dict):
            continue
        content = response.get("content") or {}
        json_content = content.get("application/json") or next(iter(content.values()), {})
        if isinstance(json_content, dict):
            schema = json_content.get("schema") or {}
            if schema:
                schemas.append(schema)
    paths: list[str] = []
    for schema in schemas:
        paths.extend(_schema_assertion_paths(schema))
    return list(dict.fromkeys(paths))


def _schema_assertion_paths(schema: dict[str, Any], prefix: str = "$", depth: int = 0) -> list[str]:
    if depth > 2 or not isinstance(schema, dict):
        return []
    if schema.get("type") == "array":
        return _schema_assertion_paths(schema.get("items") or {}, f"{prefix}[0]", depth + 1)
    properties = schema.get("properties") or {}
    paths = []
    for name, child in properties.items():
        child_path = f"{prefix}.{name}"
        paths.append(child_path)
        if isinstance(child, dict) and child.get("type") == "object":
            paths.extend(_schema_assertion_paths(child, child_path, depth + 1))
    return paths


def _summarize_assertions(assertions: list[dict[str, Any]]) -> list[dict[str, Any]]:
    labels = {
        "status_code_in": "状态码集合",
        "status_code": "状态码",
        "json_path_exists": "字段存在",
        "response_time_lt": "响应耗时",
    }
    return [
        {
            "type": item.get("type", ""),
            "label": labels.get(item.get("type", ""), item.get("type", "")),
            "path": item.get("path", ""),
            "expected": item.get("expected"),
        }
        for item in assertions
    ]


def _recommend_flow_templates(
    templates: list[dict[str, Any]],
    business_goal: str,
    selected_operation_ids: list[str],
    limit: int = 3,
) -> list[dict[str, Any]]:
    goal_tokens = _flow_tokens(business_goal)
    scored = []
    selected_count = len(selected_operation_ids)
    for template in templates:
        script = template.get("script") or {}
        text = " ".join([
            str(template.get("name") or ""),
            str(template.get("description") or ""),
            " ".join(map(str, template.get("tags") or [])),
            str(script.get("name") or ""),
        ])
        score = len(goal_tokens & _flow_tokens(text)) * 10
        step_count = len(script.get("steps") or [])
        if selected_count and step_count:
            score += max(0, 5 - abs(step_count - selected_count))
        if score <= 0:
            continue
        performance = template.get("performance") or {}
        pass_rate = performance.get("pass_rate")
        failure_rate = performance.get("failure_rate")
        run_count = int(performance.get("run_count") or 0)
        if run_count:
            score += min(12, run_count)
        if isinstance(pass_rate, (int, float)):
            score += int(pass_rate * 15)
        if isinstance(failure_rate, (int, float)):
            score -= int(failure_rate * 8)
        scored.append((score, template))
    return [
        {
            "template_id": template.get("template_id", ""),
            "name": template.get("name", ""),
            "description": template.get("description", ""),
            "tags": template.get("tags") or [],
            "step_count": len((template.get("script") or {}).get("steps") or []),
            "match_score": score,
            "performance": template.get("performance") or {},
            "recommendation_reason": _template_recommendation_reason(template, score),
            "script": template.get("script") or {},
        }
        for score, template in sorted(scored, key=lambda item: (-item[0], item[1].get("name", "")))[:limit]
    ]


def _template_recommendation_reason(template: dict[str, Any], score: int) -> str:
    performance = template.get("performance") or {}
    run_count = int(performance.get("run_count") or 0)
    pass_rate = performance.get("pass_rate")
    if run_count and isinstance(pass_rate, (int, float)):
        return f"匹配度 {score}，历史执行 {run_count} 次，通过率 {round(pass_rate * 100)}%。"
    return f"匹配度 {score}，暂无足够历史执行表现。"


def _score_flow_draft(
    draft: dict[str, Any],
    step_summaries: list[dict[str, Any]],
    uncertainties: list[str],
) -> dict[str, Any]:
    score = 100
    items: list[dict[str, Any]] = []
    steps = draft.get("steps") or []

    if not steps:
        score -= 40
        items.append({"level": "error", "label": "缺少步骤", "detail": "流程草稿至少需要一个执行步骤。"})

    unresolved_refs = _undefined_variable_refs(draft)
    if unresolved_refs:
        score -= min(30, 10 * len(unresolved_refs))
        items.append({"level": "error", "label": "变量未定义", "detail": "、".join(f"{{{{{name}}}}}" for name in unresolved_refs)})

    auth_refs = any(ref.get("name") == "access_token" for step in step_summaries for ref in step.get("variable_references") or [])
    has_auth_step = any(_looks_like_login(step) for step in steps)
    if not auth_refs and not has_auth_step:
        score -= 10
        items.append({"level": "warning", "label": "鉴权不明确", "detail": "未识别登录步骤或 token 引用，如接口需要鉴权请补充。"})

    assertion_light_steps = [step for step in step_summaries if step.get("assertion_count", 0) < 2]
    if assertion_light_steps:
        score -= min(15, 5 * len(assertion_light_steps))
        items.append({"level": "warning", "label": "断言偏少", "detail": f"{len(assertion_light_steps)} 个步骤断言少于 2 条。"})

    delete_steps = [step for step in steps if str(step.get("method") or "").upper() == "DELETE"]
    if delete_steps:
        score -= 15
        items.append({"level": "warning", "label": "包含高风险操作", "detail": f"包含 {len(delete_steps)} 个 DELETE 步骤，执行前确认环境和数据隔离。"})

    if uncertainties:
        score -= min(20, 4 * len(uncertainties))
        items.append({"level": "info", "label": "存在待确认项", "detail": f"{len(uncertainties)} 个 token、ID 或参数来源需要人工确认。"})

    score = max(0, min(100, score))
    if score >= 85:
        level = "good"
        label = "可用度高"
    elif score >= 65:
        level = "medium"
        label = "需少量确认"
    else:
        level = "low"
        label = "需重点调整"
    return {"score": score, "level": level, "label": label, "items": items}


def _undefined_variable_refs(draft: dict[str, Any]) -> list[str]:
    produced = set(draft.get("variables") or {})
    for step in draft.get("steps") or []:
        for extraction in step.get("extractions") or []:
            if extraction.get("name"):
                produced.add(str(extraction["name"]))
    refs = []
    for step in draft.get("steps") or []:
        for ref in _collect_variable_references(step):
            if ref["name"] not in produced:
                refs.append(ref["name"])
    return list(dict.fromkeys(refs))


async def _build_patch_with_llm(
    *,
    task: str,
    script: APITestCaseDsl,
    report: dict[str, Any] | None,
    project_policy_snapshot: dict[str, Any],
    fallback: dict[str, Any],
) -> dict[str, Any]:
    client = AsyncOpenAI(api_key=settings.API_KEY, base_url=settings.API_BASE_URL)
    response = await client.chat.completions.create(
        model=settings.CHAT_MODEL,
        messages=_build_llm_messages(task, script, report, project_policy_snapshot, fallback),
        temperature=0.1,
        max_tokens=min(settings.GENERATION_MAX_TOKENS or 2000, 3000),
        timeout=AI_ASSISTANT_TIMEOUT_SECONDS,
    )
    content = response.choices[0].message.content or ""
    payload = _extract_json_object(content)
    patched_script = APITestCaseDsl(**payload.get("patched_script", script.model_dump()))
    patch_operations = payload.get("patch_operations") or []
    if not isinstance(patch_operations, list):
        patch_operations = []

    decision = evaluate_execution_policy(
        patched_script,
        project_policy_snapshot=project_policy_snapshot,
    )
    safe_operations = bool(patch_operations) and all(item.get("safe_to_apply") for item in patch_operations)
    repair_draft = _build_repair_draft(
        patched_script.model_dump(),
        patch_operations,
        report or {},
        historical_context=project_policy_snapshot.get("historical_repair_context") or [],
    )
    return {
        "patched_script": patched_script,
        "patch_operations": patch_operations,
        "repair_draft": repair_draft,
        "summary": str(payload.get("summary") or fallback.get("summary") or ""),
        "automatic_applicable": bool(safe_operations and decision["allowed"]),
        "risk_level": decision["risk_level"],
        "requires_approval": True,
        "ai_mode": "llm",
        "model_name": settings.CHAT_MODEL,
        "fallback_reason": "",
    }


def _is_llm_configured() -> bool:
    return bool(settings.API_KEY and settings.API_BASE_URL and settings.CHAT_MODEL)


def _build_llm_messages(
    task: str,
    script: APITestCaseDsl,
    report: dict[str, Any] | None,
    project_policy_snapshot: dict[str, Any],
    fallback: dict[str, Any],
) -> list[dict[str, str]]:
    task_text = "补全 API 测试 DSL 的断言和变量提取" if task == "enhance_dsl" else "根据失败报告生成 API 测试 DSL 修复补丁"
    system = (
        "你是 OpenMelon API 自动化的受控 AI 助手。"
        "只能修改测试 DSL 中的 assertions、extractions、headers、query、path_params、body 这些测试输入或校验字段，"
        "不能新增真实凭证，不能绕过项目策略，不能删除步骤。"
        "必须只输出一个 JSON 对象，不要输出 Markdown。"
    )
    user = {
        "task": task_text,
        "output_schema": {
            "patched_script": "完整 APITestCaseDsl JSON",
            "patch_operations": [
                {
                    "step_id": "步骤 ID",
                    "field": "被修改字段",
                    "before": "修改前值",
                    "after": "修改后值",
                    "reason": "中文说明",
                    "safe_to_apply": "低风险且不需要人工判断时为 true，否则 false",
                }
            ],
            "summary": "中文摘要",
        },
        "rules": [
            "必须保留原 case_id、name、steps 顺序和 step id。",
            "如果不确定，返回原脚本并给出人工确认建议。",
            "不要把 token、cookie、password、secret 写入脚本。",
            "修复 2xx 状态码断言可标记 safe_to_apply=true；放宽 SLA、修改请求体、添加认证头默认 safe_to_apply=false。",
        ],
        "script": script.model_dump(),
        "report": report or {},
        "project_policy_snapshot": project_policy_snapshot,
        "historical_repair_context": project_policy_snapshot.get("historical_repair_context") or [],
        "heuristic_patch_reference": _jsonable_patch(fallback),
    }
    return [
        {"role": "system", "content": system},
        {"role": "user", "content": json.dumps(user, ensure_ascii=False)},
    ]


def _jsonable_patch(patch: dict[str, Any]) -> dict[str, Any]:
    return {
        **patch,
        "patched_script": patch["patched_script"].model_dump()
        if isinstance(patch.get("patched_script"), APITestCaseDsl)
        else patch.get("patched_script"),
    }


def _extract_json_object(content: str) -> dict[str, Any]:
    text = content.strip()
    if text.startswith("```"):
        text = re.sub(r"^```(?:json)?\s*", "", text)
        text = re.sub(r"\s*```$", "", text)
    try:
        payload = json.loads(text)
    except json.JSONDecodeError:
        match = re.search(r"\{.*\}", text, re.DOTALL)
        if not match:
            raise ValueError("模型未返回 JSON 对象")
        payload = json.loads(match.group(0))
    if not isinstance(payload, dict):
        raise ValueError("模型返回内容不是 JSON 对象")
    return payload


def _repair_response_time(step: dict[str, Any], result: dict[str, Any]) -> list[dict[str, Any]]:
    operations = []
    actual_duration = result.get("duration_ms")
    if not isinstance(actual_duration, int) or actual_duration <= 0:
        return operations
    for assertion in step.get("assertions", []) or []:
        if assertion.get("type") != "response_time_lt":
            continue
        expected = assertion.get("expected")
        if isinstance(expected, int) and actual_duration >= expected:
            before = deepcopy(assertion)
            assertion["expected"] = max(expected + 500, int(actual_duration * 1.5))
            operations.append(
                _operation(step, "assertions", before, deepcopy(assertion), "响应耗时超过阈值，建议按本次耗时放宽 SLA 占位。", False)
            )
    return operations


def _can_relax_success_status(result: dict[str, Any], actual_status: Any) -> bool:
    if not isinstance(actual_status, int) or not 200 <= actual_status < 300:
        return False
    return any(
        assertion.get("passed") is False and assertion.get("type") in {"status_code", "status_code_in"}
        for assertion in result.get("assertions", []) or []
    )


def _first_status_assertion(assertions: list[dict[str, Any]]) -> dict[str, Any]:
    for assertion in assertions:
        if assertion.get("type") in {"status_code", "status_code_in"}:
            return assertion
    assertion = {"type": "status_code_in", "expected": [200]}
    assertions.append(assertion)
    return assertion


def _has_assertion(assertions: list[dict[str, Any]], assertion_type: str) -> bool:
    return any(assertion.get("type") == assertion_type for assertion in assertions or [])


def _looks_like_login(step: dict[str, Any]) -> bool:
    haystack = " ".join(str(step.get(key, "")) for key in ("name", "path", "operation_id")).lower()
    return any(token in haystack for token in ("login", "token", "auth", "signin"))


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


def _repair_summary(operations: list[dict[str, Any]]) -> str:
    if not operations:
        return "暂未找到可自动生成的安全修复补丁，请根据失败诊断手动调整脚本、参数或环境。"
    safe_count = sum(1 for item in operations if item.get("safe_to_apply"))
    return f"生成 {len(operations)} 条修复建议，其中 {safe_count} 条可作为低风险补丁应用。"


def _build_repair_draft(
    patched_script: dict[str, Any],
    operations: list[dict[str, Any]],
    report: dict[str, Any],
    historical_context: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    steps = patched_script.get("steps") or []
    step_summaries = [
        {
            "step_id": step.get("id", ""),
            "name": step.get("name", ""),
            "method": step.get("method", ""),
            "path": step.get("path", ""),
            "depends_on": step.get("depends_on") or [],
            "extractions": step.get("extractions") or [],
            "variable_references": _collect_variable_references(step),
            "assertion_recommendations": _summarize_assertions(step.get("assertions") or []),
            "assertion_count": len(step.get("assertions") or []),
            "changed": any(operation.get("step_id") == step.get("id") for operation in operations),
        }
        for step in steps
    ]
    diagnostics = report.get("failure_diagnostics") or []
    uncertainties = [
        diagnostic.get("explanation", "")
        for diagnostic in diagnostics
        if diagnostic.get("explanation")
    ][:5]
    if not operations:
        uncertainties.append("当前失败更适合人工检查环境、测试数据或接口服务状态，暂未生成可直接应用的补丁。")
    suggestion_groups = _classify_repair_suggestions(operations, diagnostics, report)
    historical_solutions = _verified_repair_solutions(historical_context or [])
    repair_options = _build_repair_options(operations, diagnostics, historical_solutions)
    repair_effect_score = _score_repair_effect(operations, diagnostics, historical_solutions)
    return {
        "draft_script": patched_script,
        "patch_operations": operations,
        "repair_suggestion_groups": suggestion_groups,
        "historical_repair_solutions": historical_solutions,
        "repair_options": repair_options,
        "repair_effect_score": repair_effect_score,
        "step_summaries": step_summaries,
        "uncertainties": list(dict.fromkeys(uncertainties)),
        "quality_score": _score_flow_draft(patched_script, step_summaries, uncertainties),
        "summary": _repair_summary(operations),
        "requires_approval": True,
        "source": "repair_patch",
    }


def _classify_repair_suggestions(
    operations: list[dict[str, Any]],
    diagnostics: list[dict[str, Any]],
    report: dict[str, Any],
) -> dict[str, list[dict[str, Any]]]:
    groups = {
        "low_risk_apply": [],
        "needs_review": [],
        "investigation": [],
    }
    for operation in operations:
        item = {
            "type": "patch_operation",
            "step_id": operation.get("step_id", ""),
            "field": operation.get("field", ""),
            "title": _repair_operation_title(operation),
            "description": operation.get("reason", ""),
            "safe_to_apply": bool(operation.get("safe_to_apply")),
            "operation": operation,
        }
        if operation.get("safe_to_apply"):
            groups["low_risk_apply"].append(item)
        else:
            groups["needs_review"].append(item)

    for diagnostic in diagnostics:
        suggestions = diagnostic.get("suggestions") or []
        groups["investigation"].append(
            {
                "type": "diagnostic",
                "step_id": diagnostic.get("step_id", ""),
                "category": diagnostic.get("category", ""),
                "severity": diagnostic.get("severity", "medium"),
                "title": _diagnostic_title(diagnostic),
                "description": diagnostic.get("explanation", ""),
                "suggestions": suggestions[:3],
            }
        )

    if not groups["investigation"]:
        for result in report.get("results", []) or []:
            if result.get("status") == "passed":
                continue
            groups["investigation"].append(
                {
                    "type": "diagnostic",
                    "step_id": result.get("step_id", ""),
                    "category": "manual_investigation",
                    "severity": "medium",
                    "title": "人工排查建议",
                    "description": result.get("error") or f"接口返回 {result.get('status_code') or '未知状态'}，暂未生成结构化诊断。",
                    "suggestions": [
                        "检查 Base URL、目标服务状态和接口路径是否匹配当前环境。",
                        "检查请求参数、测试数据和鉴权信息是否完整。",
                        "查看响应体或服务日志，确认失败是否来自业务状态或环境异常。",
                    ],
                }
            )
    if not operations and not groups["investigation"]:
        groups["investigation"].append(
            {
                "type": "diagnostic",
                "step_id": "",
                "category": "manual_investigation",
                "severity": "medium",
                "title": "暂无自动补丁",
                "description": "当前失败未匹配到可直接修改 DSL 的安全补丁。",
                "suggestions": ["请结合执行详情检查环境、测试数据、接口服务状态或鉴权配置。"],
            }
        )
    return groups


def _repair_operation_title(operation: dict[str, Any]) -> str:
    field_labels = {
        "assertions": "调整断言",
        "extractions": "调整变量提取",
        "headers": "调整请求头",
        "query": "调整 Query",
        "path_params": "调整路径参数",
        "body": "调整请求体",
    }
    field = operation.get("field", "")
    return field_labels.get(field, f"调整 {field or '脚本字段'}")


def _verified_repair_solutions(context: list[dict[str, Any]]) -> list[dict[str, Any]]:
    solutions = []
    for item in context:
        payload = item.get("payload") or {}
        if item.get("item_type") != "api_repair":
            continue
        effect = _repair_history_effect_score(payload)
        if effect < 50:
            continue
        solutions.append(
            {
                "knowledge_id": item.get("knowledge_id", ""),
                "source_run_id": item.get("source_run_id", ""),
                "summary": item.get("summary", ""),
                "source_label": payload.get("source_label") or payload.get("type", "历史修复"),
                "patched_fields": payload.get("patched_fields") or [],
                "before": payload.get("before") or {},
                "after": payload.get("after") or {},
                "effect_score": effect,
                "applicable_when": _repair_applicable_when(payload),
            }
        )
    return sorted(solutions, key=lambda solution: solution.get("effect_score", 0), reverse=True)[:3]


def _repair_applicable_when(repair: dict[str, Any]) -> str:
    fields = [
        f"{item.get('step_id')}.{item.get('field')}"
        for item in repair.get("patched_fields") or []
        if item.get("field")
    ]
    if fields:
        return f"相似失败且需要调整 {', '.join(fields[:3])} 时优先参考。"
    return "相似失败且修复后失败数下降时优先参考。"


def _build_repair_options(
    operations: list[dict[str, Any]],
    diagnostics: list[dict[str, Any]],
    historical_solutions: list[dict[str, Any]],
) -> list[dict[str, Any]]:
    safe_ops = [operation for operation in operations if operation.get("safe_to_apply")]
    review_ops = [operation for operation in operations if not operation.get("safe_to_apply")]
    return [
        {
            "option_id": "low_risk_direct",
            "title": "低风险直接应用",
            "risk_level": "low",
            "confidence": 85 if safe_ops else 35,
            "description": "只应用明确字段级补丁，适合状态码集合、变量提取这类低风险调整。",
            "operations": safe_ops,
            "requires_confirmation": True,
            "enabled": bool(safe_ops),
        },
        {
            "option_id": "conservative_review",
            "title": "保守人工确认",
            "risk_level": "medium",
            "confidence": 70 if operations or diagnostics or historical_solutions else 45,
            "description": "结合低风险补丁、需确认补丁和历史验证方案，先人工审阅再执行。",
            "operations": operations,
            "historical_solutions": historical_solutions,
            "requires_confirmation": True,
            "enabled": bool(operations or diagnostics or historical_solutions),
        },
        {
            "option_id": "aggressive_adjustment",
            "title": "激进调整方案",
            "risk_level": "high",
            "confidence": 45 if review_ops else 25,
            "description": "允许放宽 SLA、调整请求体或鉴权相关字段，仅作为人工排查方向，不建议直接应用。",
            "operations": review_ops,
            "diagnostic_categories": list(dict.fromkeys(item.get("category", "") for item in diagnostics if item.get("category"))),
            "requires_confirmation": True,
            "enabled": bool(review_ops or diagnostics),
        },
    ]


def _score_repair_effect(
    operations: list[dict[str, Any]],
    diagnostics: list[dict[str, Any]],
    historical_solutions: list[dict[str, Any]],
) -> dict[str, Any]:
    score = 45
    safe_count = sum(1 for operation in operations if operation.get("safe_to_apply"))
    review_count = len(operations) - safe_count
    score += min(25, safe_count * 15)
    score -= min(20, review_count * 8)
    if historical_solutions:
        score += min(20, max(solution.get("effect_score", 0) for solution in historical_solutions) // 5)
    if diagnostics and not operations:
        score -= 10
    score = max(0, min(100, score))
    if score >= 80:
        level = "good"
        label = "高可信"
    elif score >= 60:
        level = "medium"
        label = "中等可信"
    else:
        level = "low"
        label = "仅供排查"
    return {
        "score": score,
        "level": level,
        "label": label,
        "safe_operation_count": safe_count,
        "review_operation_count": review_count,
        "historical_solution_count": len(historical_solutions),
    }


def _repair_history_effect_score(repair: dict[str, Any]) -> int:
    before = repair.get("before") or {}
    after = repair.get("after") or {}
    before_failed = int(before.get("failed") or 0)
    after_failed = int(after.get("failed") or 0)
    score = 50
    if after.get("status") == "passed":
        score += 30
    if before_failed > after_failed:
        score += min(20, (before_failed - after_failed) * 10)
    if repair.get("risk_level") == "high":
        score -= 15
    return max(0, min(100, score))


def _diagnostic_title(diagnostic: dict[str, Any]) -> str:
    labels = {
        "status_code_mismatch": "状态码不符合预期",
        "response_schema_mismatch": "响应结构不匹配",
        "test_data_mismatch": "测试数据不匹配",
        "body_content_mismatch": "响应内容不匹配",
        "header_mismatch": "响应头不匹配",
        "performance_or_flaky": "性能或稳定性问题",
        "variable_reference_missing": "变量链路缺失",
        "request_error": "请求执行异常",
    }
    return labels.get(diagnostic.get("category", ""), diagnostic.get("category") or "排查建议")
