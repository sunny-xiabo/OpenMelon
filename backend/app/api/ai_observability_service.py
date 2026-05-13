import uuid
import re
from typing import Any
from datetime import UTC, datetime, timedelta

from app.api_execution.storage import api_execution_store
from app.api_execution.utils import now_iso

_SECRET_PATTERNS = [
    re.compile(r"(?i)(authorization\s*[:=]\s*)(bearer\s+)?[A-Za-z0-9._~+/=-]{12,}"),
    re.compile(r"(?i)(api[_-]?key\s*[:=]\s*)[A-Za-z0-9._~+/=-]{8,}"),
    re.compile(r"(?i)(secret\s*[:=]\s*)[A-Za-z0-9._~+/=-]{8,}"),
    re.compile(r"(?i)(token\s*[:=]\s*)[A-Za-z0-9._~+/=-]{8,}"),
    re.compile(r"(?i)(password\s*[:=]\s*)[^,\s}]+"),
    re.compile(r"(?i)(cookie\s*[:=]\s*)[^\\n\\r]+"),
    re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}"),
    re.compile(r"1[3-9]\d{9}"),
]


def _safe_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _safe_bool(value: Any) -> bool:
    return bool(value)


def _safe_text(value: Any, limit: int = 500) -> str:
    text = str(value or "").strip()
    return text[:limit]


def _redact_text(value: Any, limit: int = 4000) -> str:
    text = str(value or "")
    for pattern in _SECRET_PATTERNS:
        text = pattern.sub(lambda match: f"{match.group(1) if match.groups() else ''}[REDACTED]", text)
    return text[:limit]


def _expires_at(minutes: int) -> str:
    safe_minutes = max(5, min(int(minutes or 30), 24 * 60))
    return (datetime.now(UTC) + timedelta(minutes=safe_minutes)).isoformat().replace("+00:00", "Z")


def _extract_usage(response: Any) -> dict[str, int]:
    usage = getattr(response, "usage", None)
    if not usage:
        return {"input_tokens": 0, "output_tokens": 0, "total_tokens": 0}
    return {
        "input_tokens": _safe_int(getattr(usage, "prompt_tokens", 0)),
        "output_tokens": _safe_int(getattr(usage, "completion_tokens", 0)),
        "total_tokens": _safe_int(getattr(usage, "total_tokens", 0)),
    }


def build_usage_from_response(response: Any) -> dict[str, int]:
    return _extract_usage(response)


def record_ai_call(
    *,
    feature: str,
    operation: str,
    provider: str = "",
    model: str = "",
    status: str = "success",
    latency_ms: int = 0,
    prompt_chars: int = 0,
    response_chars: int = 0,
    input_tokens: int = 0,
    output_tokens: int = 0,
    total_tokens: int = 0,
    degraded: bool = False,
    failure_reason: str = "",
    trace_id: str = "",
    source_id: str = "",
    debug_snapshot: dict[str, Any] | None = None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    safe_status = status if status in {"success", "failed", "degraded"} else "success"
    settings = api_execution_store.get_ai_debug_settings()
    safe_data = dict(data or {})
    if settings.get("enabled") and debug_snapshot:
        safe_data["debug_snapshot"] = {
            "enabled": True,
            "created_at": now_iso(),
            "expires_at": _expires_at(settings.get("retention_minutes", 30)),
            "redacted": True,
            "system": _redact_text(debug_snapshot.get("system", ""), settings.get("max_chars", 4000)),
            "user": _redact_text(debug_snapshot.get("user", ""), settings.get("max_chars", 4000)),
            "context": _redact_text(debug_snapshot.get("context", ""), settings.get("max_chars", 4000)),
            "response": _redact_text(debug_snapshot.get("response", ""), settings.get("max_chars", 4000)),
        }
    record = {
        "call_id": f"ai_{uuid.uuid4().hex}",
        "created_at": now_iso(),
        "feature": _safe_text(feature, 80),
        "operation": _safe_text(operation, 100),
        "provider": _safe_text(provider, 80),
        "model": _safe_text(model, 120),
        "status": safe_status,
        "latency_ms": _safe_int(latency_ms),
        "prompt_chars": _safe_int(prompt_chars),
        "response_chars": _safe_int(response_chars),
        "input_tokens": _safe_int(input_tokens),
        "output_tokens": _safe_int(output_tokens),
        "total_tokens": _safe_int(total_tokens),
        "degraded": _safe_bool(degraded),
        "failure_reason": _safe_text(failure_reason, 500),
        "trace_id": _safe_text(trace_id or source_id, 160),
        "source_id": _safe_text(source_id or trace_id, 160),
        "data": safe_data,
    }
    return api_execution_store.save_ai_call_log(record)


def safe_record_ai_call(**kwargs: Any) -> dict[str, Any] | None:
    try:
        return record_ai_call(**kwargs)
    except Exception:
        return None


def get_ai_debug_settings() -> dict[str, Any]:
    return api_execution_store.get_ai_debug_settings()


def update_ai_debug_settings(settings: dict[str, Any]) -> dict[str, Any]:
    return api_execution_store.save_ai_debug_settings({
        "enabled": bool(settings.get("enabled")),
        "retention_minutes": max(5, min(int(settings.get("retention_minutes") or 30), 24 * 60)),
        "max_chars": max(500, min(int(settings.get("max_chars") or 4000), 12000)),
        "updated_at": now_iso(),
    })


def get_debug_snapshot(call_id: str) -> dict[str, Any] | None:
    record = api_execution_store.get_ai_call_log(call_id)
    snapshot = ((record or {}).get("data") or {}).get("debug_snapshot")
    if not snapshot:
        return None
    expires_at = snapshot.get("expires_at") or ""
    if expires_at and expires_at < now_iso():
        return None
    return {
        "call_id": call_id,
        **snapshot,
    }
