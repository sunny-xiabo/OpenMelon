from app.api_execution.router_deps import *

def _safe_export_filename(prefix: str, suffix: str) -> str:
    return f"{prefix}-{_download_timestamp()}.{suffix}"


def _content_disposition(filename: str) -> str:
    return f'attachment; filename="{filename}"'


def _download_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


def export_pytest_script_service(request: ExportScriptRequest) -> Response:
    content = generate_pytest_script(request.script)
    filename = _safe_export_filename("api-test-script", "py")
    return Response(
        content=content,
        media_type="text/x-python; charset=utf-8",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


def export_postman_collection_service(request: ExportScriptRequest) -> Response:
    content = json.dumps(generate_postman_collection(request.script), ensure_ascii=False, indent=2)
    filename = _safe_export_filename("api-postman-collection", "json")
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": _content_disposition(filename)},
    )



__all__ = [name for name in globals() if not name.startswith("__")]
