"""Agent-oriented guidance layer for API execution."""

from __future__ import annotations

from collections import Counter
from typing import Any

from app.api.errors import InvalidRequestError, NotFoundError
from app.api_execution.schemas import APIAssetTestPlanRequest, APIAgentTestPlanRequest
from app.api_execution.storage import api_execution_store
from app.api_execution.services import asset_service


SKIPPED_STATUSES = {"deprecated", "hidden", "excluded", "removed"}
STATUS_LABELS = {
    "active": "有效",
    "changed": "变更",
    "deprecated": "废弃",
    "hidden": "隐藏",
    "excluded": "已排除",
    "removed": "已移除",
}


def _agent_action(
    action: str,
    label: str,
    *,
    description: str = "",
    section: str = "",
    scope_strategy: str = "",
    module_id: str = "",
    interface_ids: list[str] | None = None,
    intent: str = "smoke",
) -> dict[str, Any]:
    return {
        "action": action,
        "label": label,
        "description": description,
        "section": section,
        "scope_strategy": scope_strategy,
        "module_id": module_id,
        "interface_ids": interface_ids or [],
        "intent": intent,
    }


def _active_interfaces(interfaces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [
        item
        for item in interfaces
        if item.get("status") in asset_service.EXECUTABLE_INTERFACE_STATUSES and not item.get("hidden")
    ]


def _changed_interfaces(interfaces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    return [item for item in _active_interfaces(interfaces) if item.get("status") == "changed"]


def _module_counts(interfaces: list[dict[str, Any]]) -> Counter[str]:
    counts: Counter[str] = Counter()
    for interface in _active_interfaces(interfaces):
        counts[interface.get("module_id", "")] += 1
    return counts


def _recommended_module(modules: list[dict[str, Any]], interfaces: list[dict[str, Any]]) -> dict[str, Any] | None:
    counts = _module_counts(interfaces)
    candidates = [
        module
        for module in modules
        if module.get("status") not in {"excluded", "removed"} and counts.get(module.get("module_id", ""), 0) > 0
    ]
    if not candidates:
        return None
    return sorted(
        candidates,
        key=lambda item: (-counts.get(item.get("module_id", ""), 0), int(item.get("sort_order") or 100), item.get("name", "")),
    )[0]


def _default_environment(project: dict[str, Any]) -> dict[str, Any] | None:
    environments = api_execution_store.list_environments(project.get("project_id", ""))
    default_id = project.get("default_environment_id") or ""
    return next((item for item in environments if item.get("environment_id") == default_id), None) or (environments[0] if environments else None)


def _recent_run(project_id: str) -> dict[str, Any] | None:
    runs = api_execution_store.list_runs(limit=1, project_id=project_id)
    if not runs:
        return None
    run = runs[0]
    return {
        "run_id": run.get("run_id", ""),
        "case_name": run.get("case_name", ""),
        "status": run.get("status", ""),
        "passed": run.get("passed", 0),
        "failed": run.get("failed", 0),
        "run_at": run.get("run_at", ""),
        "failure_reason": run.get("failure_reason", ""),
    }


def _skipped_reason_groups_from_interfaces(project: dict[str, Any], interfaces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups: Counter[str] = Counter()
    allowlist = asset_service._patterns(project.get("operation_allowlist"))
    blocklist = asset_service._patterns(project.get("operation_blocklist"))
    for interface in interfaces:
        status = str(interface.get("status") or "active")
        interface_key = interface.get("interface_key", "")
        risk = asset_service._interface_risk(project, interface)
        if interface.get("hidden") or status in SKIPPED_STATUSES:
            label = STATUS_LABELS.get(status, status or "未知")
            groups[f"状态为{label}，默认不进入 Agent 测试"] += 1
        elif status not in asset_service.EXECUTABLE_INTERFACE_STATUSES:
            groups[f"状态为{STATUS_LABELS.get(status, status or '未知')}，暂不执行"] += 1
        elif risk == "blocked":
            groups["风险等级为 blocked，禁止自动执行"] += 1
        elif asset_service._matches_interface_pattern(interface_key, blocklist):
            groups["命中项目接口黑名单"] += 1
        elif allowlist and not asset_service._matches_interface_pattern(interface_key, allowlist):
            groups["不在项目接口白名单内"] += 1
    return [{"reason": reason, "count": count} for reason, count in groups.most_common()]


def _skipped_reason_groups_from_plan(skipped: list[dict[str, Any]]) -> list[dict[str, Any]]:
    groups = Counter(str(item.get("reason") or "未说明原因") for item in skipped)
    return [{"reason": reason, "count": count} for reason, count in groups.most_common()]


def _asset_summary(modules: list[dict[str, Any]], interfaces: list[dict[str, Any]]) -> dict[str, Any]:
    status_counts = Counter(str(item.get("status") or "active") for item in interfaces)
    active = _active_interfaces(interfaces)
    changed = _changed_interfaces(interfaces)
    return {
        "module_count": len(modules),
        "interface_count": len(interfaces),
        "active_interface_count": len(active),
        "changed_interface_count": len(changed),
        "excluded_interface_count": status_counts.get("excluded", 0),
        "status_counts": dict(status_counts),
    }


def _risk_summary(project: dict[str, Any], interfaces: list[dict[str, Any]]) -> dict[str, Any]:
    counts = Counter(asset_service._interface_risk(project, item) for item in interfaces)
    return {
        "low": counts.get("low", 0),
        "medium": counts.get("medium", 0),
        "high": counts.get("high", 0),
        "blocked": counts.get("blocked", 0),
    }


def _recommendation(
    project: dict[str, Any],
    environment: dict[str, Any] | None,
    modules: list[dict[str, Any]],
    interfaces: list[dict[str, Any]],
    recent: dict[str, Any] | None,
) -> dict[str, Any]:
    project_id = project.get("project_id", "")
    active = _active_interfaces(interfaces)
    changed = _changed_interfaces(interfaces)
    module = _recommended_module(modules, interfaces)

    if not environment:
        return _agent_action("configure_environment", "配置环境", description="先创建或选择一个可执行环境。", section="config")
    if not str(environment.get("base_url") or "").strip():
        return _agent_action("configure_base_url", "补齐 Base URL", description="当前环境缺少 Base URL，执行前需要补齐。", section="config")
    if not active:
        return _agent_action(
            "sync_assets" if project.get("spec_id") else "import_openapi",
            "同步接口资产" if project.get("spec_id") else "导入 OpenAPI",
            description="当前项目还没有可测试接口，先准备接口资产。",
            section="config" if not project.get("spec_id") else "assets",
        )
    if recent and recent.get("status") == "failed":
        return _agent_action("view_failure", "查看失败诊断", description="最近一次执行失败，建议先查看报告和修复建议。", section="reports")
    if changed:
        return _agent_action(
            "generate_test_plan",
            f"测试 {len(changed)} 个变更接口",
            description="优先重测 OpenAPI 变更影响范围。",
            section="agent",
            scope_strategy="changed",
            interface_ids=[item.get("interface_id", "") for item in changed if item.get("interface_id")],
            intent="smoke",
        )
    if module:
        count = _module_counts(interfaces).get(module.get("module_id", ""), 0)
        return _agent_action(
            "generate_test_plan",
            f"测试模块：{module.get('name')}",
            description=f"该模块有 {count} 个有效接口，适合作为默认冒烟范围。",
            section="agent",
            scope_strategy="module",
            module_id=module.get("module_id", ""),
            intent="smoke",
        )
    return _agent_action("select_scope", "选择测试范围", description="请选择模块或接口后生成测试计划。", section="agent")


def _quick_actions(
    project: dict[str, Any],
    modules: list[dict[str, Any]],
    interfaces: list[dict[str, Any]],
    recent: dict[str, Any] | None,
) -> list[dict[str, Any]]:
    actions = [_agent_action("open_config", "准备配置", section="config")]
    changed = _changed_interfaces(interfaces)
    if changed:
        actions.append(
            _agent_action(
                "generate_test_plan",
                f"测试变更影响 ({len(changed)})",
                section="agent",
                scope_strategy="changed",
                interface_ids=[item.get("interface_id", "") for item in changed if item.get("interface_id")],
            )
        )
    module = _recommended_module(modules, interfaces)
    if module:
        actions.append(
            _agent_action(
                "generate_test_plan",
                f"测试模块：{module.get('name')}",
                section="agent",
                scope_strategy="module",
                module_id=module.get("module_id", ""),
            )
        )
    if project.get("spec_id"):
        actions.append(_agent_action("open_assets", "查看接口资产", section="assets"))
    if recent:
        actions.append(_agent_action("view_reports", "查看最近结果", section="reports"))
    return actions[:5]


def get_agent_context_service(project_id: str) -> dict[str, Any]:
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    asset_service.ensure_project_assets(project)
    modules = asset_service._with_module_counts(project_id, api_execution_store.list_api_modules(project_id))
    interfaces = api_execution_store.list_api_interfaces(project_id, limit=1000)
    environment = _default_environment(project)
    recent = _recent_run(project_id)
    pending_task_count = api_execution_store.count_automation_tasks("pending", project_id)
    asset_summary = _asset_summary(modules, interfaces)
    readiness = {
        "project_ready": True,
        "environment_ready": bool(environment),
        "base_url_ready": bool(str((environment or {}).get("base_url") or "").strip()),
        "assets_ready": asset_summary["active_interface_count"] > 0,
        "has_changed_interfaces": asset_summary["changed_interface_count"] > 0,
        "has_failed_recent_run": bool(recent and recent.get("status") == "failed"),
    }
    recommendation = _recommendation(project, environment, modules, interfaces, recent)
    return {
        "project_id": project_id,
        "project_name": project.get("name", ""),
        "readiness": readiness,
        "asset_summary": asset_summary,
        "risk_summary": _risk_summary(project, interfaces),
        "skipped_reason_groups": _skipped_reason_groups_from_interfaces(project, interfaces),
        "recent_run": recent,
        "pending_task_count": pending_task_count,
        "recommendation": recommendation,
        "quick_actions": _quick_actions(project, modules, interfaces, recent),
        "summary": recommendation.get("description") or recommendation.get("label", ""),
    }


def _resolve_agent_scope(project_id: str, request: APIAgentTestPlanRequest, modules: list[dict[str, Any]], interfaces: list[dict[str, Any]]) -> tuple[str, list[str]]:
    strategy = str(request.scope_strategy or "auto").strip().lower()
    if request.interface_ids:
        return "", [str(item) for item in request.interface_ids if str(item).strip()]
    if request.module_id:
        return str(request.module_id), []
    if strategy == "changed":
        return "", [item.get("interface_id", "") for item in _changed_interfaces(interfaces) if item.get("interface_id")]
    if strategy == "module":
        module = _recommended_module(modules, interfaces)
        return (module.get("module_id", "") if module else ""), []
    if strategy == "interfaces":
        raise InvalidRequestError(message=str("按接口生成计划时必须选择接口"))
    if strategy != "auto":
        raise InvalidRequestError(message=str("Agent 测试范围策略不合法"))
    changed_ids = [item.get("interface_id", "") for item in _changed_interfaces(interfaces) if item.get("interface_id")]
    if changed_ids:
        return "", changed_ids
    module = _recommended_module(modules, interfaces)
    return (module.get("module_id", "") if module else ""), []


def build_agent_test_plan_service(project_id: str, request: APIAgentTestPlanRequest) -> dict[str, Any]:
    project = api_execution_store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    asset_service.ensure_project_assets(project)
    modules = asset_service._with_module_counts(project_id, api_execution_store.list_api_modules(project_id))
    interfaces = api_execution_store.list_api_interfaces(project_id, limit=1000)
    module_id, interface_ids = _resolve_agent_scope(project_id, request, modules, interfaces)
    result = asset_service.build_asset_test_plan_service(
        project_id,
        APIAssetTestPlanRequest(
            module_id=module_id,
            interface_ids=interface_ids,
            test_intent=request.intent or "smoke",
            include_high_risk=bool(request.include_high_risk),
        ),
    )
    skipped_groups = _skipped_reason_groups_from_plan(result.get("skipped_interfaces") or [])
    if not skipped_groups:
        skipped_groups = _skipped_reason_groups_from_interfaces(project, interfaces)
    if result.get("requires_high_risk_confirmation"):
        next_action = _agent_action("confirm_high_risk", "确认高风险接口", description="当前范围包含高风险接口，确认后才会纳入脚本。", section="agent")
    elif result.get("script", {}).get("steps"):
        next_action = _agent_action("go_orchestrate", "去编排执行", description="测试计划已生成，下一步检查 DSL 并执行。", section="orchestrate")
    else:
        next_action = _agent_action("adjust_scope", "调整测试范围", description="当前范围没有可执行接口，请调整模块、接口或状态。", section="agent")
    included_count = len(result.get("included_interfaces") or [])
    skipped_count = len(result.get("skipped_interfaces") or [])
    return {
        **result,
        "agent_summary": f"Agent 已选择 {included_count} 个接口，跳过 {skipped_count} 个接口。",
        "next_action": next_action,
        "skipped_reason_groups": skipped_groups,
    }


__all__ = [name for name in globals() if not name.startswith("__")]
