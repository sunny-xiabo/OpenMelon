from app.api_execution.router_deps import *

def _safe_export_filename(prefix: str, suffix: str) -> str:
    return f"{prefix}-{_download_timestamp()}.{suffix}"


def _content_disposition(filename: str) -> str:
    return f'attachment; filename="{filename}"'


def _download_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")



__all__ = [name for name in globals() if not name.startswith("__")]
