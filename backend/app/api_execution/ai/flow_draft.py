import re
from typing import Any

from app.api_execution.ai.common import _log_ai_event
from app.api_execution.ai.shared import _looks_like_login
from app.api_execution.dsl_generator import generate_api_dsl
from app.api_execution.orchestration_planner import plan_api_orchestration
from app.api_execution.schemas import APITestCaseDsl

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
    planner_result = _enrich_flow_draft(draft, operations_by_id, operations_by_operation_id)
    uncertainties = planner_result["uncertainties"]
    steps = draft.get("steps") or []
    step_summaries = [
        {
            "step_id": step.get("id", ""),
            "name": step.get("name", ""),
            "method": step.get("method", ""),
            "path": step.get("path", ""),
            "depends_on": step.get("depends_on") or [],
            "parallel_group": step.get("parallel_group") or "",
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
        "dependency_graph": planner_result["dependency_graph"],
        "orchestration_summary": planner_result["orchestration_summary"],
        "orchestration_quality_score": planner_result["quality_score"],
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
) -> dict[str, Any]:
    uncertainties = []
    steps = draft.get("steps") or []

    for step in steps:
        operation = (operations_by_operation_id or {}).get(str(step.get("operation_id"))) or (operations_by_id or {}).get(str(step.get("operation_id")))
        _apply_assertion_recommendations(step, operation)

    operations = [
        (operations_by_operation_id or {}).get(str(step.get("operation_id")))
        or (operations_by_id or {}).get(str(step.get("operation_id")))
        or {}
        for step in steps
    ]
    planner_result = plan_api_orchestration(
        steps,
        operations=operations,
        variables=draft.get("variables") or {},
    )
    draft["steps"] = planner_result["steps"]
    for recommendation in planner_result["recommendations"]:
        message = recommendation.get("message") or recommendation.get("title")
        if message and recommendation.get("severity") in {"warning", "info"}:
            uncertainties.append(str(message))

    if not any(_looks_like_login(step) for step in draft.get("steps") or []):
        uncertainties.append("未识别到明确登录/鉴权步骤，如目标接口需要认证，请补充 token 获取或全局请求头。")
    return {**planner_result, "uncertainties": list(dict.fromkeys(uncertainties))}


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

__all__ = [
    "build_flow_draft",
    "_collect_variable_references",
    "_score_flow_draft",
    "_summarize_assertions",
]
