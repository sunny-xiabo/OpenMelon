"""FastAPI routes for the workflow orchestration module."""
from __future__ import annotations

import asyncio
import json
import uuid
from datetime import datetime
from typing import Any

from fastapi import APIRouter, HTTPException, Query
from fastapi.responses import StreamingResponse

from app.utils.logger import logger
from app.workflow import dsl as workflow_dsl
from app.workflow import store as workflow_store
from app.workflow.engine import WorkflowEngine
from app.workflow.models import (
    CreateTemplateRequest,
    CreateWorkflowRequest,
    RunWorkflowRequest,
    UpdateWorkflowRequest,
    WorkflowDef,
    WorkflowListResponse,
    WorkflowTemplate,
)
from app.workflow.run_queue import (
    cancel_run,
    enqueue_run,
    get_queue_status,
    subscribe_sse,
    unsubscribe_sse,
)

log = logger.getChild("workflow.api")

router = APIRouter(prefix="/api/workflows", tags=["workflow"])

# Engine singleton -- initialized in main.py lifespan
_engine: WorkflowEngine | None = None


def get_engine() -> WorkflowEngine:
    global _engine
    if _engine is None:
        raise HTTPException(500, "Workflow engine not initialized")
    return _engine


def set_engine(engine: WorkflowEngine) -> None:
    global _engine
    _engine = engine


# ── Workflow CRUD ──────────────────────────────────────────────────

@router.post("", response_model=WorkflowDef, status_code=201)
async def create_workflow(req: CreateWorkflowRequest):
    """Create a new workflow definition."""
    wf = workflow_store.create_workflow(req)
    return wf


@router.get("", response_model=WorkflowListResponse)
async def list_workflows(
    status: str | None = Query(None),
    limit: int = Query(50, ge=1, le=200),
    offset: int = Query(0, ge=0),
):
    """List workflow definitions with optional status filter."""
    workflows, total = workflow_store.list_workflows(status, limit, offset)
    return WorkflowListResponse(workflows=workflows, total=total)


@router.get("/{workflow_id}", response_model=WorkflowDef)
async def get_workflow(workflow_id: str):
    """Get a workflow definition by ID."""
    wf = workflow_store.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return wf


@router.put("/{workflow_id}", response_model=WorkflowDef)
async def update_workflow(workflow_id: str, req: UpdateWorkflowRequest):
    """Update a workflow definition."""
    wf = workflow_store.update_workflow(workflow_id, req)
    if not wf:
        raise HTTPException(404, "Workflow not found")
    return wf


@router.delete("/{workflow_id}")
async def delete_workflow(workflow_id: str):
    """Delete a workflow definition."""
    ok = workflow_store.delete_workflow(workflow_id)
    if not ok:
        raise HTTPException(404, "Workflow not found")
    return {"ok": True}


# ── Publish / Unpublish ────────────────────────────────────────────

@router.post("/{workflow_id}/publish")
async def publish_workflow(workflow_id: str):
    """Publish a workflow (draft -> published)."""
    ok = workflow_store.set_workflow_status(workflow_id, "published")
    if not ok:
        raise HTTPException(404, "Workflow not found")
    return {"ok": True, "status": "published"}


@router.post("/{workflow_id}/unpublish")
async def unpublish_workflow(workflow_id: str):
    """Unpublish a workflow (published -> draft)."""
    ok = workflow_store.set_workflow_status(workflow_id, "draft")
    if not ok:
        raise HTTPException(404, "Workflow not found")
    return {"ok": True, "status": "draft"}


# ── Execution ──────────────────────────────────────────────────────

@router.post("/{workflow_id}/run")
async def run_workflow_blocking(workflow_id: str, req: RunWorkflowRequest):
    """Execute a workflow and wait for completion (blocking mode)."""
    wf = workflow_store.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")

    engine = get_engine()
    outputs: dict[str, Any] = {}
    node_results: dict[str, Any] = {}
    error: str | None = None

    async for event in engine.execute(wf, req.inputs):
        if event.type == "workflow_finished":
            outputs = event.data.get("outputs", {})
            node_results = event.data.get("node_results", {})
        elif event.type == "workflow_error":
            error = event.data.get("error", "Unknown error")

    return {
        "status": "failed" if error else "succeeded",
        "outputs": outputs,
        "node_results": node_results,
        "error": error,
    }


@router.post("/{workflow_id}/run/stream")
async def run_workflow_streaming(workflow_id: str, req: RunWorkflowRequest):
    """Execute a workflow with SSE streaming."""
    wf = workflow_store.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")

    engine = get_engine()
    run = await enqueue_run(wf, req.inputs, engine)

    async def event_generator():
        queue = subscribe_sse(run.run_id)
        try:
            while True:
                try:
                    msg = await queue.get()
                    event_type = msg.get("event", "message")
                    data = json.dumps(msg.get("data", {}), ensure_ascii=False)
                    yield f"event: {event_type}\ndata: {data}\n\n"
                    if event_type in ("workflow_finished", "workflow_error", "done"):
                        break
                except asyncio.CancelledError:
                    break
        finally:
            unsubscribe_sse(run.run_id, queue)

    return StreamingResponse(
        event_generator(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/runs/{run_id}")
async def get_run(run_id: str):
    """Get a workflow run result."""
    run = workflow_store.get_run(run_id)
    if not run:
        raise HTTPException(404, "Run not found")
    return run.model_dump()


@router.post("/runs/{run_id}/cancel")
async def cancel_run_endpoint(run_id: str):
    """Cancel a running workflow execution."""
    ok = await cancel_run(run_id)
    if not ok:
        raise HTTPException(404, "Run not found or already finished")
    return {"ok": True}


@router.get("/{workflow_id}/runs")
async def list_runs(
    workflow_id: str,
    limit: int = Query(20, ge=1, le=100),
    offset: int = Query(0, ge=0),
):
    """List execution runs for a workflow."""
    runs, total = workflow_store.list_runs(workflow_id, limit, offset)
    return {"runs": [r.model_dump() for r in runs], "total": total}


@router.get("/queue/status")
async def queue_status():
    """Get the current execution queue status."""
    return get_queue_status()


# ── DSL Import / Export ────────────────────────────────────────────

@router.post("/import")
async def import_workflow(
    content: str,
    format: str = Query("json", pattern="^(json|yaml)$"),
):
    """Import a workflow from DSL (JSON or YAML)."""
    try:
        if format == "yaml":
            req = workflow_dsl.parse_yaml_dsl(content)
        else:
            req = workflow_dsl.parse_json_dsl(content)
    except Exception as e:
        raise HTTPException(400, f"Invalid DSL: {e}")

    wf = workflow_store.create_workflow(req)
    return wf


@router.get("/{workflow_id}/export")
async def export_workflow(
    workflow_id: str,
    format: str = Query("json", pattern="^(json|yaml)$"),
):
    """Export a workflow as DSL (JSON or YAML)."""
    wf = workflow_store.get_workflow(workflow_id)
    if not wf:
        raise HTTPException(404, "Workflow not found")

    if format == "yaml":
        content = workflow_dsl.workflow_to_yaml(wf)
        media_type = "text/yaml"
    else:
        content = workflow_dsl.workflow_to_json(wf)
        media_type = "application/json"

    return StreamingResponse(
        iter([content]),
        media_type=media_type,
        headers={
            "Content-Disposition": f'attachment; filename="workflow_{workflow_id}.{format}"'
        },
    )


# ── Templates ──────────────────────────────────────────────────────

@router.get("/templates/list")
async def list_templates(category: str | None = Query(None)):
    """List workflow templates."""
    templates = workflow_store.list_templates(category)
    return {"templates": [t.model_dump() for t in templates]}


@router.post("/templates", status_code=201)
async def create_template(req: CreateTemplateRequest):
    """Save a workflow as a reusable template."""
    tmpl = WorkflowTemplate(
        template_id=str(uuid.uuid4()),
        name=req.name,
        description=req.description,
        category=req.category,
        tags=req.tags,
        data=req.data,
    )
    return workflow_store.create_template(tmpl)


@router.delete("/templates/{template_id}")
async def delete_template(template_id: str):
    """Delete a workflow template."""
    ok = workflow_store.delete_template(template_id)
    if not ok:
        raise HTTPException(404, "Template not found")
    return {"ok": True}
