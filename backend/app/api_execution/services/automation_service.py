from typing import Any

from app.api.errors import NotFoundError
from app.api_execution.dsl_generator import generate_api_dsl
from app.api_execution.run_queue import enqueue_run
from app.api_execution.schemas import APITestCaseDsl, RunScriptRequest
from app.api_execution.storage import api_execution_store as _default_api_execution_store
from app.api_execution.storage import get_api_execution_store
from app.api_execution.utils import execution_options as _execution_options
from app.api_execution.utils import now_iso as _now_iso

api_execution_store = _default_api_execution_store


def _store():
    if api_execution_store is not _default_api_execution_store:
        return api_execution_store
    return get_api_execution_store()

async def _enqueue_scheduled_project(project: dict[str, Any], triggered_at: str) -> dict[str, Any]:
    from app.api_execution.services.run_service import (
        assert_policy_allowed,
        save_automation_task,
        save_policy_audit,
    )

    project_id = project.get("project_id", "")
    project_name = project.get("name", "")
    if not project.get("enabled", True):
        return _automation_item(project_id, project_name, "skipped", reason="项目已停用")
    if not project.get("allow_scheduled_execution"):
        return _automation_item(project_id, project_name, "skipped", reason="项目未开启定时执行")
    if not project.get("allow_ai_execution"):
        return _automation_item(project_id, project_name, "blocked", reason="项目未开启 AI 自动执行")

    environment = _store().get_environment(project.get("default_environment_id", ""))
    if not environment or not environment.get("enabled", True):
        return _automation_item(project_id, project_name, "blocked", reason="默认环境不存在或已停用")

    script_payload = project.get("auto_generated_dsl") or _generate_project_dsl(project)
    if not script_payload:
        return _automation_item(project_id, project_name, "blocked", reason="项目缺少可执行 DSL 或接口资产")

    script = APITestCaseDsl(**script_payload)
    request = RunScriptRequest(
        script=script,
        project_id=project_id,
        environment_id=environment.get("environment_id"),
        environment_snapshot=_environment_snapshot(environment),
        project_policy_snapshot=_project_policy_snapshot(project),
        base_url=environment.get("base_url") or script.base_url,
        global_headers=environment.get("headers") or {},
        timeout_ms=int(environment.get("timeout_ms") or 30000),
        run_timeout_ms=None,
        max_steps=project.get("max_requests_per_run") or None,
        continue_on_failure=environment.get("continue_on_failure", True),
    )
    try:
        policy_decision = assert_policy_allowed(request)
        run = await enqueue_run(request, _execution_options(request, policy_decision), policy_decision)
        _store().save_project({**project, "last_scheduled_run_at": triggered_at, "updated_at": triggered_at})
        save_policy_audit("scheduled_run", policy_decision, run_id=run.get("run_id"))
        return _automation_item(project_id, project_name, "queued", run_id=run.get("run_id"))
    except ValueError as exc:
        decision = {
            "allowed": False,
            "risk_level": "blocked",
            "violations": [str(exc)],
            "project_id": project_id,
            "environment_id": environment.get("environment_id", ""),
            "trigger_source": "scheduled",
        }
        save_automation_task("scheduled_run_review", {"run_id": None, "execution_options": {"project_id": project_id}}, decision, reason=str(exc))
        return _automation_item(project_id, project_name, "blocked", reason=str(exc))


def _sync_project_spec_dsl(project: dict[str, Any], triggered_at: str) -> dict[str, Any]:
    project_id = project.get("project_id", "")
    project_name = project.get("name", "")
    if not project.get("enabled", True):
        return _spec_sync_item(project_id, project_name, "skipped", reason="项目已停用")
    if not project.get("allow_ai_generate_dsl", True):
        return _spec_sync_item(project_id, project_name, "skipped", reason="项目未开启 AI 自动生成 DSL")

    spec = _latest_project_spec(project)
    if not spec:
        return _spec_sync_item(project_id, project_name, "skipped", reason="项目未绑定接口资产")

    content_hash = spec.get("content_hash", "")
    if content_hash and project.get("last_spec_content_hash") == content_hash and project.get("auto_generated_dsl"):
        return _spec_sync_item(
            project_id,
            project_name,
            "unchanged",
            spec_id=spec.get("spec_id", ""),
            operation_count=spec.get("operation_count", 0),
            reason="接口资产未变化",
        )

    try:
        dsl = _generate_project_dsl({**project, "spec_id": spec.get("spec_id")}, spec=spec)
    except ValueError as exc:
        return _spec_sync_item(project_id, project_name, "blocked", spec_id=spec.get("spec_id", ""), reason=str(exc))

    _store().save_project(
        {
            **project,
            "spec_id": spec.get("spec_id"),
            "last_spec_content_hash": content_hash,
            "last_dsl_generated_at": triggered_at,
            "auto_generated_dsl": dsl,
            "updated_at": triggered_at,
        }
    )
    return _spec_sync_item(
        project_id,
        project_name,
        "updated",
        spec_id=spec.get("spec_id", ""),
        operation_count=len(dsl.get("steps") or []),
    )


def _generate_project_dsl(project: dict[str, Any], spec: dict[str, Any] | None = None) -> dict[str, Any] | None:
    spec = spec or _store().get_spec(project.get("spec_id", ""))
    if not spec:
        return None
    operation_ids = _project_operation_ids(project, spec)
    dsl = generate_api_dsl(spec, operation_ids)
    dsl["target_project"] = project.get("name") or dsl.get("target_project", "")
    return dsl


def _project_operation_ids(project: dict[str, Any], spec: dict[str, Any]) -> list[str]:
    operations = spec.get("operations") or []
    allowlist = set(project.get("operation_allowlist") or [])
    if allowlist:
        return [
            operation.get("id")
            for operation in operations
            if operation.get("id") in allowlist
        ]
    return [operation.get("id") for operation in operations if operation.get("id")]


def _latest_project_spec(project: dict[str, Any]) -> dict[str, Any] | None:
    current = _store().get_spec(project.get("spec_id", ""))
    source_url = current.get("source_url") if current else ""
    if source_url:
        return _store().get_latest_spec_by_source_url(source_url) or current
    return current


def _environment_snapshot(environment: dict[str, Any]) -> dict[str, Any]:
    return {
        "environment_id": environment.get("environment_id", ""),
        "project_id": environment.get("project_id", ""),
        "name": environment.get("name", ""),
        "environment_type": environment.get("environment_type", "test"),
        "base_url": environment.get("base_url", ""),
        "headers": environment.get("headers", {}),
        "variables": environment.get("variables", {}),
        "timeout_ms": environment.get("timeout_ms", 30000),
        "continue_on_failure": environment.get("continue_on_failure", True),
    }


def _project_policy_snapshot(project: dict[str, Any]) -> dict[str, Any]:
    keys = {
        "project_id",
        "name",
        "allow_ai_execution",
        "allow_ai_repair",
        "allow_scheduled_execution",
        "allow_ai_generate_dsl",
        "allow_overwrite_history",
        "max_auto_repairs",
        "max_reruns",
        "max_requests_per_run",
        "risk_overrides",
        "operation_allowlist",
        "operation_blocklist",
    }
    return {key: project.get(key) for key in keys if key in project}


def _automation_item(project_id: str, project_name: str, status: str, *, run_id: str | None = None, reason: str = "") -> dict[str, Any]:
    return {
        "project_id": project_id,
        "project_name": project_name,
        "status": status,
        "run_id": run_id,
        "reason": reason,
    }


def _spec_sync_item(
    project_id: str,
    project_name: str,
    status: str,
    *,
    spec_id: str = "",
    operation_count: int = 0,
    reason: str = "",
) -> dict[str, Any]:
    return {
        "project_id": project_id,
        "project_name": project_name,
        "status": status,
        "spec_id": spec_id,
        "operation_count": operation_count,
        "reason": reason,
    }


def list_policy_audits_service(
    limit: int = 20,
    offset: int = 0,
    project_id: str | None = None,
    action: str | None = None,
) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    audits = _store().list_policy_audits(safe_limit + safe_offset, project_id, action)
    items = audits[safe_offset:safe_offset + safe_limit]
    return {"total": len(audits), "limit": safe_limit, "offset": safe_offset, "items": items, "audits": items}


def list_automation_tasks_service(
    limit: int = 20,
    offset: int = 0,
    status: str | None = None,
    project_id: str | None = None,
) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 100))
    safe_offset = max(0, offset)
    safe_status = status if status in {"pending", "running", "resolved", "failed"} else None
    items = _store().list_automation_tasks(safe_limit, safe_status, project_id, offset=safe_offset)
    total = _store().count_automation_tasks(safe_status, project_id)
    return {"total": total, "limit": safe_limit, "offset": safe_offset, "items": items, "tasks": items}


def get_task_center_summary_service(limit: int = 50, project_id: str | None = None) -> dict[str, Any]:
    from app.api_execution.services.dashboard_service import task_center_summary

    return task_center_summary(project_id=project_id, limit=limit)


def resolve_automation_task_service(task_id: str) -> dict[str, Any]:
    from app.api_execution.services.run_service import log_task_event

    now = _now_iso()
    task = _store().update_automation_task(
        task_id,
        {
            "status": "resolved",
            "updated_at": now,
            "resolved_at": now,
            "resolution_note": "人工确认完成",
        },
    )
    if not task:
        raise NotFoundError(message=str("待处理任务不存在"))
    log_task_event(task, "task_resolved")
    return task


async def trigger_scheduled_runs_service() -> dict[str, Any]:
    triggered_at = _now_iso()
    items = []
    for project in _store().list_projects():
        items.append(await _enqueue_scheduled_project(project, triggered_at))
    return {"triggered_at": triggered_at, "items": items}


def trigger_spec_sync_service() -> dict[str, Any]:
    triggered_at = _now_iso()
    items = []
    for project in _store().list_projects():
        items.append(_sync_project_spec_dsl(project, triggered_at))
    return {"triggered_at": triggered_at, "items": items}
__all__ = [name for name in globals() if not name.startswith("__")]
