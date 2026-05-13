from app.api_execution.ai.common import *

async def _build_patch_with_llm(
    *,
    task: str,
    script: APITestCaseDsl,
    report: dict[str, Any] | None,
    project_policy_snapshot: dict[str, Any],
    fallback: dict[str, Any],
) -> dict[str, Any]:
    api_key = settings.API_KEY
    base_url = settings.API_BASE_URL
    model_name = settings.CHAT_MODEL
    max_tokens = min(settings.GENERATION_MAX_TOKENS or 2000, 3000)
    client = AsyncOpenAI(api_key=api_key, base_url=base_url)
    response = await client.chat.completions.create(
        model=model_name,
        messages=_build_llm_messages(task, script, report, project_policy_snapshot, fallback),
        temperature=0.1,
        max_tokens=max_tokens,
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
        "model_name": model_name,
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

__all__ = [name for name in globals() if not name.startswith("__")]
