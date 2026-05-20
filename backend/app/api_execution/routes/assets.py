from typing import Annotated

from fastapi import APIRouter, Depends, Query

from app.api.deps import require_production_auth
from app.api_execution.router_support import (
    APIProjectAssetsResponse, APIAssetSyncResponse, APIAssetTestPlanResponse, APIAssetTestPlanRequest,
    APIAssetImpactResponse, APIAssetModule, APIAssetModuleCreateRequest, APIAssetModuleUpdateRequest,
    APIAssetModuleRemoveRequest, APIAssetModuleMergeRequest, APIAssetInterface,
    APIAssetInterfaceCreateRequest, APIAssetInterfaceUpdateRequest, APIInterfaceListResponse,
    get_project_assets_service, preview_project_assets_service, sync_project_assets_service,
    build_asset_test_plan_service, get_project_asset_impact_service,
    list_project_modules_service, create_project_module_service, update_project_module_service,
    remove_project_module_service, merge_project_module_service, delete_project_module_service,
    list_project_interfaces_service, create_project_interface_service,
    update_project_interface_service, delete_project_interface_service,
)

router = APIRouter()


@router.get("/projects/{project_id}/assets", response_model=APIProjectAssetsResponse)
async def get_project_assets(project_id: str):
    return get_project_assets_service(project_id)


@router.get("/projects/{project_id}/assets/preview", response_model=APIAssetSyncResponse)
async def preview_project_assets(project_id: str, spec_id: str | None = None):
    return preview_project_assets_service(project_id, spec_id=spec_id)


@router.post(
    "/projects/{project_id}/assets/sync",
    response_model=APIAssetSyncResponse,
    dependencies=[Depends(require_production_auth)],
)
async def sync_project_assets(project_id: str, spec_id: str | None = None):
    return sync_project_assets_service(project_id, spec_id=spec_id)


@router.post(
    "/projects/{project_id}/assets/test-plan",
    response_model=APIAssetTestPlanResponse,
    dependencies=[Depends(require_production_auth)],
)
async def build_asset_test_plan(project_id: str, request: APIAssetTestPlanRequest):
    return build_asset_test_plan_service(project_id, request)


@router.get("/projects/{project_id}/assets/impact", response_model=APIAssetImpactResponse)
async def get_project_asset_impact(project_id: str, spec_id: str | None = None):
    return get_project_asset_impact_service(project_id, spec_id=spec_id)


@router.get("/projects/{project_id}/modules")
async def list_project_modules(project_id: str):
    return list_project_modules_service(project_id)


@router.post(
    "/projects/{project_id}/modules",
    response_model=APIAssetModule,
    dependencies=[Depends(require_production_auth)],
)
async def create_project_module(project_id: str, request: APIAssetModuleCreateRequest):
    return create_project_module_service(project_id, request)


@router.patch(
    "/modules/{module_id}",
    response_model=APIAssetModule,
    dependencies=[Depends(require_production_auth)],
)
async def update_project_module(module_id: str, request: APIAssetModuleUpdateRequest):
    return update_project_module_service(module_id, request)


@router.post(
    "/modules/{module_id}/remove",
    response_model=APIAssetModule,
    dependencies=[Depends(require_production_auth)],
)
async def remove_project_module(module_id: str, request: APIAssetModuleRemoveRequest):
    return remove_project_module_service(module_id, request)


@router.post(
    "/modules/{module_id}/merge",
    response_model=APIAssetModule,
    dependencies=[Depends(require_production_auth)],
)
async def merge_project_module(module_id: str, request: APIAssetModuleMergeRequest):
    return merge_project_module_service(module_id, request)


@router.delete("/modules/{module_id}", dependencies=[Depends(require_production_auth)])
async def delete_project_module(module_id: str):
    return delete_project_module_service(module_id)


@router.get("/projects/{project_id}/interfaces", response_model=APIInterfaceListResponse)
async def list_project_interfaces(
    project_id: str,
    module_id: str | None = None,
    status: str | None = None,
    risk_level: str | None = None,
    keyword: str | None = None,
    limit: Annotated[int, Query(ge=1, le=1000)] = 500,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return list_project_interfaces_service(
        project_id,
        module_id=module_id,
        status=status,
        risk_level=risk_level,
        keyword=keyword,
        limit=limit,
        offset=offset,
    )


@router.post(
    "/projects/{project_id}/interfaces",
    response_model=APIAssetInterface,
    dependencies=[Depends(require_production_auth)],
)
async def create_project_interface(project_id: str, request: APIAssetInterfaceCreateRequest):
    return create_project_interface_service(project_id, request)


@router.patch(
    "/interfaces/{interface_id}",
    response_model=APIAssetInterface,
    dependencies=[Depends(require_production_auth)],
)
async def update_project_interface(interface_id: str, request: APIAssetInterfaceUpdateRequest):
    return update_project_interface_service(interface_id, request)


@router.delete("/interfaces/{interface_id}", dependencies=[Depends(require_production_auth)])
async def delete_project_interface(interface_id: str):
    return delete_project_interface_service(interface_id)


__all__ = [name for name in globals() if not name.startswith("__")]
