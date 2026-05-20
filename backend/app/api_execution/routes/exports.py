from fastapi import APIRouter, Depends

from app.api.deps import require_production_auth
from app.api_execution.router_support import (
    ExportScriptRequest,
    export_pytest_script_service, export_postman_collection_service,
)

router = APIRouter()


@router.post("/export/pytest", dependencies=[Depends(require_production_auth)])
async def export_pytest_script(request: ExportScriptRequest):
    return export_pytest_script_service(request)


@router.post("/export/postman", dependencies=[Depends(require_production_auth)])
async def export_postman_collection(request: ExportScriptRequest):
    return export_postman_collection_service(request)


__all__ = [name for name in globals() if not name.startswith("__")]
