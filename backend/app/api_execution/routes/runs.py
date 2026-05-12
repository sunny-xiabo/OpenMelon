from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()

@router.post("/runs/{run_id}/auto-repair", response_model=APIRunReport)
async def auto_repair_and_rerun(run_id: str):
    run = api_execution_store.get_run(run_id)
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
        policy_decision = _assert_policy_allowed(request, step_ids=failed_step_ids)
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
        saved_report = _save_run_report(report)
        _save_policy_audit("auto_repair_rerun", policy_decision, run_id=run_id)
        if saved_report.get("failed"):
            _save_automation_task(
                "manual_review",
                saved_report,
                policy_decision,
                reason="自动修复重跑后仍有失败步骤，需要人工确认参数、环境或断言。",
                summary=saved_report.get("automation_summary") or {},
            )
        return saved_report
    except ValueError as exc:
        decision = _decision_from_run(run, risk_level="blocked", reason=str(exc))
        _save_automation_task("manual_review", run, decision, reason=str(exc))
        _save_policy_audit("auto_repair_blocked", decision, run_id=run_id)
        raise InvalidRequestError(message=str(exc)) from exc


@router.post("/runs/single-step", response_model=APIStepRunResult)
async def run_single_step_endpoint(request: RunScriptRequest):
    try:
        policy_decision = _assert_policy_allowed(request, step_id=request.step_id)
        result = await run_single_step(
            request.script,
            step_id=request.step_id,
            base_url=request.base_url,
            global_headers=request.global_headers,
            timeout_ms=request.timeout_ms,
        )
        saved_report = _save_run_report(_single_step_report(request.script, result, _execution_options(request, policy_decision)))
        return (saved_report.get("results") or [result])[0]
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.post("/runs", response_model=APIRunReport)
async def run_all_steps_endpoint(request: RunScriptRequest):
    try:
        if request.replace_run_id and not api_execution_store.get_run(request.replace_run_id):
            raise NotFoundError(message=str("要更新的执行历史不存在"))
        policy_decision = _assert_policy_allowed(request, step_ids=request.step_ids)
        report = await run_all_steps(
            request.script,
            base_url=request.base_url,
            global_headers=request.global_headers,
            timeout_ms=request.timeout_ms,
            max_steps=request.max_steps,
            continue_on_failure=request.continue_on_failure,
            step_ids=request.step_ids,
        )
        report["case_name"] = request.script.name
        report["mode"] = "batch"
        report["script"] = request.script.model_dump()
        report["execution_options"] = _execution_options(request, policy_decision)
        if request.replace_run_id:
            report["run_id"] = request.replace_run_id
            existing = api_execution_store.get_run(request.replace_run_id) or {}
            if request.step_ids:
                report = _merge_partial_run_report(existing, report, request.script)
            if request.script.ai_repair_source:
                report = _append_applied_repair_summary(existing, report, request.script, request.step_ids, policy_decision)
        return _save_run_report(report)
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.post("/runs/async", response_model=CreateRunResponse)
async def create_background_run(request: RunScriptRequest):
    try:
        policy_decision = _assert_policy_allowed(request)
        queued_run = await enqueue_run(request, _execution_options(request, policy_decision), policy_decision)
        return {"run_id": queued_run["run_id"], "status": queued_run["status"]}
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.get("/runs", response_model=APIRunHistoryResponse)
async def list_run_history(
    limit: int = 20,
    status: str | None = None,
    keyword: str | None = None,
    project_id: str | None = None,
):
    safe_limit = max(1, min(limit, 50))
    safe_status = status if status in {"queued", "running", "passed", "failed", "cancelled"} else None
    return {"runs": api_execution_store.list_runs(safe_limit, safe_status, keyword, project_id)}


@router.get("/cases/{case_id}/runs", response_model=APIRunHistoryResponse)
async def list_case_runs(case_id: str, limit: int = 20):
    safe_limit = max(1, min(limit, 50))
    return {"runs": api_execution_store.list_runs(safe_limit, keyword=case_id)}


@router.get("/runs/{run_id}", response_model=APIRunReport)
async def get_run_report(run_id: str):
    run = api_execution_store.get_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))
    return run


@router.get("/runs/{run_id}/stream")
async def stream_run_progress(run_id: str):
    run = api_execution_store.get_run(run_id)
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
                "progress_total": run.get("progress_total", 0),
                "progress_completed": run.get("progress_completed", 0),
                "current_step_id": run.get("current_step_id"),
                "current_step_name": run.get("current_step_name"),
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


@router.post("/runs/{run_id}/cancel", response_model=APIRunReport)
async def cancel_background_run(run_id: str):
    run = await cancel_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))
    return run


@router.delete("/runs/clear-all")
async def clear_all_runs():
    # Attempt to cancel any queued/running runs first
    # This might be slow if there are many, but it's safe.
    runs = api_execution_store.list_runs(limit=1000)
    for run in runs:
        if run.get("status") in {"queued", "running"}:
            await cancel_run(run.get("run_id"))
    
    deleted_count = api_execution_store.delete_all_runs()
    return {"deleted_count": deleted_count}


@router.delete("/runs/{run_id}")
async def delete_run_history(run_id: str):
    run = api_execution_store.get_run(run_id)
    if run and run.get("status") in {"queued", "running"}:
        await cancel_run(run_id)
    if not api_execution_store.delete_run(run_id):
        raise NotFoundError(message=str("执行历史不存在"))
    return {"deleted": True}


@router.post("/runs/batch-delete")
async def batch_delete_run_history(run_ids: list[str]):
    deleted_count = 0
    for run_id in run_ids:
        run = api_execution_store.get_run(run_id)
        if run and run.get("status") in {"queued", "running"}:
            await cancel_run(run_id)
        if api_execution_store.delete_run(run_id):
            deleted_count += 1
    return {"deleted_count": deleted_count}




__all__ = [name for name in globals() if not name.startswith("__")]
