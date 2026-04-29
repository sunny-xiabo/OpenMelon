import asyncio
import time
import uuid
from datetime import UTC, datetime
from typing import Any

from app.api_execution.diagnostics import enrich_run_report
from app.api_execution.policy import assert_execution_allowed
from app.api_execution.runner import run_all_steps
from app.api_execution.schemas import RunScriptRequest
from app.api_execution.storage import api_execution_store

MAX_CONCURRENT_RUNS = 2
TERMINAL_STATUSES = {"passed", "failed", "cancelled"}

_semaphore = asyncio.Semaphore(MAX_CONCURRENT_RUNS)
_tasks: dict[str, asyncio.Task] = {}


def enqueue_run(
    request: RunScriptRequest,
    execution_options: dict[str, Any],
    policy_decision: dict[str, Any] | None = None,
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
        "results": [],
    }
    api_execution_store.save_run(run)

    task = asyncio.create_task(_execute_run(run_id, request, policy_decision))
    _tasks[run_id] = task
    task.add_done_callback(lambda _task: _tasks.pop(run_id, None))
    return run


def cancel_run(run_id: str) -> dict[str, Any] | None:
    run = api_execution_store.get_run(run_id)
    if not run:
        return None
    if run.get("status") in TERMINAL_STATUSES:
        return run

    task = _tasks.get(run_id)
    if task and not task.done():
        task.cancel()

    return _mark_finished(
        run_id,
        {
            "status": "cancelled",
            "failure_reason": "用户取消执行",
        },
    )


async def _execute_run(run_id: str, request: RunScriptRequest, policy_decision: dict[str, Any] | None = None) -> None:
    started = time.perf_counter()
    try:
        async with _semaphore:
            if _is_cancelled(run_id):
                return
            api_execution_store.update_run(
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
            _mark_finished(run_id, report)
    except asyncio.CancelledError:
        _mark_finished(
            run_id,
            {
                "status": "cancelled",
                "failure_reason": "用户取消执行",
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )
    except asyncio.TimeoutError:
        _mark_finished(
            run_id,
            {
                "status": "failed",
                "failure_reason": f"后台执行超时（{_run_timeout_ms(request)} ms）",
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )
    except ValueError as exc:
        _mark_finished(
            run_id,
            {
                "status": "failed",
                "failure_reason": str(exc),
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )
    except Exception as exc:
        _mark_finished(
            run_id,
            {
                "status": "failed",
                "failure_reason": f"后台执行失败: {exc}",
                "duration_ms": int((time.perf_counter() - started) * 1000),
            },
        )


def _mark_finished(run_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
    existing = api_execution_store.get_run(run_id)
    if not existing:
        return None
    finished_at = _now()
    duration_ms = patch.get("duration_ms", existing.get("duration_ms", 0))
    if patch.get("status") in {"failed", "cancelled"} and not patch.get("failure_diagnostics"):
        patch = {
            **patch,
            "failure_diagnostics": existing.get("failure_diagnostics", []),
            "repair_suggestions": existing.get("repair_suggestions", []),
        }
    merged_patch = {
        **patch,
        "run_id": run_id,
        "run_at": existing.get("run_at") or existing.get("queued_at") or finished_at,
        "finished_at": finished_at,
        "duration_ms": duration_ms,
    }
    return api_execution_store.update_run(run_id, merged_patch)


def _is_cancelled(run_id: str) -> bool:
    run = api_execution_store.get_run(run_id)
    return bool(run and run.get("status") == "cancelled")


def _run_timeout_ms(request: RunScriptRequest) -> int:
    if request.run_timeout_ms and request.run_timeout_ms > 0:
        return request.run_timeout_ms
    step_count = request.max_steps or len(request.script.steps) or 1
    return min(max(request.timeout_ms * step_count + 5000, 30000), 300000)


def _execution_options(request: RunScriptRequest, policy_decision: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "project_id": request.project_id,
        "environment_id": request.environment_id,
        "environment_snapshot": request.environment_snapshot,
        "project_policy_snapshot": request.project_policy_snapshot,
        "base_url": request.base_url,
        "timeout_ms": request.timeout_ms,
        "run_timeout_ms": request.run_timeout_ms,
        "max_steps": request.max_steps,
        "continue_on_failure": request.continue_on_failure,
        "has_global_headers": bool(request.global_headers),
        "policy_decision": policy_decision or {},
    }


def _now() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")
