from fastapi import APIRouter, Depends, Request
from fastapi.responses import Response

from app.api.deps import require_production_auth
from app.api.errors import InvalidRequestError, NotFoundError
from app.config_center import service
from app.config_center.service import _has_llm_endpoint_changes, _read_env_values, validate_llm_endpoint
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


@router.post(
    "/validate",
    response_model=ConfigValidateResponse,
    dependencies=[Depends(require_production_auth)],
)
async def validate_config_values(request: ConfigSaveRequest):
    errors = service.validate_values(request.values)
    warnings = service.validate_warnings(request.values)
    return {"valid": not errors, "errors": errors, "warnings": warnings}


@router.post(
    "/preview",
    response_model=ConfigPreviewResponse,
    dependencies=[Depends(require_production_auth)],
)
async def preview_config_values(request: ConfigSaveRequest):
    return service.build_effective_preview(request.values)


@router.get("/providers", response_model=ProviderListResponse)
async def get_config_providers():
    return {"items": service.list_providers()}


@router.post(
    "/providers",
    response_model=ProviderConfigResponse,
    dependencies=[Depends(require_production_auth)],
)
async def save_config_provider(request: ProviderConfigRequest):
    return {"provider": service.save_provider(request.model_dump())}


@router.delete(
    "/providers/{provider_key}",
    dependencies=[Depends(require_production_auth)],
)
async def delete_config_provider(provider_key: str):
    service.remove_provider(provider_key)
    return {"ok": True}


@router.put(
    "/values",
    response_model=ConfigSaveResponse,
    dependencies=[Depends(require_production_auth)],
)
async def save_config_values(request: ConfigSaveRequest):
    result = service.save_values(request.values)
    # Run endpoint reachability check when LLM-related keys changed
    changed_keys = result.get("changed_keys", [])
    if _has_llm_endpoint_changes(changed_keys):
        env_vals = _read_env_values()
        api_base_url = env_vals.get("API_BASE_URL", "")
        api_key = env_vals.get("API_KEY", "")
        result["endpoint_validation"] = await validate_llm_endpoint(api_base_url, api_key)
    return result


@router.post(
    "/initialize",
    response_model=ConfigSaveResponse,
    dependencies=[Depends(require_production_auth)],
)
async def initialize_config(request: ConfigInitializeRequest):
    return service.initialize_env(request.mode, request.values)


@router.get("/export")
async def export_config():
    content = service.export_config()
    return Response(
        content=content,
        media_type="text/plain; charset=utf-8",
        headers={"Content-Disposition": "attachment; filename=openmelon-config.env"},
    )


@router.post("/import", dependencies=[Depends(require_production_auth)])
async def import_config(request: Request):
    body = await request.json()
    content = body.get("content", "")
    if not content.strip():
        raise InvalidRequestError(message="配置内容不能为空")
    try:
        return service.import_config(content)
    except ValueError as e:
        raise InvalidRequestError(message=str(e))


@router.post("/validate-endpoint", dependencies=[Depends(require_production_auth)])
async def validate_endpoint(request: Request):
    """Ping the configured LLM endpoint and return reachability status."""
    body = await request.json()
    api_base_url = body.get("api_base_url", "")
    api_key = body.get("api_key", "")
    return await validate_llm_endpoint(api_base_url, api_key)


@router.get("/backups")
async def list_backups():
    return {"backups": service.list_backups()}


@router.get("/backups/{filename}")
async def read_backup(filename: str):
    try:
        content = service.read_backup(filename)
        return {"filename": filename, "content": content}
    except FileNotFoundError:
        raise NotFoundError(message=f"备份文件不存在: {filename}")
    except ValueError as e:
        raise InvalidRequestError(message=str(e))


@router.post("/backups/{filename}/restore", dependencies=[Depends(require_production_auth)])
async def restore_backup(filename: str):
    try:
        return service.restore_backup(filename)
    except FileNotFoundError:
        raise NotFoundError(message=f"备份文件不存在: {filename}")
    except ValueError as e:
        raise InvalidRequestError(message=str(e))
