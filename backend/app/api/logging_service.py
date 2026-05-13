import uuid
import re
from typing import Any

from app.api_execution.storage import api_execution_store
from app.api_execution.utils import now_iso

AUDIT_EVENT_SCHEMA_VERSION = "2026-05-13.1"

AUDIT_MODULES = {
    "api_execution",
    "policy",
    "task_center",
    "knowledge",
    "rag_query",
    "ingestion",
    "management",
    "graph",
    "prompt_hub",
    "testcase_generation",
    "webhook",
    "ai_assistant",
    "system",
}

AUDIT_EVENT_TYPES = {
    "api_execution": {"run_queued", "run_running", "run_passed", "run_failed", "run_cancelled", "run_unknown"},
    "policy": {"execute", "scheduled_run", "auto_repair_rerun", "auto_repair_blocked", "policy_audit"},
    "task_center": {"task_created", "task_resolved", "knowledge_candidate_created", "knowledge_candidate_approved", "knowledge_write_failed"},
    "knowledge": {"knowledge_active", "knowledge_invalid", "knowledge_revoked", "knowledge_deleted"},
    "rag_query": {"rag_query_completed", "rag_query_failed"},
    "system": {"system_event"},
}

AUDIT_EVENT_TYPE_PREFIXES = {
    "ingestion": ("document_", "directory_", "async_upload_"),
    "management": ("managed_file_",),
    "graph": ("graph_",),
    "prompt_hub": ("prompt_hub_",),
    "testcase_generation": ("testcase_",),
    "webhook": ("webhook_",),
    "ai_assistant": ("ai_",),
}

_EVENT_TYPE_RE = re.compile(r"^[a-z][a-z0-9_]*$")


def compact_refs(values: list[Any] | None = None) -> list[str]:
    return list(dict.fromkeys(str(value).strip() for value in (values or []) if str(value or "").strip()))


def normalize_audit_module(module: str) -> tuple[str, str]:
    original = str(module or "").strip()
    normalized = original if original in AUDIT_MODULES else "system"
    return normalized, original


def normalize_audit_event_type(module: str, event_type: str) -> tuple[str, str]:
    original = str(event_type or "").strip()
    if not original or not _EVENT_TYPE_RE.match(original):
        return f"{module}_event", original
    if original in AUDIT_EVENT_TYPES.get(module, set()):
        return original, original
    if any(original.startswith(prefix) for prefix in AUDIT_EVENT_TYPE_PREFIXES.get(module, ())):
        return original, original
    return f"{module}_event", original


def log_event(
    level: str,
    module: str,
    event_type: str,
    title: str,
    message: str = "",
    *,
    project_id: str = "",
    trace_id: str = "",
    source_id: str = "",
    refs: list[Any] | None = None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any]:
    event_id = f"evt_{uuid.uuid4().hex}"
    safe_level = level if level in {"info", "warning", "error"} else "info"
    safe_module, original_module = normalize_audit_module(module)
    safe_event_type, original_event_type = normalize_audit_event_type(safe_module, event_type)
    safe_trace_id = str(trace_id or source_id or project_id or f"trace_{uuid.uuid4().hex}").strip()
    safe_source_id = str(source_id or trace_id or safe_trace_id).strip()
    event_data = dict(data or {})
    event_data["audit"] = {
        **(event_data.get("audit") if isinstance(event_data.get("audit"), dict) else {}),
        "schema_version": AUDIT_EVENT_SCHEMA_VERSION,
        "module": safe_module,
        "event_type": safe_event_type,
    }
    if original_module and original_module != safe_module:
        event_data["audit"]["original_module"] = original_module
    if original_event_type and original_event_type != safe_event_type:
        event_data["audit"]["original_event_type"] = original_event_type
    event = {
        "event_id": event_id,
        "created_at": now_iso(),
        "level": safe_level,
        "module": safe_module,
        "event_type": safe_event_type,
        "project_id": project_id or "",
        "trace_id": safe_trace_id,
        "source_id": safe_source_id,
        "title": title,
        "message": message,
        "refs": compact_refs([safe_trace_id, safe_source_id, project_id, *(refs or [])]),
        "data": event_data,
    }
    return api_execution_store.save_event_log(event)


def safe_log_event(
    level: str,
    module: str,
    event_type: str,
    title: str,
    message: str = "",
    *,
    project_id: str = "",
    trace_id: str = "",
    source_id: str = "",
    refs: list[Any] | None = None,
    data: dict[str, Any] | None = None,
) -> dict[str, Any] | None:
    try:
        return log_event(
            level,
            module,
            event_type,
            title,
            message,
            project_id=project_id,
            trace_id=trace_id,
            source_id=source_id,
            refs=refs,
            data=data,
        )
    except Exception:
        return None
