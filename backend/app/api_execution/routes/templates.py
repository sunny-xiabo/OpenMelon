from fastapi import APIRouter, Depends, Query
from typing import Annotated

from app.api.deps import require_production_auth
from app.api_execution.router_support import (
    APIFlowTemplateListResponse, APIFlowTemplate, APIFlowTemplateUpsertRequest,
    list_flow_templates_service, upsert_flow_template_service, delete_flow_template_service,
)

router = APIRouter()


@router.get("/flow-templates", response_model=APIFlowTemplateListResponse)
async def list_flow_templates(
    project_id: str | None = None,
    limit: Annotated[int, Query(ge=1, le=200)] = 100,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return list_flow_templates_service(project_id=project_id, limit=limit, offset=offset)


@router.post(
    "/flow-templates",
    response_model=APIFlowTemplate,
    dependencies=[Depends(require_production_auth)],
)
async def upsert_flow_template(request: APIFlowTemplateUpsertRequest):
    return upsert_flow_template_service(request)


@router.delete(
    "/flow-templates/{template_id}",
    dependencies=[Depends(require_production_auth)],
)
async def delete_flow_template(template_id: str):
    return delete_flow_template_service(template_id)


__all__ = [name for name in globals() if not name.startswith("__")]
