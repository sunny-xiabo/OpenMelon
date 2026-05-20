from fastapi import APIRouter, Depends

from app.api.deps import require_production_auth
from app.api_execution.router_support import (
    APIAgentContextResponse, APIAgentTestPlanResponse, APIAgentTestPlanRequest,
    get_agent_context_service, build_agent_test_plan_service,
)

router = APIRouter()


@router.get("/projects/{project_id}/agent/context", response_model=APIAgentContextResponse)
async def get_agent_context(project_id: str):
    return get_agent_context_service(project_id)


@router.post(
    "/projects/{project_id}/agent/test-plan",
    response_model=APIAgentTestPlanResponse,
    dependencies=[Depends(require_production_auth)],
)
async def build_agent_test_plan(project_id: str, request: APIAgentTestPlanRequest):
    return build_agent_test_plan_service(project_id, request)


__all__ = [name for name in globals() if not name.startswith("__")]
