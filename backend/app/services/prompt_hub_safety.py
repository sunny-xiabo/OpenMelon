from __future__ import annotations

from datetime import UTC, datetime
from typing import Any

from app.api.errors import InvalidRequestError, NotFoundError
from app.api.logging_service import safe_log_event
from app.services.prompt_hub_tracker import prompt_hub_tracker as _default_prompt_hub_tracker
from app.testcase_gen.services.prompt_safety import analyze_prompt_hub_record

prompt_hub_tracker = _default_prompt_hub_tracker


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _action(
    action_id: str,
    label: str,
    *,
    kind: str,
    target_id: str,
    risk_level: str = "low",
    requires_confirmation: bool = False,
    frontend_only: bool = False,
) -> dict[str, Any]:
    return {
        "id": action_id,
        "action": action_id,
        "label": label,
        "kind": kind,
        "target_id": target_id,
        "risk_level": risk_level,
        "requires_confirmation": requires_confirmation,
        "frontend_only": frontend_only,
    }


def _recommendation(
    rec_id: str,
    title: str,
    *,
    severity: str,
    reason: str,
    evidence: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    risk_level: str,
    related_record_id: str,
    related_record_kind: str,
) -> dict[str, Any]:
    return {
        "id": rec_id,
        "severity": severity,
        "title": title,
        "reason": reason,
        "evidence": evidence,
        "actions": actions,
        "risk_level": risk_level,
        "requires_confirmation": any(action.get("requires_confirmation") for action in actions),
        "related_record_id": related_record_id,
        "related_record_kind": related_record_kind,
        "entry": {"type": "prompt_hub_record", "kind": related_record_kind, "record_id": related_record_id},
        "created_at": _now_iso(),
    }


def list_prompt_hub_safety_recommendations_service() -> dict[str, Any]:
    templates = [
        _attach_safety(item, "template")
        for item in prompt_hub_tracker.list_templates(enabled_only=False)
    ]
    skills = [
        _attach_safety(item, "skill")
        for item in prompt_hub_tracker.list_skills(enabled_only=False)
    ]
    recommendations = [
        item
        for record in [*templates, *skills]
        for item in _recommendations_for_record(record)
    ]
    severity_order = {"error": 0, "warning": 1, "info": 2}
    recommendations.sort(key=lambda item: (severity_order.get(item["severity"], 9), item["id"]))
    return {
        "items": recommendations,
        "total": len(recommendations),
        "summary": {
            "open_count": len(recommendations),
            "error_count": sum(1 for item in recommendations if item["severity"] == "error"),
            "warning_count": sum(1 for item in recommendations if item["severity"] == "warning"),
            "template_risk_count": sum(1 for item in templates if item.get("safety", {}).get("signal_count")),
            "skill_risk_count": sum(1 for item in skills if item.get("safety", {}).get("signal_count")),
            "high_risk_count": sum(1 for item in [*templates, *skills] if item.get("safety", {}).get("risk_level") == "high"),
        },
    }


def annotate_prompt_hub_records(records: list[dict[str, Any]], kind: str) -> list[dict[str, Any]]:
    return [_attach_safety(record, kind) for record in records]


def execute_prompt_hub_safety_action_service(
    *,
    action: str,
    record_kind: str,
    record_id: str,
    confirm: bool = False,
) -> dict[str, Any]:
    if action != "disable_record":
        raise InvalidRequestError(message=f"不支持的 Prompt Hub 安全动作：{action}")
    if not confirm:
        raise InvalidRequestError(message="停用 Prompt Hub 配置需要 confirm=true")
    if record_kind not in {"template", "skill"}:
        raise InvalidRequestError(message="record_kind 仅支持 template 或 skill")

    record = _get_record(record_kind, record_id)
    if not record:
        raise NotFoundError(message="Prompt Hub 记录不存在")
    safety = analyze_prompt_hub_record(record, record_kind)
    if not safety["signal_count"]:
        raise InvalidRequestError(message="该记录未检测到注入风险信号，无需安全停用")
    if record_kind == "template" and record.get("is_default"):
        raise InvalidRequestError(message="默认模板不能直接停用，请先编辑或切换默认模板")

    payload = {**record, "enabled": False}
    result = (
        prompt_hub_tracker.update_template(record_id, payload)
        if record_kind == "template"
        else prompt_hub_tracker.update_skill(record_id, payload)
    )
    safe_log_event(
        "warning",
        "prompt_hub",
        "prompt_hub_safety_action_executed",
        "Prompt Hub 安全闭环动作已执行",
        f"已停用 {record_kind}: {record_id}",
        source_id=record_id,
        refs=[record_id, record_kind],
        data={"action": action, "record_kind": record_kind, "record_id": record_id, "safety": safety},
    )
    return {
        "action": action,
        "record_kind": record_kind,
        "record_id": record_id,
        "status": "success",
        "message": "已停用可疑 Prompt Hub 配置",
        "result": result,
    }


def _attach_safety(record: dict[str, Any], kind: str) -> dict[str, Any]:
    safety = analyze_prompt_hub_record(record, kind)
    return {**record, "safety": safety}


def _recommendations_for_record(record: dict[str, Any]) -> list[dict[str, Any]]:
    safety = record.get("safety") or {}
    signals = safety.get("signals") or []
    if not signals:
        return []
    kind = safety.get("kind") or "record"
    record_id = str(safety.get("record_id") or "")
    risk_level = safety.get("risk_level") or "medium"
    severity = "error" if risk_level == "high" else "warning"
    actions = [
        _action("open_record", "打开编辑", kind=kind, target_id=record_id, frontend_only=True),
    ]
    if safety.get("safe_to_disable"):
        actions.insert(
            0,
            _action(
                "disable_record",
                "停用配置",
                kind=kind,
                target_id=record_id,
                risk_level="high",
                requires_confirmation=True,
            ),
        )
    title = f"{'模板' if kind == 'template' else '技能'}「{record.get('name') or record_id}」存在注入风险信号"
    reason = "检测到类似系统提示覆盖、忽略上文或角色切换的语句。内容仍会被作为数据包裹，但建议人工复核来源。"
    if kind == "template" and record.get("is_default"):
        reason += " 该记录是默认模板，V1 不自动停用，避免影响生成链路。"
    return [
        _recommendation(
            f"prompt_hub_safety:{kind}:{record_id}",
            title,
            severity=severity,
            reason=reason,
            evidence=[
                {"label": "风险等级", "value": risk_level},
                {"label": "命中信号", "value": ", ".join(signals[:5])},
                {"label": "启用状态", "value": "启用" if record.get("enabled", True) else "停用"},
            ],
            actions=actions,
            risk_level=risk_level,
            related_record_id=record_id,
            related_record_kind=kind,
        )
    ]


def _get_record(record_kind: str, record_id: str) -> dict[str, Any] | None:
    records = (
        prompt_hub_tracker.list_templates(enabled_only=False)
        if record_kind == "template"
        else prompt_hub_tracker.list_skills(enabled_only=False)
    )
    return next((item for item in records if item.get("id") == record_id), None)
