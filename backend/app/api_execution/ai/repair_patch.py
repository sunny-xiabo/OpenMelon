from copy import deepcopy
from typing import Any

from app.api_execution.ai.common import _log_ai_event
from app.api_execution.ai import llm_patch
from app.api_execution.ai.flow_draft import _collect_variable_references, _score_flow_draft, _summarize_assertions
from app.api_execution.ai.shared import _operation
from app.api_execution.policy import evaluate_execution_policy
from app.api_execution.schemas import APITestCaseDsl

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
    if not llm_patch._is_llm_configured():
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
        result = await llm_patch._build_patch_with_llm(
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

__all__ = [
    "build_repair_patch",
    "build_repair_patch_with_configured_ai",
    "_build_repair_draft",
]
