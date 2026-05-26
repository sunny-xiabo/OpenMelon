import json
import asyncio
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi.responses import StreamingResponse

from app.api.errors import InvalidRequestError, NotFoundError
from app.api.logging_service import log_event
from app.api_execution.ai_assistant import build_repair_patch
from app.api_execution.direct_execution import cancel_direct_execution, is_direct_execution_cancelled, register_direct_execution, unregister_direct_execution
from app.api_execution.diagnostics import enrich_run_report
from app.api_execution.policy import assert_execution_allowed
from app.api_execution.run_queue import cancel_run, enqueue_run, get_queue_status, subscribe_sse, unsubscribe_sse
from app.api_execution.runner import ExecutionCancelledError, run_all_steps, run_single_step
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


def _script_with_environment_variables(script: APITestCaseDsl, environment_snapshot: dict[str, Any] | None) -> APITestCaseDsl:
    variables = dict((environment_snapshot or {}).get("variables") or {})
    if not variables:
        return script
    variables.update(script.variables or {})
    return script.model_copy(update={"variables": variables})


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


def save_run_report(report: dict[str, Any]) -> dict[str, Any]:
    from app.api_execution.services.knowledge_service import save_knowledge_ingest_candidate

    script = _script_from_report(report)
    if script:
        report = enrich_run_report(report, script)
    saved = {
        **report,
        "run_id": report.get("run_id") or str(uuid.uuid4()),
        "run_at": _now_iso(),
    }
    _store().save_run(saved)
    save_unified_automation_records(saved)
    save_knowledge_ingest_candidate(saved)
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


def assert_policy_allowed(
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
            base_url=request.base_url,
            project_policy_snapshot=request.project_policy_snapshot,
            environment_snapshot=request.environment_snapshot,
        )
        save_policy_audit("execute", decision)
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
        save_policy_audit("execute_blocked", decision)
        raise


def save_policy_audit(action: str, decision: dict[str, Any], run_id: str | None = None) -> dict[str, Any]:
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
    saved = _store().save_policy_audit(audit)
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


def log_task_event(task: dict[str, Any], event_type: str = "task_created") -> None:
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


def save_unified_automation_records(run: dict[str, Any]) -> None:
    now = _now_iso()
    options = run.get("execution_options") or {}
    script = run.get("script") or {}
    definition_id = f"api:{run.get('case_id') or script.get('case_id') or run.get('run_id')}"
    automation_run_id = f"api-run:{run.get('run_id')}"
    _store().save_automation_definition(
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
    _store().save_automation_run(
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
        _store().save_run_stage_event(
            {
                "event_id": f"{automation_run_id}:{stage}",
                "automation_run_id": automation_run_id,
                "stage": stage,
                "status": status,
                "created_at": now,
                "detail": _run_result_summary(run) if stage == "summary" else {},
            }
        )
    _store().save_artifact_meta(
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


def save_automation_task(
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
    saved = _store().save_automation_task(task)
    log_task_event(saved)
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


async def auto_repair_and_rerun_service(run_id: str) -> dict[str, Any]:
    run = _store().get_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))
    script = _script_from_report(run)
    if not script:
        raise InvalidRequestError(message=str("执行历史缺少可修复脚本"))
    if run.get("status") == "passed" or not run.get("failed"):
        raise InvalidRequestError(message=str("当前执行记录没有失败步骤，无需自动修复"))

    options = run.get("execution_options") or {}
    policy_snapshot = options.get("project_policy_snapshot") or {}
    environment_snapshot = options.get("environment_snapshot") or {}
    failed_step_ids = [
        str(result.get("step_id"))
        for result in run.get("results", []) or []
        if result.get("status") != "passed" and result.get("step_id")
    ]
    if not failed_step_ids:
        raise InvalidRequestError(message=str("当前执行记录没有可重跑的失败步骤"))

    try:
        _assert_auto_repair_allowed(run, policy_snapshot)
        patch = build_repair_patch(script, run, policy_snapshot)
        _assert_patch_auto_applicable(run, patch)
        request = RunScriptRequest(
            script=patch["patched_script"],
            step_ids=failed_step_ids,
            project_id=options.get("project_id"),
            environment_id=options.get("environment_id"),
            environment_snapshot=environment_snapshot,
            project_policy_snapshot=policy_snapshot,
            base_url=options.get("base_url") or script.base_url,
            global_headers={},
            timeout_ms=options.get("timeout_ms") or 30000,
            run_timeout_ms=options.get("run_timeout_ms"),
            max_steps=options.get("max_steps"),
            continue_on_failure=options.get("continue_on_failure", True),
            replace_run_id=run_id,
        )
        policy_decision = assert_policy_allowed(request, step_ids=failed_step_ids)
        report = await run_all_steps(
            request.script,
            base_url=request.base_url,
            global_headers=request.global_headers,
            timeout_ms=request.timeout_ms,
            max_steps=request.max_steps,
            continue_on_failure=request.continue_on_failure,
            step_ids=request.step_ids,
        )
        report["run_id"] = run_id
        report["case_name"] = request.script.name
        report["mode"] = "auto_repair_rerun"
        report["script"] = request.script.model_dump()
        report["execution_options"] = _execution_options(request, policy_decision)
        report = _merge_partial_run_report(run, report, request.script)
        report = _append_repair_summary(run, report, patch, failed_step_ids, policy_decision)
        saved_report = save_run_report(report)
        save_policy_audit("auto_repair_rerun", policy_decision, run_id=run_id)
        if saved_report.get("failed"):
            save_automation_task(
                "manual_review",
                saved_report,
                policy_decision,
                reason="自动修复重跑后仍有失败步骤，需要人工确认参数、环境或断言。",
                summary=saved_report.get("automation_summary") or {},
            )
        return saved_report
    except ValueError as exc:
        decision = _decision_from_run(run, risk_level="blocked", reason=str(exc))
        save_automation_task("manual_review", run, decision, reason=str(exc))
        save_policy_audit("auto_repair_blocked", decision, run_id=run_id)
        raise InvalidRequestError(message=str(exc)) from exc


async def run_single_step_service(request: RunScriptRequest) -> dict[str, Any]:
    started = time.perf_counter()
    execution_id = (request.execution_id or "").strip()
    current_task = asyncio.current_task()
    if execution_id and current_task:
        register_direct_execution(execution_id, current_task, request)
    try:
        policy_decision = assert_policy_allowed(request, step_id=request.step_id)
        result = await run_single_step(
            request.script,
            step_id=request.step_id,
            base_url=request.base_url,
            global_headers=request.global_headers,
            timeout_ms=request.timeout_ms,
            cancel_check=lambda: is_direct_execution_cancelled(execution_id),
        )
        saved_report = save_run_report(_single_step_report(request.script, result, _execution_options(request, policy_decision)))
        return (saved_report.get("results") or [result])[0]
    except (ExecutionCancelledError, asyncio.CancelledError):
        result = {
            "step_id": request.step_id or (request.script.steps[0].id if request.script.steps else ""),
            "name": "用户强制结束执行",
            "method": "",
            "url": "",
            "status": "cancelled",
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "assertions": [],
            "extracted": {},
            "request": {},
            "response": {},
            "error": "用户强制结束执行",
            "diagnostics": [],
        }
        save_run_report(_single_step_report(request.script, result, _execution_options(request, {})))
        return result
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc
    finally:
        if execution_id:
            unregister_direct_execution(execution_id)


async def run_all_steps_service(request: RunScriptRequest) -> dict[str, Any]:
    started = time.perf_counter()
    execution_id = (request.execution_id or "").strip()
    current_task = asyncio.current_task()
    if execution_id and current_task:
        register_direct_execution(execution_id, current_task, request)
    try:
        if request.replace_run_id and not _store().get_run(request.replace_run_id):
            raise NotFoundError(message=str("要更新的执行历史不存在"))
        executable_script = _script_with_environment_variables(request.script, request.environment_snapshot)
        request = request.model_copy(update={"script": executable_script})
        policy_decision = assert_policy_allowed(request, step_ids=request.step_ids)
        report = await run_all_steps(
            executable_script,
            base_url=request.base_url,
            global_headers=request.global_headers,
            timeout_ms=request.timeout_ms,
            max_steps=request.max_steps,
            continue_on_failure=request.continue_on_failure,
            step_ids=request.step_ids,
            cancel_check=lambda: is_direct_execution_cancelled(execution_id),
        )
        report["case_name"] = request.script.name
        report["mode"] = "batch"
        report["script"] = request.script.model_dump()
        report["execution_options"] = _execution_options(request, policy_decision)
        if request.replace_run_id:
            report["run_id"] = request.replace_run_id
            existing = _store().get_run(request.replace_run_id) or {}
            if request.step_ids:
                report = _merge_partial_run_report(existing, report, request.script)
            if request.script.ai_repair_source:
                report = _append_applied_repair_summary(existing, report, request.script, request.step_ids, policy_decision)
        return save_run_report(report)
    except (ExecutionCancelledError, asyncio.CancelledError):
        report = {
            "case_id": request.script.case_id,
            "target_project": request.script.target_project,
            "case_name": request.script.name,
            "mode": "batch",
            "script": request.script.model_dump(),
            "execution_options": _execution_options(request, {}),
            "status": "cancelled",
            "failure_reason": "用户强制结束执行",
            "duration_ms": int((time.perf_counter() - started) * 1000),
            "total": 0,
            "passed": 0,
            "failed": 0,
            "skipped": len(request.step_ids or request.script.steps or []),
            "progress_total": len(request.step_ids or request.script.steps or []),
            "progress_completed": 0,
            "current_step_id": None,
            "current_step_name": None,
            "results": [],
        }
        return save_run_report(report)
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc
    finally:
        if execution_id:
            unregister_direct_execution(execution_id)


async def cancel_direct_run_service(execution_id: str) -> dict[str, Any]:
    cancelled = cancel_direct_execution(execution_id)
    if not cancelled:
        raise NotFoundError(message=str("直接执行任务不存在"))
    return cancelled


async def create_background_run_service(request: RunScriptRequest) -> dict[str, Any]:
    try:
        policy_decision = assert_policy_allowed(request)
        queued_run = await enqueue_run(request, _execution_options(request, policy_decision), policy_decision)
        return {"run_id": queued_run["run_id"], "status": queued_run["status"]}
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


def list_run_history_service(
    limit: int = 20,
    offset: int = 0,
    status: str | None = None,
    keyword: str | None = None,
    project_id: str | None = None,
) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 50))
    safe_offset = max(0, offset)
    safe_status = status if status in {"queued", "running", "passed", "failed", "cancelled"} else None
    items = _store().list_runs(safe_limit, safe_status, keyword, project_id, offset=safe_offset)
    total = _store().count_runs(safe_status, keyword, project_id)
    return {"total": total, "limit": safe_limit, "offset": safe_offset, "items": items, "runs": items}


def list_case_runs_service(case_id: str, limit: int = 20, offset: int = 0) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 50))
    safe_offset = max(0, offset)
    items = _store().list_runs(safe_limit, keyword=case_id, offset=safe_offset)
    total = _store().count_runs(keyword=case_id)
    return {"total": total, "limit": safe_limit, "offset": safe_offset, "items": items, "runs": items}


def get_run_report_service(run_id: str) -> dict[str, Any]:
    run = _store().get_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))
    return run


def get_queue_status_service() -> dict[str, Any]:
    return get_queue_status()


def stream_run_progress_service(run_id: str) -> StreamingResponse:
    run = _store().get_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))

    if run.get("status") in {"passed", "failed", "cancelled"}:
        async def _final():
            yield _sse_format("finished", {"status": run["status"], "run_id": run_id})
        return StreamingResponse(_final(), media_type="text/event-stream")

    queue = subscribe_sse(run_id)

    async def _stream():
        try:
            yield _sse_format("progress", {
                "run_id": run_id,
                "progress_total": run.get("progress_total", 0),
                "progress_completed": run.get("progress_completed", 0),
                "current_step_id": run.get("current_step_id"),
                "current_step_name": run.get("current_step_name"),
                "total": run.get("total", 0),
                "passed": run.get("passed", 0),
                "failed": run.get("failed", 0),
            })
            while True:
                message = await queue.get()
                if message is None:
                    break
                yield _sse_format(message["event"], message["data"])
        finally:
            unsubscribe_sse(run_id, queue)

    return StreamingResponse(_stream(), media_type="text/event-stream")


def _sse_format(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


async def cancel_background_run_service(run_id: str) -> dict[str, Any]:
    run = await cancel_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))
    return run


async def clear_all_runs_service() -> dict[str, int]:
    runs = _store().list_runs(limit=1000)
    for run in runs:
        if run.get("status") in {"queued", "running"}:
            await cancel_run(run.get("run_id"))

    deleted_count = _store().delete_all_runs()
    return {"deleted_count": deleted_count}


async def delete_run_history_service(run_id: str) -> dict[str, bool]:
    run = _store().get_run(run_id)
    if run and run.get("status") in {"queued", "running"}:
        await cancel_run(run_id)
    if not _store().delete_run(run_id):
        raise NotFoundError(message=str("执行历史不存在"))
    return {"deleted": True}


async def batch_delete_run_history_service(run_ids: list[str]) -> dict[str, int]:
    deleted_count = 0
    for run_id in run_ids:
        run = _store().get_run(run_id)
        if run and run.get("status") in {"queued", "running"}:
            await cancel_run(run_id)
        if _store().delete_run(run_id):
            deleted_count += 1
    return {"deleted_count": deleted_count}


def _safe_export_filename(prefix: str, suffix: str) -> str:
    return f"{prefix}-{_download_timestamp()}.{suffix}"


def _content_disposition(filename: str) -> str:
    return f'attachment; filename="{filename}"'


def _download_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")



__all__ = [name for name in globals() if not name.startswith("__")]
