from app.api_execution.ai.common import *
from app.api_execution.ai import llm_patch
from app.api_execution.ai.shared import _has_assertion, _operation
from app.api_execution.orchestration_planner import plan_api_orchestration


def enhance_dsl(script: APITestCaseDsl, project_policy_snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    patched = deepcopy(script.model_dump())
    planner_result = plan_api_orchestration(
        patched.get("steps") or [],
        variables=patched.get("variables") or {},
        project_context=project_policy_snapshot or {},
    )
    patched["steps"] = planner_result["steps"]
    operations: list[dict[str, Any]] = list(planner_result["patch_operations"])

    for step in patched.get("steps", []):
        assertions = step.setdefault("assertions", [])
        if not _has_assertion(assertions, "response_time_lt"):
            assertion = {"type": "response_time_lt", "expected": 3000}
            assertions.append(assertion)
            operations.append(
                _operation(step, "assertions", None, assertion, "补充基础响应耗时断言，便于识别慢接口。", True)
            )

    patched_script = APITestCaseDsl(**patched)
    decision = evaluate_execution_policy(patched_script, project_policy_snapshot=project_policy_snapshot or {})
    return {
        "patched_script": patched_script,
        "patch_operations": operations,
        "summary": f"AI 补全生成 {len(operations)} 条建议，{planner_result['orchestration_summary']} 已通过策略预评估。",
        "automatic_applicable": bool(operations) and decision["allowed"],
        "risk_level": decision["risk_level"],
        "requires_approval": True,
        "ai_mode": "heuristic",
        "model_name": "",
        "fallback_reason": "",
        "dependency_graph": planner_result["dependency_graph"],
        "recommendations": planner_result["recommendations"],
        "orchestration_summary": planner_result["orchestration_summary"],
    }


async def enhance_dsl_with_configured_ai(
    script: APITestCaseDsl,
    project_policy_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    fallback = enhance_dsl(script, project_policy_snapshot)
    if script.agent_source == "api_asset_catalog":
        _log_ai_event(
            "info",
            "ai_assistant_fallback_used",
            "AI DSL 补全使用资产计划快速规则",
            "Agent 资产计划已是结构化 DSL，跳过远端 LLM",
            data={"task": "enhance_dsl", "step_count": len(script.steps), "agent_source": script.agent_source},
        )
        return fallback
    if (project_policy_snapshot or {}).get("allow_ai_generate_dsl") is False:
        _log_ai_event(
            "info",
            "ai_assistant_fallback_used",
            "AI DSL 补全使用启发式规则",
            "项目策略未开启 AI 生成 DSL",
            data={"task": "enhance_dsl", "step_count": len(script.steps)},
        )
        return fallback
    if not llm_patch._is_llm_configured():
        _log_ai_event(
            "info",
            "ai_assistant_fallback_used",
            "AI DSL 补全使用启发式规则",
            "LLM 未配置",
            data={"task": "enhance_dsl", "step_count": len(script.steps)},
        )
        return fallback
    try:
        result = await llm_patch._build_patch_with_llm(
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

__all__ = [name for name in globals() if not name.startswith("__")]
