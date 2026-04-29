from copy import deepcopy
import json
import re
from typing import Any

from openai import AsyncOpenAI

from app.config import settings
from app.api_execution.policy import evaluate_execution_policy
from app.api_execution.schemas import APITestCaseDsl


AI_ASSISTANT_TIMEOUT_SECONDS = 20


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
        return fallback
    try:
        return await _build_patch_with_llm(
            task="enhance_dsl",
            script=script,
            report=None,
            project_policy_snapshot=project_policy_snapshot or {},
            fallback=fallback,
        )
    except Exception as exc:
        return {**fallback, "fallback_reason": f"已回退启发式规则: {exc}"}


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
    return {
        "patched_script": patched_script,
        "patch_operations": operations,
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
        return fallback
    try:
        return await _build_patch_with_llm(
            task="repair_patch",
            script=script,
            report=report,
            project_policy_snapshot=project_policy_snapshot or {},
            fallback=fallback,
        )
    except Exception as exc:
        return {**fallback, "fallback_reason": f"已回退启发式规则: {exc}"}


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
    return {
        "patched_script": patched_script,
        "patch_operations": patch_operations,
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
