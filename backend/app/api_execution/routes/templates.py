from fastapi import APIRouter, Query
from typing import Annotated

from app.api_execution.router_support import *
from app.governance_center import services as governance_services

router = APIRouter()


@router.get("/flow-templates", response_model=APIFlowTemplateListResponse)
async def list_flow_templates(
    project_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return governance_services.list_templates(project_id=project_id, limit=limit, offset=offset)


@router.post("/flow-templates", response_model=APIFlowTemplate)
async def upsert_flow_template(request: APIFlowTemplateUpsertRequest):
    return governance_services.upsert_template(request)


@router.delete("/flow-templates/{template_id}")
async def delete_flow_template(template_id: str):
    return governance_services.delete_template(template_id)


__all__ = [name for name in globals() if not name.startswith("__")]
