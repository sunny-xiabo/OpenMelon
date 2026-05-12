from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()

@router.get("/flow-templates", response_model=APIFlowTemplateListResponse)
async def list_flow_templates(project_id: str | None = None, limit: int = 100):
    safe_limit = max(1, min(limit, 200))
    definitions = api_execution_store.list_automation_definitions(
        limit=safe_limit,
        project_id=project_id,
        definition_type=FLOW_TEMPLATE_DEFINITION_TYPE,
    )
    return {"templates": [_flow_template_from_definition(item) for item in definitions]}


@router.post("/flow-templates", response_model=APIFlowTemplate)
async def upsert_flow_template(request: APIFlowTemplateUpsertRequest):
    now = _now_iso()
    template_id = request.template_id or str(uuid.uuid4())
    definition_id = f"flow-template:{template_id}"
    existing = api_execution_store.get_automation_definition(definition_id) or {}
    tags = [tag.strip() for tag in request.tags if tag.strip()]
    name = request.name.strip() or request.script.name or "API 流程模板"
    script = {
        **request.script.model_dump(),
        "flow_template_id": template_id,
        "flow_template_name": name,
        "flow_template_tags": tags,
    }
    definition = {
        **existing,
        "definition_id": definition_id,
        "definition_type": FLOW_TEMPLATE_DEFINITION_TYPE,
        "automation_type": "api",
        "template_id": template_id,
        "project_id": request.project_id.strip(),
        "name": name,
        "description": request.description.strip(),
        "tags": tags,
        "script": script,
        "status": "active",
        "source_id": request.script.case_id,
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    saved = api_execution_store.save_automation_definition(definition)
    return _flow_template_from_definition(saved)


@router.delete("/flow-templates/{template_id}")
async def delete_flow_template(template_id: str):
    definition_id = template_id if template_id.startswith("flow-template:") else f"flow-template:{template_id}"
    existing = api_execution_store.get_automation_definition(definition_id)
    if not existing or existing.get("definition_type") != FLOW_TEMPLATE_DEFINITION_TYPE:
        raise NotFoundError(message=str("流程模板不存在"))
    if not api_execution_store.delete_automation_definition(definition_id):
        raise NotFoundError(message=str("流程模板不存在"))
    return {"deleted": True}




__all__ = [name for name in globals() if not name.startswith("__")]
