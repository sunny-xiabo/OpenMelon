from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()


@router.post("/knowledge/ingest-runs", response_model=KnowledgeIngestResponse)
async def ingest_runs_to_knowledge(request: Request, limit: int = 20):
    return await ingest_runs_to_knowledge_service(request, limit=limit)


@router.get("/knowledge/search-repairs", response_model=KnowledgeSearchResponse)
async def search_repair_knowledge(request: Request, query: str, project_id: str = "", limit: int = 5):
    return await search_repair_knowledge_service(request, query, project_id=project_id, limit=limit)


@router.post("/knowledge/candidates/{task_id}/approve", response_model=KnowledgeCandidateApproveResponse)
async def approve_knowledge_candidate(request: Request, task_id: str):
    return await approve_knowledge_candidate_service(request, task_id)


@router.get("/knowledge/review", response_model=KnowledgeReviewResponse)
async def list_knowledge_review_items(
    limit: int = 50,
    project_id: str | None = None,
    status: str | None = None,
    item_type: str | None = None,
):
    return list_knowledge_review_items_service(
        limit=limit,
        project_id=project_id,
        status=status,
        item_type=item_type,
    )


@router.patch("/knowledge/items/{knowledge_id}/status", response_model=KnowledgeItem)
async def update_knowledge_item_status(knowledge_id: str, request: KnowledgeStatusUpdateRequest):
    return update_knowledge_item_status_service(knowledge_id, request)


@router.post("/knowledge/runs/{run_id}/candidate", response_model=KnowledgeCandidateCreateResponse)
async def create_run_knowledge_candidate(run_id: str):
    return create_run_knowledge_candidate_service(run_id)


__all__ = [name for name in globals() if not name.startswith("__")]
