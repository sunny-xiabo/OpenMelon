from app.api_execution.router_deps import *

STORAGE_MIGRATION_TABLES: tuple[dict[str, Any], ...] = (
    {
        "table": "runs",
        "label": "执行历史",
        "indexed_columns": ["run_id", "status", "project_id", "case_id", "case_name", "environment_name", "run_at"],
        "pg_strategy": "核心筛选列独立建表字段，script/results/execution_options 保留 JSONB。",
    },
    {
        "table": "projects",
        "label": "项目配置",
        "indexed_columns": ["project_id", "name", "updated_at"],
        "pg_strategy": "项目级策略、认证、setup/cleanup 可先落 JSONB，后续按查询频率拆列。",
    },
    {
        "table": "environments",
        "label": "环境变量",
        "indexed_columns": ["environment_id", "project_id", "updated_at"],
        "pg_strategy": "headers/variables 使用 JSONB，敏感值迁移前需确认脱敏或加密策略。",
    },
    {
        "table": "specs",
        "label": "接口规格",
        "indexed_columns": ["spec_id", "source_url", "content_hash", "parsed_at"],
        "pg_strategy": "OpenAPI 原始解析结果落 JSONB，source_url/content_hash 继续建唯一性/检索索引。",
    },
    {
        "table": "api_spec_versions",
        "label": "规格版本",
        "indexed_columns": ["spec_version_id", "project_id", "spec_id", "content_hash", "imported_at"],
        "pg_strategy": "版本元数据拆列，operations 快照保留 JSONB。",
    },
    {
        "table": "api_modules",
        "label": "接口模块",
        "indexed_columns": ["module_id", "project_id", "module_key", "status", "sort_order"],
        "pg_strategy": "模块基础字段拆列，扩展信息保留 JSONB。",
    },
    {
        "table": "api_interfaces",
        "label": "接口资产",
        "indexed_columns": ["interface_id", "project_id", "module_id", "interface_key", "method", "path", "status"],
        "pg_strategy": "接口资产核心字段拆列，parameters/request_body/responses 保留 JSONB。",
    },
    {
        "table": "automation_tasks",
        "label": "治理任务",
        "indexed_columns": ["task_id", "status", "project_id", "updated_at", "created_at"],
        "pg_strategy": "任务状态和项目拆列，summary/context 保留 JSONB。",
    },
    {
        "table": "policy_audits",
        "label": "策略审计",
        "indexed_columns": ["audit_id", "project_id", "action", "created_at"],
        "pg_strategy": "审计动作拆列，decision 保留 JSONB。",
    },
    {
        "table": "event_logs",
        "label": "事件日志",
        "indexed_columns": ["event_id", "created_at", "level", "module", "event_type", "project_id", "trace_id"],
        "pg_strategy": "日志检索字段拆列，data 保留 JSONB；大表建议按时间归档。",
    },
    {
        "table": "ai_call_logs",
        "label": "AI 调用日志",
        "indexed_columns": ["call_id", "created_at", "feature", "operation", "model", "status", "trace_id"],
        "pg_strategy": "观测指标拆列，prompt/response 摘要保留 JSONB；敏感内容按配置脱敏。",
    },
    {
        "table": "knowledge_items",
        "label": "修复知识",
        "indexed_columns": ["knowledge_id", "item_type", "project_id", "status", "created_at"],
        "pg_strategy": "知识状态拆列，embedding/metadata 预留向量库或 JSONB 映射。",
    },
)


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
        "auth_config",
        "setup_steps",
        "cleanup_steps",
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
    audits = api_execution_store.list_policy_audits(safe_limit + safe_offset, project_id, action)
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
    items = api_execution_store.list_automation_tasks(safe_limit, safe_status, project_id, offset=safe_offset)
    total = api_execution_store.count_automation_tasks(safe_status, project_id)
    return {"total": total, "limit": safe_limit, "offset": safe_offset, "items": items, "tasks": items}


def get_task_center_summary_service(limit: int = 50, project_id: str | None = None) -> dict[str, Any]:
    from app.api_execution.services.dashboard_service import _task_center_summary

    return _task_center_summary(project_id=project_id, limit=limit)


def resolve_automation_task_service(task_id: str) -> dict[str, Any]:
    from app.api_execution.services.run_service import _log_task_event

    now = _now_iso()
    task = api_execution_store.update_automation_task(
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
    _log_task_event(task, "task_resolved")
    return task


async def trigger_scheduled_runs_service() -> dict[str, Any]:
    triggered_at = _now_iso()
    items = []
    for project in api_execution_store.list_projects():
        items.append(await _enqueue_scheduled_project(project, triggered_at))
    return {"triggered_at": triggered_at, "items": items}


def trigger_spec_sync_service() -> dict[str, Any]:
    triggered_at = _now_iso()
    items = []
    for project in api_execution_store.list_projects():
        items.append(_sync_project_spec_dsl(project, triggered_at))
    return {"triggered_at": triggered_at, "items": items}


def get_storage_migration_readiness_service() -> dict[str, Any]:
    generated_at = _now_iso()
    table_profiles = [_storage_table_profile(item) for item in STORAGE_MIGRATION_TABLES]
    counts = {item["table"]: item["row_count"] for item in table_profiles}
    return {
        "generated_at": generated_at,
        "storage_engine": "sqlite",
        "database_path": _sqlite_database_path(),
        "journal_mode": _sqlite_journal_mode(),
        "pg_readiness": _pg_readiness_status(table_profiles),
        "table_profiles": table_profiles,
        "json_field_risks": _json_field_risks(),
        "retention_plan": _retention_plan(counts),
        "recommended_steps": _pg_recommended_steps(),
    }


def _storage_table_profile(item: dict[str, Any]) -> dict[str, Any]:
    table = item["table"]
    with api_execution_store._lock:
        row = api_execution_store._query_one(
            f"SELECT COUNT(*) AS row_count, COALESCE(SUM(LENGTH(data)), 0) AS data_bytes FROM {table}"
        )
    return {
        "table": table,
        "label": item.get("label", table),
        "row_count": int(row["row_count"] if row else 0),
        "data_bytes": int(row["data_bytes"] if row else 0),
        "indexed_columns": item.get("indexed_columns", []),
        "pg_strategy": item.get("pg_strategy", ""),
    }


def _sqlite_database_path() -> str:
    with api_execution_store._lock:
        rows = api_execution_store._query("PRAGMA database_list")
    for row in rows:
        if row["name"] == "main":
            return row["file"] or ""
    return ""


def _sqlite_journal_mode() -> str:
    with api_execution_store._lock:
        row = api_execution_store._query_one("PRAGMA journal_mode")
    return str(row[0]) if row else ""


def _pg_readiness_status(table_profiles: list[dict[str, Any]]) -> str:
    total_rows = sum(item.get("row_count", 0) for item in table_profiles)
    run_rows = next((item.get("row_count", 0) for item in table_profiles if item.get("table") == "runs"), 0)
    if total_rows == 0:
        return "empty_ready"
    if run_rows > 100000:
        return "needs_batch_migration_plan"
    return "ready_with_jsonb_mapping"


def _json_field_risks() -> list[dict[str, Any]]:
    return [
        {
            "area": "执行历史 script/results/execution_options",
            "risk_level": "medium",
            "detail": "当前 SQLite data 字段承载完整 JSON，PG 迁移时如果全量拆列会放大 schema 变更成本。",
            "mitigation": "保留核心检索字段拆列，复杂结构映射为 JSONB，并为 project_id/status/run_at 等字段建立索引。",
        },
        {
            "area": "项目认证、环境变量、headers",
            "risk_level": "high",
            "detail": "认证配置和变量可能包含敏感值，直接迁移会带来明文扩散风险。",
            "mitigation": "迁移前做敏感键扫描，生产库使用密文或引用 Secret，不在执行历史中重复落敏感值。",
        },
        {
            "area": "接口资产 request_body/responses/security",
            "risk_level": "low",
            "detail": "接口资产天然是半结构化数据，适合 JSONB，但依赖手工编辑字段的兼容性。",
            "mitigation": "模块、方法、路径、状态等稳定字段拆列，其余 OpenAPI 片段保留 JSONB。",
        },
    ]


def _retention_plan(counts: dict[str, int]) -> dict[str, Any]:
    run_count = counts.get("runs", 0)
    event_log_count = counts.get("event_logs", 0)
    ai_call_log_count = counts.get("ai_call_logs", 0)
    archive_strategy = [
        "执行历史默认在线保留最近 90-180 天，按项目和月份导出归档快照。",
        "失败、已沉淀知识、策略阻断的记录延长保留，普通通过记录可优先归档。",
        "事件日志继续使用现有清理能力，error 级别保留更长周期。",
    ]
    if run_count > 5000 or event_log_count > 50000:
        recommendation = "建议先建立月度归档任务，再执行 PG 双写或批量迁移。"
    else:
        recommendation = "当前数据量可直接做一次性迁移演练，归档策略先以配置和文档落地。"
    return {
        "run_count": run_count,
        "event_log_count": event_log_count,
        "ai_call_log_count": ai_call_log_count,
        "recommendation": recommendation,
        "archive_strategy": archive_strategy,
    }


def _pg_recommended_steps() -> list[str]:
    return [
        "先固定 PG 表结构：稳定检索字段拆列，复杂 payload 映射 JSONB。",
        "迁移脚本按表分页读取 SQLite data，写入 PG 后校验 row_count、核心字段和 JSON hash。",
        "上线前做只读双跑：SQLite 仍为主库，PG 用于校验查询和报表。",
        "通过后再切换写入，保留 SQLite 备份和回滚窗口。",
    ]



__all__ = [name for name in globals() if not name.startswith("__")]
