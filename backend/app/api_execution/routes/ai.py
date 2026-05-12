from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()

@router.post("/ai/dsl/enhance", response_model=AIPatchResponse)
async def enhance_dsl_endpoint(request: AIDslEnhanceRequest):
    return await enhance_dsl_with_configured_ai(request.script, request.project_policy_snapshot)


@router.post("/ai/flow-draft", response_model=AIFlowDraftResponse)
async def flow_draft_endpoint(request: AIFlowDraftRequest):
    spec = api_execution_store.get_spec(request.spec_id)
    if not spec:
        raise NotFoundError(message=str("OpenAPI 资产不存在"))
    project_id = str(request.project_policy_snapshot.get("project_id") or "").strip()
    flow_templates = [
        _flow_template_from_definition(item)
        for item in api_execution_store.list_automation_definitions(
            limit=50,
            project_id=project_id or None,
            definition_type=FLOW_TEMPLATE_DEFINITION_TYPE,
        )
    ]
    template_performance = _flow_template_performance(project_id or None)
    flow_templates = [
        {
            **template,
            "performance": template_performance.get(template.get("template_id", ""), {}),
        }
        for template in flow_templates
    ]
    try:
        return build_flow_draft(
            spec,
            request.business_goal,
            request.operation_ids,
            project_name=request.project_name,
            environment_name=request.environment_name,
            base_url=request.base_url,
            flow_templates=flow_templates,
        )
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.post("/ai/repair-patch", response_model=AIPatchResponse)
async def repair_patch_endpoint(api_request: Request, request: AIRepairPatchRequest):
    historical_context = await _search_historical_repair_context(
        api_request,
        _repair_context_query(request.script, request.report),
        project_id=request.project_policy_snapshot.get("project_id", ""),
        top_k=3,
    )
    policy_snapshot = {
        **request.project_policy_snapshot,
        "historical_repair_context": historical_context,
    }
    return await build_repair_patch_with_configured_ai(request.script, request.report, policy_snapshot)



__all__ = [name for name in globals() if not name.startswith("__")]
