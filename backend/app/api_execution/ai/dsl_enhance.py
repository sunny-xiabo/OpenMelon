from app.api_execution.ai.common import *
from app.api_execution.ai import llm_patch
from app.api_execution.ai.shared import _has_assertion, _looks_like_login, _operation


def _resource_name(path: str) -> str:
    parts = [part.strip("{}") for part in str(path).split("/") if part and not part.startswith("{")]
    if not parts:
        return ""
    name = parts[-1].replace("-", "_")
    if name.endswith("s") and len(name) > 3:
        name = name[:-1]
    return re.sub(r"\W+", "_", name).strip("_")


def _placeholder_for_field(field_name: str, known_vars: set[str], preferred_id_var: str = "") -> str:
    normalized = str(field_name or "").lower().replace("-", "_")
    if normalized in known_vars:
        return normalized
    if normalized == "id" and preferred_id_var:
        return preferred_id_var
    if normalized.endswith("_id"):
        resource = normalized.removesuffix("_id")
        for var_name in known_vars:
            if var_name.endswith("_id") and (resource in var_name or var_name.removesuffix("_id") in resource):
                return var_name
    if "token" in normalized and "access_token" in known_vars:
        return "access_token"
    return ""


def enhance_dsl(script: APITestCaseDsl, project_policy_snapshot: dict[str, Any] | None = None) -> dict[str, Any]:
    patched = deepcopy(script.model_dump())
    operations: list[dict[str, Any]] = []
    known_vars = set(str(key) for key in patched.get("variables") or {})
    last_step_id = ""
    preferred_id_var = ""

    for step in patched.get("steps", []):
        step_id = step.get("id", "")
        if last_step_id and not step.get("depends_on"):
            before = step.get("depends_on") or []
            after = [last_step_id]
            step["depends_on"] = after
            operations.append(
                _operation(step, "depends_on", before, after, "补充前置步骤依赖，确保链路按业务顺序执行。", True)
            )
        if step_id:
            last_step_id = step_id

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
        for extraction in step.get("extractions") or []:
            name = str(extraction.get("name") or "").strip()
            if name:
                known_vars.add(name)

        if step.get("method", "").upper() == "POST" and not _looks_like_login(step):
            resource = _resource_name(step.get("path", ""))
            resource_id_var = f"{resource}_id" if resource else "created_id"
            if not any(item.get("name") == resource_id_var for item in step.get("extractions") or []):
                extraction = {"name": resource_id_var, "source": "body", "path": "data.id"}
                step.setdefault("extractions", []).append(extraction)
                operations.append(
                    _operation(step, "extractions", None, extraction, "创建类接口补充 ID 提取，便于后续详情、更新或删除步骤引用。", True)
                )
            known_vars.add(resource_id_var)
            preferred_id_var = resource_id_var

        if "access_token" in known_vars and not _looks_like_login(step):
            headers = step.setdefault("headers", {})
            if not any(str(key).lower() == "authorization" for key in headers):
                before = deepcopy(headers)
                headers["Authorization"] = "Bearer {{access_token}}"
                operations.append(
                    _operation(step, "headers", before, deepcopy(headers), "检测到 token 提取，补充后续步骤鉴权 Header。", True)
                )

        for name, value in list((step.get("path_params") or {}).items()):
            matched_var = _placeholder_for_field(name, known_vars, preferred_id_var)
            if matched_var and value != f"{{{{{matched_var}}}}}":
                before = value
                after = f"{{{{{matched_var}}}}}"
                step["path_params"][name] = after
                operations.append(
                    _operation(step, "path_params", {name: before}, {name: after}, "补全路径参数变量引用，串联前置步骤提取结果。", True)
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
