from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()


@router.post("/export/pytest")
async def export_pytest_script(request: ExportScriptRequest):
    return export_pytest_script_service(request)


@router.post("/export/postman")
async def export_postman_collection(request: ExportScriptRequest):
    return export_postman_collection_service(request)


__all__ = [name for name in globals() if not name.startswith("__")]
