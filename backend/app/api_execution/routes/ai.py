from fastapi import APIRouter, Depends

from app.api.deps import require_production_auth
from app.api_execution.router_support import *

router = APIRouter()


@router.post(
    "/ai/dsl/enhance",
    response_model=AIPatchResponse,
    dependencies=[Depends(require_production_auth)],
)
async def enhance_dsl_endpoint(request: AIDslEnhanceRequest):
    return await enhance_dsl_service(request)


@router.post(
    "/ai/flow-draft",
    response_model=AIFlowDraftResponse,
    dependencies=[Depends(require_production_auth)],
)
async def flow_draft_endpoint(request: AIFlowDraftRequest):
    return build_flow_draft_service(request)


@router.post(
    "/ai/repair-patch",
    response_model=AIPatchResponse,
    dependencies=[Depends(require_production_auth)],
)
async def repair_patch_endpoint(api_request: Request, request: AIRepairPatchRequest):
    return await build_repair_patch_service(api_request, request)


__all__ = [name for name in globals() if not name.startswith("__")]
