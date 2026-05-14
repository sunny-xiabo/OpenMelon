from fastapi import APIRouter

from app.config_center import service
from app.config_center.schemas import (
    ConfigInitializeRequest,
    ConfigPreviewResponse,
    ProviderConfigRequest,
    ProviderConfigResponse,
    ProviderListResponse,
    ConfigSaveRequest,
    ConfigSaveResponse,
    ConfigSchemaResponse,
    ConfigValidateResponse,
    ConfigValuesResponse,
)

router = APIRouter(prefix="/config-center", tags=["config-center"])


@router.get("/schema", response_model=ConfigSchemaResponse)
async def get_config_schema():
    return {"status": service.get_status(), "groups": service.build_schema()}


@router.get("/values", response_model=ConfigValuesResponse)
async def get_config_values():
    return {"status": service.get_status(), "values": service.list_values()}


@router.post("/validate", response_model=ConfigValidateResponse)
async def validate_config_values(request: ConfigSaveRequest):
    errors = service.validate_values(request.values)
    warnings = service.validate_warnings(request.values)
    return {"valid": not errors, "errors": errors, "warnings": warnings}


@router.post("/preview", response_model=ConfigPreviewResponse)
async def preview_config_values(request: ConfigSaveRequest):
    return service.build_effective_preview(request.values)


@router.get("/providers", response_model=ProviderListResponse)
async def get_config_providers():
    return {"items": service.list_providers()}


@router.post("/providers", response_model=ProviderConfigResponse)
async def save_config_provider(request: ProviderConfigRequest):
    return {"provider": service.save_provider(request.model_dump())}


@router.delete("/providers/{provider_key}")
async def delete_config_provider(provider_key: str):
    service.remove_provider(provider_key)
    return {"ok": True}


@router.put("/values", response_model=ConfigSaveResponse)
async def save_config_values(request: ConfigSaveRequest):
    return service.save_values(request.values)


@router.post("/initialize", response_model=ConfigSaveResponse)
async def initialize_config(request: ConfigInitializeRequest):
    return service.initialize_env(request.mode, request.values)
