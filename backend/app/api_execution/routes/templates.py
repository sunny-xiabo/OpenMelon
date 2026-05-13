from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()


@router.get("/flow-templates", response_model=APIFlowTemplateListResponse)
async def list_flow_templates(project_id: str | None = None, limit: int = 100):
    return list_flow_templates_service(project_id=project_id, limit=limit)


@router.post("/flow-templates", response_model=APIFlowTemplate)
async def upsert_flow_template(request: APIFlowTemplateUpsertRequest):
    return upsert_flow_template_service(request)


@router.delete("/flow-templates/{template_id}")
async def delete_flow_template(template_id: str):
    return delete_flow_template_service(template_id)


__all__ = [name for name in globals() if not name.startswith("__")]
