from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()

@router.post("/knowledge/ingest-runs", response_model=KnowledgeIngestResponse)
async def ingest_runs_to_knowledge(request: Request, limit: int = 20):
    safe_limit = max(1, min(limit, 100))
    ingested_at = _now_iso()
    graph_ops = getattr(request.app.state, "graph_ops", None)
    vector_ops = getattr(request.app.state, "vector_ops", None)
    llm_client = getattr(request.app.state, "llm_client", None)
    response = {
        "ingested_at": ingested_at,
        "run_count": 0,
        "knowledge_count": 0,
        "graph_written": 0,
        "vector_written": 0,
        "graph_available": graph_ops is not None,
        "vector_available": vector_ops is not None and llm_client is not None,
        "errors": [],
    }
    for run in api_execution_store.list_runs(limit=safe_limit):
        single = await _ingest_single_run_to_knowledge(request, run)
        response["run_count"] += single.get("run_count", 0)
        response["knowledge_count"] += single.get("knowledge_count", 0)
        response["graph_written"] += single.get("graph_written", 0)
        response["vector_written"] += single.get("vector_written", 0)
        response["errors"].extend(single.get("errors", []))
    return response


@router.get("/knowledge/search-repairs", response_model=KnowledgeSearchResponse)
async def search_repair_knowledge(request: Request, query: str, project_id: str = "", limit: int = 5):
    safe_limit = max(1, min(limit, 20))
    items = await _search_historical_repair_context(request, query, project_id=project_id, top_k=safe_limit)
    return {"query": query, "items": items}


@router.post("/knowledge/candidates/{task_id}/approve", response_model=KnowledgeCandidateApproveResponse)
async def approve_knowledge_candidate(request: Request, task_id: str):
    task = api_execution_store.get_automation_task(task_id)
    if not task:
        raise NotFoundError(message=str("待沉淀候选不存在"))
    if task.get("task_type") != "knowledge_ingest_candidate":
        raise InvalidRequestError(message=str("该待处理项不是知识沉淀候选"))
    run_id = task.get("run_id")
    run = api_execution_store.get_run(run_id) if run_id else None
    if not run:
        raise NotFoundError(message=str("候选关联的执行记录不存在"))

    response = await _ingest_single_run_to_knowledge(request, run)
    now = _now_iso()
    resolved_task = api_execution_store.update_automation_task(
        task_id,
        {
            "status": "resolved",
            "updated_at": now,
            "resolved_at": now,
            "resolution_note": "已确认沉淀到知识库",
            "summary": {
                **(task.get("summary") or {}),
                "knowledge_count": response.get("knowledge_count", 0),
                "vector_written": response.get("vector_written", 0),
                "graph_written": response.get("graph_written", 0),
            },
        },
    )
    if resolved_task:
        _log_task_event(resolved_task, "knowledge_candidate_approved")
    return {"task_id": task_id, "run_id": run_id, **response}


@router.get("/knowledge/review", response_model=KnowledgeReviewResponse)
async def list_knowledge_review_items(
    limit: int = 50,
    project_id: str | None = None,
    status: str | None = None,
    item_type: str | None = None,
):
    safe_limit = max(1, min(limit, 200))
    items = api_execution_store.list_knowledge_items(limit=200, item_type=item_type)
    if project_id:
        safe_project_id = project_id.strip()
        items = [item for item in items if item.get("project_id", "") in {"", safe_project_id}]
    if status:
        safe_status = status.strip()
        items = [item for item in items if _knowledge_status(item) == safe_status]
    normalized = [_normalize_knowledge_item(item) for item in items[:safe_limit]]
    return {"items": normalized}


@router.patch("/knowledge/items/{knowledge_id}/status", response_model=KnowledgeItem)
async def update_knowledge_item_status(knowledge_id: str, request: KnowledgeStatusUpdateRequest):
    safe_status = request.status.strip()
    if safe_status not in {"active", "invalid", "revoked"}:
        raise InvalidRequestError(message=str("知识状态只支持 active、invalid、revoked"))
    item = _get_knowledge_item(knowledge_id)
    if not item:
        raise NotFoundError(message=str("知识项不存在"))
    now = _now_iso()
    patch = {
        **item,
        "status": safe_status,
        "governance_note": request.note.strip(),
        "updated_at": now,
    }
    if safe_status == "invalid":
        patch["invalidated_at"] = now
        patch["revoked_at"] = None
    elif safe_status == "revoked":
        patch["revoked_at"] = now
        patch["invalidated_at"] = None
    else:
        patch["invalidated_at"] = None
        patch["revoked_at"] = None
    saved = api_execution_store.save_knowledge_item(patch)
    _invalidate_knowledge_index()
    log_event(
        "warning" if safe_status != "active" else "info",
        "knowledge",
        f"knowledge_{safe_status}",
        "知识状态已更新",
        request.note.strip() or f"知识项状态更新为 {safe_status}",
        project_id=saved.get("project_id", ""),
        trace_id=saved.get("source_run_id") or knowledge_id,
        source_id=knowledge_id,
        refs=[saved.get("source_run_id")],
        data=saved,
    )
    return _normalize_knowledge_item(saved)


@router.post("/knowledge/runs/{run_id}/candidate", response_model=KnowledgeCandidateCreateResponse)
async def create_run_knowledge_candidate(run_id: str):
    run = api_execution_store.get_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))
    task = _save_knowledge_ingest_candidate(run, trigger_source="manual_repair_deposit")
    if not task:
        raise InvalidRequestError(message=str("该执行记录暂不能生成知识沉淀候选"))
    summary = task.get("summary") or {}
    return {
        "task_id": task.get("task_id", ""),
        "run_id": run_id,
        "status": task.get("status", "pending"),
        "risk_level": task.get("risk_level", "medium"),
        "reason": task.get("reason", ""),
        "candidate_item_count": summary.get("candidate_item_count", 0),
        "has_repair_history": summary.get("has_repair_history", False),
        "already_resolved": task.get("status") == "resolved",
    }




__all__ = [name for name in globals() if not name.startswith("__")]
