"""Async execution queue for workflow runs with SSE streaming."""
from __future__ import annotations

import asyncio
import uuid
from datetime import datetime
from typing import Any

from app.config import settings
from app.utils.logger import logger
from app.workflow.engine import WorkflowEngine
from app.workflow.models import WorkflowDef, WorkflowEvent, WorkflowRunResult
from app.workflow import store as workflow_store

log = logger.getChild("workflow.run_queue")

TERMINAL_STATUSES = {"succeeded", "failed", "cancelled"}

# ── Queue state ────────────────────────────────────────────────────

_semaphore_limit = max(1, int(getattr(settings, "WORKFLOW_MAX_CONCURRENT_RUNS", 3)))
_semaphore = asyncio.Semaphore(_semaphore_limit)
_tasks: dict[str, asyncio.Task] = {}
_sse_channels: dict[str, list[asyncio.Queue]] = {}


# ── Public API ─────────────────────────────────────────────────────

async def enqueue_run(
    workflow: WorkflowDef,
    inputs: dict[str, Any],
    engine: WorkflowEngine,
) -> WorkflowRunResult:
    """Enqueue a workflow execution and return immediately."""
    run = workflow_store.create_run(workflow.id, workflow.version, inputs)
    run_id = run.run_id

    task = asyncio.create_task(
        _execute_run(run_id, workflow, inputs, engine),
        name=f"workflow-run-{run_id}",
    )
    _tasks[run_id] = task
    task.add_done_callback(lambda _t: _tasks.pop(run_id, None))

    log.info("Enqueued workflow run %s for workflow %s", run_id, workflow.id)
    return run


async def cancel_run(run_id: str) -> bool:
    """Cancel a running workflow execution."""
    task = _tasks.get(run_id)
    if task and not task.done():
        task.cancel()
        workflow_store.update_run_status(
            run_id, "cancelled",
            finished_at=datetime.utcnow().isoformat() + "Z",
        )
        _broadcast_sse(run_id, "workflow_cancelled", {"run_id": run_id})
        _close_sse_channels(run_id)
        log.info("Cancelled workflow run %s", run_id)
        return True
    return False


def get_queue_status() -> dict[str, Any]:
    """Return current queue metrics."""
    return {
        "active_tasks": len(_tasks),
        "available_slots": _semaphore._value,
        "semaphore_limit": _semaphore_limit,
        "sse_channels": {rid: len(chans) for rid, chans in _sse_channels.items()},
    }


# ── SSE subscription ───────────────────────────────────────────────

def subscribe_sse(run_id: str) -> asyncio.Queue:
    """Subscribe to SSE events for a run."""
    queue: asyncio.Queue = asyncio.Queue(maxsize=100)
    _sse_channels.setdefault(run_id, []).append(queue)
    return queue


def unsubscribe_sse(run_id: str, queue: asyncio.Queue) -> None:
    """Unsubscribe from SSE events."""
    channels = _sse_channels.get(run_id, [])
    if queue in channels:
        channels.remove(queue)


# ── Internal execution ─────────────────────────────────────────────

async def _execute_run(
    run_id: str,
    workflow: WorkflowDef,
    inputs: dict[str, Any],
    engine: WorkflowEngine,
) -> None:
    """Execute a workflow run with semaphore gating and event broadcasting."""
    started_at = datetime.utcnow().isoformat() + "Z"

    # Acquire semaphore slot
    try:
        await asyncio.wait_for(_semaphore.acquire(), timeout=60)
    except asyncio.TimeoutError:
        workflow_store.update_run_status(
            run_id, "failed",
            error="Queue wait timeout -- too many concurrent runs",
            finished_at=datetime.utcnow().isoformat() + "Z",
        )
        _broadcast_sse(run_id, "workflow_error", {
            "run_id": run_id,
            "error": "Queue wait timeout",
        })
        _close_sse_channels(run_id)
        return

    try:
        workflow_store.update_run_status(run_id, "running", started_at=started_at)
        _broadcast_sse(run_id, "workflow_started", {"run_id": run_id})

        outputs: dict[str, Any] = {}
        node_results: dict[str, Any] = {}

        async for event in engine.execute(workflow, inputs):
            # Broadcast each event via SSE
            _broadcast_sse(run_id, event.type, event.model_dump(mode='json'))

            # Collect final data
            if event.type == "workflow_finished":
                outputs = event.data.get("outputs", {})
                node_results = event.data.get("node_results", {})
            elif event.type == "workflow_error":
                raise RuntimeError(event.data.get("error", "Unknown error"))

        finished_at = datetime.utcnow().isoformat() + "Z"
        workflow_store.update_run_status(
            run_id, "succeeded",
            outputs=outputs,
            node_results=node_results,
            finished_at=finished_at,
        )
        _broadcast_sse(run_id, "workflow_finished", {
            "run_id": run_id,
            "status": "succeeded",
            "outputs": outputs,
        })

    except asyncio.CancelledError:
        log.info("Workflow run %s was cancelled", run_id)
        workflow_store.update_run_status(
            run_id, "cancelled",
            finished_at=datetime.utcnow().isoformat() + "Z",
        )

    except Exception as e:
        log.error("Workflow run %s failed: %s", run_id, e)
        finished_at = datetime.utcnow().isoformat() + "Z"
        workflow_store.update_run_status(
            run_id, "failed",
            error=str(e),
            finished_at=finished_at,
        )
        _broadcast_sse(run_id, "workflow_error", {
            "run_id": run_id,
            "error": str(e),
        })

    finally:
        _semaphore.release()
        _close_sse_channels(run_id)
        _tasks.pop(run_id, None)


# ── SSE helpers ────────────────────────────────────────────────────

def _broadcast_sse(run_id: str, event_type: str, data: dict[str, Any]) -> None:
    """Push an event to all SSE subscribers for a run."""
    channels = _sse_channels.get(run_id, [])
    message = {"event": event_type, "data": data}
    for queue in channels:
        try:
            queue.put_nowait(message)
        except asyncio.QueueFull:
            # Drop oldest message
            try:
                queue.get_nowait()
            except asyncio.QueueEmpty:
                pass
            try:
                queue.put_nowait(message)
            except asyncio.QueueFull:
                pass


def _close_sse_channels(run_id: str) -> None:
    """Close all SSE channels for a run."""
    channels = _sse_channels.pop(run_id, [])
    for queue in channels:
        try:
            queue.put_nowait({"event": "done", "data": {}})
        except asyncio.QueueFull:
            pass
