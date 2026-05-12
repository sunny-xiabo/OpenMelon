from app.api_execution.router_deps import *

def _single_step_report(script: APITestCaseDsl, result: dict[str, Any], execution_options: dict[str, Any]) -> dict[str, Any]:
    passed = 1 if result.get("status") == "passed" else 0
    failed = 0 if passed else 1
    return {
        "case_id": script.case_id,
        "target_project": script.target_project,
        "case_name": script.name,
        "mode": "single",
        "script": script.model_dump(),
        "execution_options": execution_options,
        "status": result.get("status", "failed"),
        "duration_ms": result.get("duration_ms", 0),
        "total": 1,
        "passed": passed,
        "failed": failed,
        "skipped": 0,
        "results": [result],
    }


def _save_run_report(report: dict[str, Any]) -> dict[str, Any]:
    from app.api_execution.services.knowledge_service import _save_knowledge_ingest_candidate

    script = _script_from_report(report)
    if script:
        report = enrich_run_report(report, script)
    saved = {
        **report,
        "run_id": report.get("run_id") or str(uuid.uuid4()),
        "run_at": _now_iso(),
    }
    api_execution_store.save_run(saved)
    _save_unified_automation_records(saved)
    _save_knowledge_ingest_candidate(saved)
    _log_run_event(saved)
    return saved


def _merge_partial_run_report(
    existing: dict[str, Any],
    partial: dict[str, Any],
    script: APITestCaseDsl,
) -> dict[str, Any]:
    old_results = existing.get("results") or []
    new_results = partial.get("results") or []
    results_by_step = {
        str(result.get("step_id")): result
        for result in old_results
        if result.get("step_id")
    }
    for result in new_results:
        if result.get("step_id"):
            results_by_step[str(result.get("step_id"))] = result

    ordered_results = []
    seen_step_ids: set[str] = set()
    for step in script.steps or []:
        result = results_by_step.get(step.id)
        if result:
            ordered_results.append(result)
            seen_step_ids.add(step.id)
    ordered_results.extend(
        result
        for step_id, result in results_by_step.items()
        if step_id not in seen_step_ids
    )

    passed = sum(1 for result in ordered_results if result.get("status") == "passed")
    failed = len(ordered_results) - passed
    skipped = max(len(script.steps or []) - len(ordered_results), 0)
    return {
        **existing,
        **partial,
        "script": script.model_dump(),
        "results": ordered_results,
        "total": len(ordered_results),
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "status": "passed" if failed == 0 and skipped == 0 else "failed",
        "failure_reason": None,
        "failure_diagnostics": [],
        "repair_suggestions": [],
    }


def _script_from_report(report: dict[str, Any]) -> APITestCaseDsl | None:
    script = report.get("script")
    if isinstance(script, APITestCaseDsl):
        return script
    if isinstance(script, dict):
        try:
            return APITestCaseDsl(**script)
        except Exception:
            return None
    return None


def _assert_policy_allowed(
    request: RunScriptRequest,
    *,
    step_id: str | None = None,
    step_ids: list[str] | None = None,
) -> dict[str, Any]:
    try:
        decision = assert_execution_allowed(
            request.script,
            step_id=step_id,
            step_ids=step_ids,
            project_id=request.project_id,
            environment_id=request.environment_id,
            project_policy_snapshot=request.project_policy_snapshot,
            environment_snapshot=request.environment_snapshot,
        )
        _save_policy_audit("execute", decision)
        return decision
    except ValueError as exc:
        decision = {
            "allowed": False,
            "risk_level": "blocked",
            "violations": [str(exc)],
            "project_id": request.project_id or request.project_policy_snapshot.get("project_id", ""),
            "environment_id": request.environment_id or request.environment_snapshot.get("environment_id", ""),
            "evaluated_steps": [f"{step.method} {step.path}" for step in request.script.steps],
        }
        _save_policy_audit("execute_blocked", decision)
        raise


def _save_policy_audit(action: str, decision: dict[str, Any], run_id: str | None = None) -> dict[str, Any]:
    audit = {
        "audit_id": str(uuid.uuid4()),
        "created_at": _now_iso(),
        "action": action,
        "run_id": run_id,
        "project_id": decision.get("project_id", ""),
        "environment_id": decision.get("environment_id", ""),
        "trigger_source": decision.get("trigger_source", "manual"),
        "decision": decision,
        "approved": decision.get("allowed", False),
        "approval_note": "系统策略自动判定",
    }
    saved = api_execution_store.save_policy_audit(audit)
    _log_policy_event(saved)
    return saved


def _log_run_event(run: dict[str, Any]) -> None:
    options = run.get("execution_options") or {}
    status = run.get("status", "")
    level = "error" if status == "failed" else "warning" if status == "cancelled" else "info"
    title = "API 执行失败" if status == "failed" else "API 执行完成"
    log_event(
        level,
        "api_execution",
        f"run_{status or 'unknown'}",
        title,
        run.get("failure_reason") or f"通过 {run.get('passed', 0)} / 失败 {run.get('failed', 0)}",
        project_id=options.get("project_id", ""),
        trace_id=run.get("run_id", ""),
        source_id=run.get("run_id", ""),
        refs=[run.get("case_id"), options.get("environment_id"), options.get("flow_template_id")],
        data={
            "run_id": run.get("run_id"),
            "case_id": run.get("case_id"),
            "case_name": run.get("case_name"),
            "status": status,
            "passed": run.get("passed", 0),
            "failed": run.get("failed", 0),
            "duration_ms": run.get("duration_ms", 0),
        },
    )


def _log_policy_event(audit: dict[str, Any]) -> None:
    allowed = bool(audit.get("approved"))
    decision = audit.get("decision") or {}
    log_event(
        "info" if allowed else "warning",
        "policy",
        audit.get("action", "policy_audit"),
        "策略允许执行" if allowed else "策略需要关注",
        audit.get("approval_note") or "系统策略自动判定",
        project_id=audit.get("project_id", ""),
        trace_id=audit.get("run_id") or audit.get("audit_id", ""),
        source_id=audit.get("audit_id", ""),
        refs=[audit.get("run_id"), audit.get("environment_id")],
        data={"audit_id": audit.get("audit_id"), "decision": decision},
    )


def _log_task_event(task: dict[str, Any], event_type: str = "task_created") -> None:
    log_event(
        "error" if task.get("risk_level") == "blocked" or task.get("status") == "failed" else "warning" if task.get("status") == "pending" else "info",
        "task_center",
        event_type,
        "待处理任务已创建" if event_type == "task_created" else "待处理任务已更新",
        task.get("reason") or task.get("resolution_note") or task.get("task_id", ""),
        project_id=task.get("project_id", ""),
        trace_id=task.get("run_id") or task.get("task_id", ""),
        source_id=task.get("task_id", ""),
        refs=[task.get("run_id"), task.get("environment_id"), task.get("result_run_id")],
        data=task,
    )


def _save_unified_automation_records(run: dict[str, Any]) -> None:
    now = _now_iso()
    options = run.get("execution_options") or {}
    script = run.get("script") or {}
    definition_id = f"api:{run.get('case_id') or script.get('case_id') or run.get('run_id')}"
    automation_run_id = f"api-run:{run.get('run_id')}"
    api_execution_store.save_automation_definition(
        {
            "definition_id": definition_id,
            "automation_type": "api",
            "name": run.get("case_name") or script.get("name") or run.get("case_id") or "API 自动化用例",
            "project_id": options.get("project_id", ""),
            "source_id": run.get("case_id") or script.get("case_id", ""),
            "status": "active",
            "policy_snapshot": options.get("project_policy_snapshot") or {},
            "created_at": run.get("run_at") or now,
            "updated_at": now,
        }
    )
    api_execution_store.save_automation_run(
        {
            "automation_run_id": automation_run_id,
            "automation_type": "api",
            "source_run_id": run.get("run_id", ""),
            "definition_id": definition_id,
            "project_id": options.get("project_id", ""),
            "environment_id": options.get("environment_id", ""),
            "status": run.get("status", ""),
            "run_at": run.get("run_at") or now,
            "summary": _run_result_summary(run),
            "policy_snapshot": options.get("project_policy_snapshot") or {},
        }
    )
    for stage, status in _stage_events_from_run(run):
        api_execution_store.save_run_stage_event(
            {
                "event_id": f"{automation_run_id}:{stage}",
                "automation_run_id": automation_run_id,
                "stage": stage,
                "status": status,
                "created_at": now,
                "detail": _run_result_summary(run) if stage == "summary" else {},
            }
        )
    api_execution_store.save_artifact_meta(
        {
            "artifact_id": f"{automation_run_id}:report-json",
            "automation_run_id": automation_run_id,
            "artifact_type": "report_json",
            "name": f"{run.get('case_name') or run.get('case_id') or 'api-run'} 报告",
            "created_at": now,
            "metadata": {
                "source_run_id": run.get("run_id"),
                "result_count": len(run.get("results") or []),
                "has_repair_history": bool(run.get("repair_history")),
            },
        }
    )


def _stage_events_from_run(run: dict[str, Any]) -> list[tuple[str, str]]:
    events = [("queued", "passed"), ("policy_check", "passed"), ("execute", run.get("status", "unknown")), ("summary", "passed")]
    if run.get("repair_history"):
        events.append(("auto_repair", run.get("status", "unknown")))
    return events



def _assert_auto_repair_allowed(run: dict[str, Any], policy_snapshot: dict[str, Any]) -> None:
    if not policy_snapshot.get("allow_ai_execution"):
        raise ValueError("项目未开启 AI 自动执行，自动修复重跑已进入人工待处理")
    if not policy_snapshot.get("allow_ai_repair"):
        raise ValueError("项目未开启 AI 自动修复，自动修复重跑已进入人工待处理")
    if policy_snapshot.get("allow_overwrite_history") is False:
        raise ValueError("项目策略禁止覆盖更新历史记录，自动修复重跑已进入人工待处理")

    max_auto_repairs = int(policy_snapshot.get("max_auto_repairs") or 0)
    repair_count = len(run.get("repair_history") or [])
    if max_auto_repairs > 0 and repair_count >= max_auto_repairs:
        raise ValueError(f"自动修复次数已达到项目上限 {max_auto_repairs} 次")


def _assert_patch_auto_applicable(run: dict[str, Any], patch: dict[str, Any]) -> None:
    if not patch.get("patch_operations"):
        raise ValueError("AI 未找到可自动应用的安全修复补丁")
    if not patch.get("automatic_applicable"):
        raise ValueError("AI 修复补丁需要人工确认，已进入待处理队列")
    if patch.get("risk_level") != "low":
        raise ValueError(f"AI 修复补丁风险等级为 {patch.get('risk_level') or 'unknown'}，不能无人值守重跑")
    unsafe_ops = [
        op
        for op in patch.get("patch_operations", []) or []
        if not op.get("safe_to_apply")
    ]
    if unsafe_ops:
        raise ValueError("AI 修复补丁包含需要人工确认的修改，已进入待处理队列")

    # Re-evaluate policy on the patched script instead of reusing the original run's decision
    options = run.get("execution_options") or {}
    patched_script = patch.get("patched_script")
    if patched_script:
        try:
            patched_decision = assert_execution_allowed(
                patched_script,
                project_id=options.get("project_id"),
                environment_id=options.get("environment_id"),
                project_policy_snapshot=options.get("project_policy_snapshot"),
                environment_snapshot=options.get("environment_snapshot"),
            )
            if patched_decision.get("risk_level") and patched_decision.get("risk_level") != "low":
                raise ValueError(f"修复后脚本风险等级为 {patched_decision.get('risk_level')}，不能无人值守自动修复")
        except ValueError:
            raise
        except Exception:
            pass


def _append_repair_summary(
    previous: dict[str, Any],
    updated: dict[str, Any],
    patch: dict[str, Any],
    failed_step_ids: list[str],
    policy_decision: dict[str, Any],
) -> dict[str, Any]:
    before = _run_result_summary(previous)
    after = _run_result_summary(updated)
    summary = {
        "type": "auto_repair_rerun",
        "created_at": _now_iso(),
        "before": before,
        "after": after,
        "failed_step_ids": failed_step_ids,
        "patched_fields": [
            {
                "step_id": op.get("step_id"),
                "field": op.get("field"),
                "reason": op.get("reason"),
            }
            for op in patch.get("patch_operations", []) or []
        ],
        "status_changed": before.get("status") != after.get("status"),
        "failed_delta": int(after.get("failed") or 0) - int(before.get("failed") or 0),
        "risk_level": policy_decision.get("risk_level", patch.get("risk_level", "low")),
        "repair_effect_score": _repair_outcome_score(before, after, policy_decision.get("risk_level", patch.get("risk_level", "low"))),
    }
    repair_history = [*(previous.get("repair_history") or []), summary]
    return {
        **updated,
        "automation_summary": summary,
        "repair_history": repair_history[-10:],
    }


def _append_applied_repair_summary(
    previous: dict[str, Any],
    updated: dict[str, Any],
    script: APITestCaseDsl,
    rerun_step_ids: list[str],
    policy_decision: dict[str, Any],
) -> dict[str, Any]:
    before = _run_result_summary(previous)
    after = _run_result_summary(updated)
    source_labels = {
        "low_risk_repair": "低风险 AI 修复项",
        "full_repair_draft": "完整 AI 修复草稿",
        "direct_patch": "AI 修复补丁",
    }
    summary = {
        "type": "controlled_repair_rerun",
        "source": script.ai_repair_source,
        "source_label": source_labels.get(script.ai_repair_source, script.ai_repair_source),
        "created_at": _now_iso(),
        "applied_at": script.ai_repair_applied_at,
        "before": before,
        "after": after,
        "failed_step_ids": rerun_step_ids,
        "patched_fields": script.ai_repair_applied_operations or [],
        "status_changed": before.get("status") != after.get("status"),
        "failed_delta": int(after.get("failed") or 0) - int(before.get("failed") or 0),
        "risk_level": policy_decision.get("risk_level", "low"),
        "repair_effect_score": _repair_outcome_score(before, after, policy_decision.get("risk_level", "low")),
    }
    repair_history = [*(previous.get("repair_history") or []), summary]
    return {
        **updated,
        "automation_summary": summary,
        "repair_history": repair_history[-10:],
    }


def _run_result_summary(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": report.get("status", ""),
        "total": report.get("total", 0),
        "passed": report.get("passed", 0),
        "failed": report.get("failed", 0),
        "skipped": report.get("skipped", 0),
        "duration_ms": report.get("duration_ms", 0),
        "run_at": report.get("run_at") or report.get("finished_at") or "",
    }


def _repair_outcome_score(before: dict[str, Any], after: dict[str, Any], risk_level: str = "low") -> dict[str, Any]:
    before_failed = int(before.get("failed") or 0)
    after_failed = int(after.get("failed") or 0)
    score = 50
    if after.get("status") == "passed":
        score += 30
    if before_failed > after_failed:
        score += min(20, (before_failed - after_failed) * 10)
    if after_failed > before_failed:
        score -= min(25, (after_failed - before_failed) * 10)
    if risk_level == "high":
        score -= 15
    elif risk_level == "medium":
        score -= 5
    score = max(0, min(100, score))
    if score >= 80:
        level = "good"
        label = "修复有效"
    elif score >= 60:
        level = "medium"
        label = "部分有效"
    else:
        level = "low"
        label = "需继续排查"
    return {"score": score, "level": level, "label": label}


def _save_automation_task(
    task_type: str,
    run: dict[str, Any],
    decision: dict[str, Any],
    *,
    reason: str,
    summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = _now_iso()
    task = {
        "task_id": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now,
        "task_type": task_type,
        "status": "pending",
        "run_id": run.get("run_id"),
        "project_id": decision.get("project_id") or ((run.get("execution_options") or {}).get("project_id") or ""),
        "environment_id": decision.get("environment_id") or ((run.get("execution_options") or {}).get("environment_id") or ""),
        "risk_level": decision.get("risk_level", "medium"),
        "reason": reason,
        "summary": summary or _run_result_summary(run),
        "decision": decision,
        "result_run_id": None,
        "resolved_at": None,
        "resolution_note": "",
    }
    saved = api_execution_store.save_automation_task(task)
    _log_task_event(saved)
    return saved


def _decision_from_run(run: dict[str, Any], *, risk_level: str, reason: str) -> dict[str, Any]:
    options = run.get("execution_options") or {}
    decision = options.get("policy_decision") or {}
    return {
        **decision,
        "allowed": False,
        "risk_level": risk_level,
        "violations": [reason],
        "project_id": decision.get("project_id") or options.get("project_id", ""),
        "environment_id": decision.get("environment_id") or options.get("environment_id", ""),
        "trigger_source": "auto_repair",
    }


def _safe_export_filename(prefix: str, suffix: str) -> str:
    return f"{prefix}-{_download_timestamp()}.{suffix}"


def _content_disposition(filename: str) -> str:
    return f'attachment; filename="{filename}"'


def _download_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")



__all__ = [name for name in globals() if not name.startswith("__")]
