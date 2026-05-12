from app.api_execution.router_deps import *

async def _enqueue_scheduled_project(project: dict[str, Any], triggered_at: str) -> dict[str, Any]:
    from app.api_execution.services.run_service import (
        _assert_policy_allowed,
        _save_automation_task,
        _save_policy_audit,
    )

    project_id = project.get("project_id", "")
    project_name = project.get("name", "")
    if not project.get("enabled", True):
        return _automation_item(project_id, project_name, "skipped", reason="项目已停用")
    if not project.get("allow_scheduled_execution"):
        return _automation_item(project_id, project_name, "skipped", reason="项目未开启定时执行")
    if not project.get("allow_ai_execution"):
        return _automation_item(project_id, project_name, "blocked", reason="项目未开启 AI 自动执行")

    environment = api_execution_store.get_environment(project.get("default_environment_id", ""))
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
        policy_decision = _assert_policy_allowed(request)
        run = await enqueue_run(request, _execution_options(request, policy_decision), policy_decision)
        api_execution_store.save_project({**project, "last_scheduled_run_at": triggered_at, "updated_at": triggered_at})
        _save_policy_audit("scheduled_run", policy_decision, run_id=run.get("run_id"))
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
        _save_automation_task("scheduled_run_review", {"run_id": None, "execution_options": {"project_id": project_id}}, decision, reason=str(exc))
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

    api_execution_store.save_project(
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
    spec = spec or api_execution_store.get_spec(project.get("spec_id", ""))
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
    current = api_execution_store.get_spec(project.get("spec_id", ""))
    source_url = current.get("source_url") if current else ""
    if source_url:
        return api_execution_store.get_latest_spec_by_source_url(source_url) or current
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



__all__ = [name for name in globals() if not name.startswith("__")]
