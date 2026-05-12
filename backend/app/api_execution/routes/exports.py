from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()

@router.post("/export/pytest")
async def export_pytest_script(request: ExportScriptRequest):
    content = generate_pytest_script(request.script)
    filename = _safe_export_filename("api-test-script", "py")
    return Response(
        content=content,
        media_type="text/x-python; charset=utf-8",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


@router.post("/export/postman")
async def export_postman_collection(request: ExportScriptRequest):
    content = json.dumps(generate_postman_collection(request.script), ensure_ascii=False, indent=2)
    filename = _safe_export_filename("api-postman-collection", "json")
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": _content_disposition(filename)},
    )




__all__ = [name for name in globals() if not name.startswith("__")]
