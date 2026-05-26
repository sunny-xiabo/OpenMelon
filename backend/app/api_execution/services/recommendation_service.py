from __future__ import annotations

from collections import Counter
from datetime import UTC, datetime
from typing import Any

from app.api.errors import InvalidRequestError, NotFoundError
from app.api.logging_service import log_event
from app.api_execution.storage import api_execution_store as _default_api_execution_store
from app.api_execution.storage import get_api_execution_store

api_execution_store = _default_api_execution_store


HIGH_RISK_ACTIONS = {"auto_repair_run", "rerun_run", "resolve_automation_task"}
SERVER_ACTIONS = {
    "auto_repair_run",
    "rerun_run",
    "create_knowledge_candidate",
    "resolve_automation_task",
    "trigger_spec_sync",
    "trigger_scheduled_runs",
}


def _store():
    if api_execution_store is not _default_api_execution_store:
        return api_execution_store
    return get_api_execution_store()


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _safe_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _action(
    action_id: str,
    label: str,
    *,
    risk_level: str = "low",
    target_id: str = "",
    requires_confirmation: bool = False,
    frontend_only: bool = False,
    entry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": action_id,
        "action": action_id,
        "label": label,
        "risk_level": risk_level,
        "target_id": target_id,
        "requires_confirmation": requires_confirmation,
        "frontend_only": frontend_only,
        "entry": entry or {},
    }


def _recommendation(
    rec_id: str,
    title: str,
    *,
    severity: str,
    reason: str,
    evidence: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    risk_level: str = "low",
    requires_confirmation: bool = False,
    related_run_id: str = "",
    related_task_id: str = "",
    entry: dict[str, Any] | None = None,
) -> dict[str, Any]:
    return {
        "id": rec_id,
        "severity": severity,
        "title": title,
        "reason": reason,
        "evidence": evidence,
        "actions": actions,
        "risk_level": risk_level,
        "requires_confirmation": requires_confirmation,
        "related_run_id": related_run_id,
        "related_task_id": related_task_id,
        "entry": entry or {},
        "created_at": _now_iso(),
    }


def list_api_execution_recommendations_service(project_id: str | None = None) -> dict[str, Any]:
    runs = _store().list_runs(limit=50, project_id=project_id)
    failed_runs = [run for run in runs if run.get("status") == "failed"]
    pending_tasks = _store().list_automation_tasks(limit=50, status="pending", project_id=project_id)
    policy_audits = _store().list_policy_audits(limit=30, project_id=project_id)

    try:
        from app.api_execution.services.run_service import get_queue_status_service

        queue_status = get_queue_status_service()
    except Exception:
        queue_status = {}

    recommendations: list[dict[str, Any]] = []
    knowledge_run_ids = {
        str(task.get("run_id"))
        for task in pending_tasks
        if task.get("task_type") == "knowledge_ingest_candidate" and task.get("run_id")
    }

    if failed_runs:
        recent = failed_runs[0]
        run_id = str(recent.get("run_id") or "")
        diagnostics = recent.get("failure_diagnostics") or []
        suggestions = recent.get("repair_suggestions") or []
        failed_count = _safe_int(recent.get("failed"))
        recommendations.append(_recommendation(
            f"failed_run:auto_repair:{run_id}",
            "最近一次 API 执行失败，可尝试受控修复",
            severity="error",
            reason=recent.get("failure_reason") or "执行失败且已有历史报告，可进入受控自动修复或人工查看失败步骤。",
            evidence=[
                {"label": "失败步骤", "value": failed_count},
                {"label": "诊断数", "value": len(diagnostics)},
                {"label": "修复建议", "value": len(suggestions)},
            ],
            actions=[
                _action("auto_repair_run", "受控修复并复跑", risk_level="high", target_id=run_id, requires_confirmation=True),
                _action("open_run", "查看失败记录", target_id=run_id, frontend_only=True, entry={"type": "run", "run_id": run_id}),
            ],
            risk_level="high",
            requires_confirmation=True,
            related_run_id=run_id,
            entry={"type": "run", "run_id": run_id},
        ))

        if diagnostics and run_id not in knowledge_run_ids:
            recommendations.append(_recommendation(
                f"failed_run:knowledge_candidate:{run_id}",
                "失败诊断尚未沉淀为知识候选",
                severity="warning",
                reason="这次失败已有结构化诊断，适合生成知识候选，人工确认后可用于后续修复经验召回。",
                evidence=[
                    {"label": "诊断数", "value": len(diagnostics)},
                    {"label": "首个分类", "value": diagnostics[0].get("category", "-") if diagnostics else "-"},
                ],
                actions=[
                    _action("create_knowledge_candidate", "生成知识候选", risk_level="medium", target_id=run_id),
                    _action("open_run", "查看诊断", target_id=run_id, frontend_only=True, entry={"type": "run", "run_id": run_id}),
                ],
                risk_level="medium",
                related_run_id=run_id,
                entry={"type": "run", "run_id": run_id},
            ))

    repeated = _repeated_failure_recommendation(failed_runs)
    if repeated:
        recommendations.append(repeated)

    blocked_audits = [
        audit for audit in policy_audits
        if audit.get("approved") is False or not (audit.get("decision") or {}).get("allowed", True)
    ]
    if blocked_audits:
        audit = blocked_audits[0]
        decision = audit.get("decision") or {}
        recommendations.append(_recommendation(
            f"policy_blocked:{audit.get('audit_id') or audit.get('run_id') or 'latest'}",
            "存在策略阻断，需要检查项目策略或环境配置",
            severity="warning",
            reason="策略审计记录显示执行被阻断，V1 只提供证据和入口，不自动修改策略。",
            evidence=[
                {"label": "动作", "value": audit.get("action", "-")},
                {"label": "风险", "value": decision.get("risk_level", "-")},
                {"label": "阻断原因", "value": "; ".join(map(str, decision.get("violations") or [])) or "-"},
            ],
            actions=[
                _action("open_task", "查看配置入口", frontend_only=True, entry={"type": "settings", "section": "api_execution_policy"}),
            ],
            risk_level="medium",
            related_run_id=str(audit.get("run_id") or ""),
            entry={"type": "policy_audit", "audit_id": audit.get("audit_id", "")},
        ))

    queued_count = _safe_int(queue_status.get("storage_queued_count"))
    running_count = _safe_int(queue_status.get("storage_running_count"))
    available_slots = _safe_int(queue_status.get("available_slots"))
    if queued_count and available_slots == 0:
        recommendations.append(_recommendation(
            "queue:congestion",
            "API 执行队列已排队，建议先查看队列状态",
            severity="warning",
            reason="当前可用执行槽位为 0，新的执行可能继续等待；请先确认是否存在长时间运行任务。",
            evidence=[
                {"label": "排队中", "value": queued_count},
                {"label": "运行中", "value": running_count},
                {"label": "可用槽位", "value": available_slots},
            ],
            actions=[
                _action("open_task", "查看执行历史", frontend_only=True, entry={"type": "queue"}),
            ],
            risk_level="low",
            entry={"type": "queue"},
        ))

    for task in pending_tasks[:5]:
        task_id = str(task.get("task_id") or "")
        task_type = str(task.get("task_type") or "")
        risk_level = str(task.get("risk_level") or "medium")
        recommendations.append(_recommendation(
            f"task:pending:{task_id}",
            _task_title(task),
            severity="warning" if risk_level != "low" else "info",
            reason=task.get("reason") or "存在待确认自动化任务，需要人工处理后闭环。",
            evidence=[
                {"label": "任务类型", "value": task_type or "-"},
                {"label": "风险等级", "value": risk_level},
                {"label": "关联执行", "value": task.get("run_id") or "-"},
            ],
            actions=[
                _action("resolve_automation_task", "标记已处理", risk_level="high", target_id=task_id, requires_confirmation=True),
                _action("open_task", "查看任务", target_id=task_id, frontend_only=True, entry={"type": "task", "task_id": task_id, "run_id": task.get("run_id") or ""}),
            ],
            risk_level=risk_level,
            requires_confirmation=True,
            related_run_id=str(task.get("run_id") or ""),
            related_task_id=task_id,
            entry={"type": "task", "task_id": task_id},
        ))

    if not recommendations:
        recommendations.append(_recommendation(
            "ops:scheduled_entry",
            "当前 API 自动化未发现阻断项",
            severity="info",
            reason="可以按需触发规格同步或定时执行，验证项目 DSL 与接口资产是否保持一致。",
            evidence=[
                {"label": "最近执行", "value": len(runs)},
                {"label": "待处理任务", "value": 0},
            ],
            actions=[
                _action("trigger_spec_sync", "同步规格 DSL", risk_level="low"),
                _action("trigger_scheduled_runs", "触发定时执行", risk_level="medium"),
            ],
            risk_level="low",
            entry={"type": "ops"},
        ))

    recommendations = _dedupe(recommendations)
    severity_order = {"error": 0, "warning": 1, "info": 2}
    recommendations.sort(key=lambda item: (severity_order.get(item["severity"], 9), item["id"]))
    return {
        "items": recommendations,
        "total": len(recommendations),
        "summary": {
            "open_count": len(recommendations),
            "error_count": sum(1 for item in recommendations if item["severity"] == "error"),
            "warning_count": sum(1 for item in recommendations if item["severity"] == "warning"),
            "info_count": sum(1 for item in recommendations if item["severity"] == "info"),
            "failed_run_count": len(failed_runs),
            "pending_task_count": len(pending_tasks),
            "blocked_policy_count": len(blocked_audits),
            "queued_count": queued_count,
        },
        "queue_status": queue_status,
    }


async def execute_api_execution_recommendation_action_service(
    *,
    action: str,
    target_id: str = "",
    project_id: str | None = None,
    confirm: bool = False,
    params: dict[str, Any] | None = None,
) -> dict[str, Any]:
    if action not in SERVER_ACTIONS:
        raise InvalidRequestError(message=f"不支持的 API 自动化闭环动作：{action}")
    if action in HIGH_RISK_ACTIONS and not confirm:
        raise InvalidRequestError(message="该动作风险较高，需要 confirm=true 后才能执行")

    result: Any
    if action == "auto_repair_run":
        if not target_id:
            raise InvalidRequestError(message="auto_repair_run 需要 target_id")
        from app.api_execution.services.run_service import auto_repair_and_rerun_service

        result = await auto_repair_and_rerun_service(target_id)
    elif action == "rerun_run":
        result = await _rerun_existing_run(target_id)
    elif action == "create_knowledge_candidate":
        if not target_id:
            raise InvalidRequestError(message="create_knowledge_candidate 需要 target_id")
        from app.api_execution.services.knowledge_service import create_run_knowledge_candidate_service

        result = create_run_knowledge_candidate_service(target_id)
    elif action == "resolve_automation_task":
        if not target_id:
            raise InvalidRequestError(message="resolve_automation_task 需要 target_id")
        from app.api_execution.services.automation_service import resolve_automation_task_service

        result = resolve_automation_task_service(target_id)
    elif action == "trigger_spec_sync":
        from app.api_execution.services.automation_service import trigger_spec_sync_service

        result = trigger_spec_sync_service()
    elif action == "trigger_scheduled_runs":
        from app.api_execution.services.automation_service import trigger_scheduled_runs_service

        result = await trigger_scheduled_runs_service()
    else:  # pragma: no cover - guarded above
        raise InvalidRequestError(message=f"不支持的 API 自动化闭环动作：{action}")

    _log_recommendation_action(action, target_id, project_id, confirm, params or {}, result)
    return {
        "action": action,
        "target_id": target_id,
        "status": "success",
        "message": _action_message(action, result),
        "result": result,
    }


def _repeated_failure_recommendation(failed_runs: list[dict[str, Any]]) -> dict[str, Any] | None:
    categories: Counter[str] = Counter()
    examples: dict[str, dict[str, Any]] = {}
    for run in failed_runs:
        diagnostics = run.get("failure_diagnostics") or []
        category = str((diagnostics[0] or {}).get("category") if diagnostics else run.get("failure_reason") or "unknown")
        categories[category] += 1
        examples.setdefault(category, run)
    if not categories:
        return None
    category, count = categories.most_common(1)[0]
    if count < 2:
        return None
    run = examples[category]
    run_id = str(run.get("run_id") or "")
    return _recommendation(
        f"failed_run:repeated:{category}",
        "出现多次同类失败，建议查看历史修复上下文",
        severity="warning",
        reason="近期失败记录中同类诊断重复出现，可能是环境、鉴权、断言或测试数据的系统性问题。",
        evidence=[
            {"label": "失败分类", "value": category},
            {"label": "出现次数", "value": count},
        ],
        actions=[
            _action("open_run", "定位样本执行", target_id=run_id, frontend_only=True, entry={"type": "run", "run_id": run_id}),
        ],
        risk_level="low",
        related_run_id=run_id,
        entry={"type": "run", "run_id": run_id},
    )


async def _rerun_existing_run(run_id: str) -> dict[str, Any]:
    if not run_id:
        raise InvalidRequestError(message="rerun_run 需要 target_id")
    run = _store().get_run(run_id)
    if not run:
        raise NotFoundError(message="执行历史不存在")
    script = run.get("script")
    if not isinstance(script, dict):
        raise InvalidRequestError(message="执行历史缺少脚本，无法复跑")
    from app.api_execution.schemas import APITestCaseDsl, RunScriptRequest
    from app.api_execution.services.run_service import run_all_steps_service

    options = run.get("execution_options") or {}
    return await run_all_steps_service(
        RunScriptRequest(
            script=APITestCaseDsl(**script),
            project_id=options.get("project_id"),
            environment_id=options.get("environment_id"),
            environment_snapshot=options.get("environment_snapshot") or {},
            project_policy_snapshot=options.get("project_policy_snapshot") or {},
            base_url=options.get("base_url") or script.get("base_url", ""),
            global_headers=options.get("global_headers") or {},
            timeout_ms=options.get("timeout_ms") or 30000,
            run_timeout_ms=options.get("run_timeout_ms"),
            max_steps=options.get("max_steps"),
            continue_on_failure=options.get("continue_on_failure", True),
            replace_run_id=run_id,
        )
    )


def _task_title(task: dict[str, Any]) -> str:
    task_type = task.get("task_type")
    if task_type == "knowledge_ingest_candidate":
        return "存在 API 知识候选待确认"
    if task_type == "manual_review":
        return "存在自动修复人工复核任务"
    if task_type == "scheduled_run_review":
        return "存在定时执行阻断待处理"
    return "存在 API 自动化待处理任务"


def _dedupe(recommendations: list[dict[str, Any]]) -> list[dict[str, Any]]:
    seen: set[str] = set()
    deduped: list[dict[str, Any]] = []
    for item in recommendations:
        rec_id = str(item.get("id") or "")
        if rec_id in seen:
            continue
        seen.add(rec_id)
        deduped.append(item)
    return deduped


def _action_message(action: str, result: Any) -> str:
    if action == "auto_repair_run":
        status = (result or {}).get("status") if isinstance(result, dict) else ""
        return "受控修复并复跑已完成" if status == "passed" else "受控修复已执行，请查看剩余失败项"
    if action == "rerun_run":
        return "执行记录已复跑"
    if action == "create_knowledge_candidate":
        return "知识候选已生成"
    if action == "resolve_automation_task":
        return "自动化任务已标记处理"
    if action == "trigger_spec_sync":
        return "规格 DSL 同步已触发"
    if action == "trigger_scheduled_runs":
        return "定时执行已触发"
    return "闭环动作已执行"


def _log_recommendation_action(
    action: str,
    target_id: str,
    project_id: str | None,
    confirm: bool,
    params: dict[str, Any],
    result: Any,
) -> None:
    log_event(
        "info",
        "api_execution",
        "api_execution_recommendation_action_executed",
        "API 自动化闭环动作已执行",
        _action_message(action, result),
        project_id=project_id or _result_project_id(result),
        trace_id=target_id,
        source_id=target_id,
        refs=[target_id],
        data={
            "action": action,
            "target_id": target_id,
            "confirm": confirm,
            "params": params,
        },
    )


def _result_project_id(result: Any) -> str:
    if isinstance(result, dict):
        options = result.get("execution_options") or {}
        return str(options.get("project_id") or result.get("project_id") or "")
    return ""
