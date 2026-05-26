import asyncio
import time
import uuid
from typing import Any

from app.config import settings
from app.api_execution.diagnostics import enrich_run_report
from app.api_execution.policy import assert_execution_allowed
from app.api_execution.runner import run_all_steps
from app.api_execution.schemas import RunScriptRequest
from app.api_execution.storage import api_execution_store as _default_api_execution_store
from app.api_execution.storage import get_api_execution_store
from app.api_execution.utils import execution_options as _execution_options
from app.api_execution.utils import now_iso as _now

TERMINAL_STATUSES = {"passed", "failed", "cancelled"}

api_execution_store = _default_api_execution_store


def _store():
    if api_execution_store is not _default_api_execution_store:
        return api_execution_store
    return get_api_execution_store()


def _positive_int(value: Any, default: int) -> int:
    try:
        return max(1, int(value))
    except (TypeError, ValueError):
        return default


def _max_concurrent_runs() -> int:
    return _positive_int(getattr(settings, "API_EXECUTION_MAX_CONCURRENT_RUNS", 2), 2)


def _queue_wait_timeout_s() -> int:
    return _positive_int(getattr(settings, "API_EXECUTION_QUEUE_WAIT_TIMEOUT_S", 60), 60)


def _sse_queue_size() -> int:
    return _positive_int(getattr(settings, "API_EXECUTION_SSE_QUEUE_SIZE", 100), 100)


_semaphore_limit = _max_concurrent_runs()
_semaphore = asyncio.Semaphore(_semaphore_limit)
_tasks: dict[str, asyncio.Task] = {}
_sse_channels: dict[str, list[asyncio.Queue]] = {}


async def enqueue_run(
    request: RunScriptRequest,
    execution_options: dict[str, Any],
    policy_decision: dict[str, Any] | None = None,
    attempt: int = 1,
    parent_run_id: str | None = None,
) -> dict[str, Any]:
    run_id = str(uuid.uuid4())
    now = _now()
    run = {
        "run_id": run_id,
        "run_at": now,
        "queued_at": now,
        "case_id": request.script.case_id,
        "target_project": request.script.target_project,
        "case_name": request.script.name,
        "mode": "background",
        "script": request.script.model_dump(),
        "execution_options": execution_options,
        "status": "queued",
        "failure_reason": None,
        "failure_diagnostics": [],
        "repair_suggestions": [],
        "duration_ms": 0,
        "total": 0,
        "passed": 0,
        "failed": 0,
        "skipped": 0,
        "attempt": attempt,
        "parent_run_id": parent_run_id,
        "progress_total": _runnable_step_count(request),
        "progress_completed": 0,
        "current_step_id": None,
        "current_step_name": None,
        "results": [],
    }
    await _store().async_save_run(run)

    task = asyncio.create_task(_execute_run(run_id, request, policy_decision))
    _tasks[run_id] = task
    task.add_done_callback(lambda _task: _tasks.pop(run_id, None))
    return run


async def cancel_run(run_id: str) -> dict[str, Any] | None:
    run = await _store().async_get_run(run_id)
    if not run:
        return None
    if run.get("status") in TERMINAL_STATUSES:
        return run

    task = _tasks.get(run_id)
    if task and not task.done():
        task.cancel()

    return await _mark_cancelled(
        run_id,
        {
            "status": "cancelled",
            "failure_reason": "用户取消执行",
            "current_step_id": None,
            "current_step_name": None,
        },
    )


async def _execute_run(run_id: str, request: RunScriptRequest, policy_decision: dict[str, Any] | None = None) -> None:
    started = time.perf_counter()
    acquired_slot = False
    try:
        try:
            queue_wait_timeout_s = _queue_wait_timeout_s()
            await asyncio.wait_for(_semaphore.acquire(), timeout=queue_wait_timeout_s)
            acquired_slot = True
        except asyncio.TimeoutError:
            await _mark_finished(
                run_id,
                {
                    "status": "failed",
                    "failure_reason": f"排队等待超时（{queue_wait_timeout_s}秒），当前并发槽位已满，请稍后重试",
                    "current_step_id": None,
                    "current_step_name": None,
                    "duration_ms": int((time.perf_counter() - started) * 1000),
                },
            )
            return
        try:
            if await _is_cancelled(run_id):
                return
            await _store().async_update_run(
                run_id,
                {
                    "status": "running",
                    "started_at": _now(),
                    "failure_reason": None,
                },
            )
            policy_decision = policy_decision or assert_execution_allowed(
                request.script,
                project_id=request.project_id,
                environment_id=request.environment_id,
                approved_high_risk=request.approved_high_risk,
                project_policy_snapshot=request.project_policy_snapshot,
                environment_snapshot=request.environment_snapshot,
            )
            timeout_seconds = max(_run_timeout_ms(request) / 1000, 1)
            report = await asyncio.wait_for(
                run_all_steps(
                    request.script,
                    base_url=request.base_url,
                    global_headers=request.global_headers,
                    timeout_ms=request.timeout_ms,
                    max_steps=request.max_steps,
                    continue_on_failure=request.continue_on_failure,
                    step_ids=request.step_ids,
                    progress_callback=lambda progress: _update_progress(run_id, progress),
                    cancel_check=lambda: _is_cancelled_sync(run_id),
                ),
                timeout=timeout_seconds,
            )
            report.update(
                {
                    "case_id": request.script.case_id,
                    "target_project": request.script.target_project,
                    "case_name": request.script.name,
                    "mode": "background",
                    "script": request.script.model_dump(),
                    "execution_options": _execution_options(request, policy_decision),
                }
            )
            report = enrich_run_report(report, request.script)
            await _mark_finished(run_id, report)
            if report.get("status") == "failed":
                await _maybe_auto_rerun(run_id, request, policy_decision)
        finally:
            if acquired_slot:
                _semaphore.release()
    except asyncio.CancelledError:
        await _mark_finished(
            run_id,
            {
                "status": "cancelled",
                "failure_reason": "用户取消执行",
                "current_step_id": None,
                "current_step_name": None,
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )
    except asyncio.TimeoutError:
        await _mark_finished(
            run_id,
            {
                "status": "failed",
                "failure_reason": f"后台执行超时（{_run_timeout_ms(request)} ms）",
                "current_step_id": None,
                "current_step_name": None,
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )
    except ValueError as exc:
        await _mark_finished(
            run_id,
            {
                "status": "failed",
                "failure_reason": str(exc),
                "current_step_id": None,
                "current_step_name": None,
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )
    except Exception as exc:
        await _mark_finished(
            run_id,
            {
                "status": "failed",
                "failure_reason": f"后台执行失败: {exc}",
                "current_step_id": None,
                "current_step_name": None,
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )


def subscribe_sse(run_id: str) -> asyncio.Queue:
    queue: asyncio.Queue = asyncio.Queue(maxsize=_sse_queue_size())
    _sse_channels.setdefault(run_id, []).append(queue)
    return queue


def unsubscribe_sse(run_id: str, queue: asyncio.Queue) -> None:
    channels = _sse_channels.get(run_id)
    if channels:
        try:
            channels.remove(queue)
        except ValueError:
            pass
        if not channels:
            _sse_channels.pop(run_id, None)


async def _broadcast_sse(run_id: str, event: str, data: dict[str, Any]) -> None:
    channels = _sse_channels.get(run_id, [])
    if not channels:
        return
    message = {"event": event, "data": data}
    for queue in list(channels):
        _offer_sse_message(queue, message)


def _offer_sse_message(queue: asyncio.Queue, message: Any) -> None:
    try:
        queue.put_nowait(message)
        return
    except asyncio.QueueFull:
        pass
    try:
        queue.get_nowait()
    except asyncio.QueueEmpty:
        pass
    try:
        queue.put_nowait(message)
    except asyncio.QueueFull:
        pass


async def _update_progress(run_id: str, progress: dict[str, Any]) -> None:
    def _updater(existing: dict[str, Any]) -> dict[str, Any] | None:
        if existing.get("status") == "cancelled":
            return None
        results = progress.get("results") or existing.get("results", [])
        passed = sum(1 for result in results if result.get("status") == "passed")
        failed = len(results) - passed
        return {
            **existing,
            "progress_total": progress.get("progress_total", existing.get("progress_total", 0)),
            "progress_completed": progress.get("progress_completed", len(results)),
            "current_step_id": progress.get("current_step_id"),
            "current_step_name": progress.get("current_step_name"),
            "results": results,
            "total": len(results),
            "passed": passed,
            "failed": failed,
        }

    result = await _store().async_update_run_atomic(run_id, _updater)
    if result is None:
        raise asyncio.CancelledError()
    await _broadcast_sse(run_id, "progress", {
        "run_id": run_id,
        "progress_total": progress.get("progress_total", 0),
        "progress_completed": progress.get("progress_completed", 0),
        "current_step_id": progress.get("current_step_id"),
        "current_step_name": progress.get("current_step_name"),
        "total": len(progress.get("results") or []),
        "passed": sum(1 for result in (progress.get("results") or []) if result.get("status") == "passed"),
        "failed": sum(1 for result in (progress.get("results") or []) if result.get("status") != "passed"),
    })


async def _mark_finished(run_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    from app.api_execution.services.asset_service import update_interface_test_results

    def _updater(existing: dict[str, Any]) -> dict[str, Any] | None:
        if existing.get("status") == "cancelled":
            return existing
        finished_at = _now()
        duration_ms = patch.get("duration_ms", existing.get("duration_ms", 0))
        merged = dict(patch)
        if merged.get("status") in {"failed", "cancelled"} and not merged.get("failure_diagnostics"):
            merged["failure_diagnostics"] = existing.get("failure_diagnostics", [])
            merged["repair_suggestions"] = existing.get("repair_suggestions", [])
        merged["run_id"] = run_id
        merged["run_at"] = existing.get("run_at") or existing.get("queued_at") or finished_at
        merged["finished_at"] = finished_at
        merged["duration_ms"] = duration_ms
        return {**existing, **merged}

    result = await _store().async_update_run_atomic(run_id, _updater)
    if result:
        update_interface_test_results(result)
        await _broadcast_sse(run_id, "finished", {
            "status": result.get("status", "unknown"),
            "run_id": run_id,
        })
        _close_sse_channels(run_id)
    return result


async def _mark_cancelled(run_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    def _updater(existing: dict[str, Any]) -> dict[str, Any] | None:
        if existing.get("status") in TERMINAL_STATUSES:
            return existing
        finished_at = _now()
        duration_ms = patch.get("duration_ms", existing.get("duration_ms", 0))
        return {
            **existing,
            **patch,
            "run_id": run_id,
            "run_at": existing.get("run_at") or existing.get("queued_at") or finished_at,
            "finished_at": finished_at,
            "duration_ms": duration_ms,
            "failure_diagnostics": existing.get("failure_diagnostics", []),
            "repair_suggestions": existing.get("repair_suggestions", []),
        }

    result = await _store().async_update_run_atomic(run_id, _updater)
    if result:
        await _broadcast_sse(run_id, "finished", {
            "status": result.get("status", "unknown"),
            "run_id": run_id,
        })
        _close_sse_channels(run_id)
    return result


def _close_sse_channels(run_id: str) -> None:
    channels = _sse_channels.pop(run_id, [])
    for queue in channels:
        _offer_sse_message(queue, None)


async def _is_cancelled(run_id: str) -> bool:
    run = await _store().async_get_run(run_id)
    return bool(run and run.get("status") == "cancelled")


def _is_cancelled_sync(run_id: str) -> bool:
    run = _store().get_run(run_id)
    return bool(run and run.get("status") == "cancelled")


async def _maybe_auto_rerun(
    run_id: str,
    request: RunScriptRequest,
    policy_decision: dict[str, Any] | None,
) -> None:
    max_reruns = (request.project_policy_snapshot or {}).get("max_reruns", 0)
    if max_reruns <= 0:
        return

    run = await _store().async_get_run(run_id)
    if not run:
        return
    current_attempt = run.get("attempt", 1)
    if current_attempt >= max_reruns:
        return

    execution_options = run.get("execution_options") or _execution_options(request, policy_decision)
    await enqueue_run(
        request,
        execution_options,
        policy_decision,
        attempt=current_attempt + 1,
        parent_run_id=run_id,
    )


def _runnable_step_count(request: RunScriptRequest) -> int:
    steps = request.script.steps or []
    cleanup_steps = request.script.cleanup_steps or []
    if request.step_ids:
        selected_ids = set(request.step_ids)
        steps = [step for step in steps if step.id in selected_ids]
        cleanup_steps = []
    if request.max_steps and request.max_steps > 0:
        steps = steps[: request.max_steps]
    return len(steps) + len(cleanup_steps)


def _run_timeout_ms(request: RunScriptRequest) -> int:
    if request.run_timeout_ms and request.run_timeout_ms > 0:
        return request.run_timeout_ms
    step_count = request.max_steps or len(request.script.steps) or 1
    return min(max(request.timeout_ms * step_count + 5000, 30000), 300000)


def recover_stale_runs() -> list[str]:
    """Mark runs stuck in queued/running as failed on startup. Returns recovered run IDs."""
    return _store().recover_stale_runs()


def get_queue_status() -> dict[str, Any]:
    store = _store()
    max_concurrent = _max_concurrent_runs()
    active_task_count = sum(1 for task in _tasks.values() if not task.done())
    sse_subscriber_count = sum(len(channels) for channels in _sse_channels.values())
    return {
        "queue_mode": "single_process",
        "max_concurrent_runs": max_concurrent,
        "queue_wait_timeout_s": _queue_wait_timeout_s(),
        "sse_queue_size": _sse_queue_size(),
        "active_task_count": active_task_count,
        "storage_queued_count": store.count_runs(status="queued"),
        "storage_running_count": store.count_runs(status="running"),
        "sse_subscriber_count": sse_subscriber_count,
        "available_slots": max(max_concurrent - active_task_count, 0),
    }


def reset_queue_state_for_tests() -> None:
    global _semaphore, _semaphore_limit, _tasks, _sse_channels
    for task in _tasks.values():
        if not task.done():
            task.cancel()
    _tasks = {}
    _sse_channels = {}
    _semaphore_limit = _max_concurrent_runs()
    _semaphore = asyncio.Semaphore(_semaphore_limit)
