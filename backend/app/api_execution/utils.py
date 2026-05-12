from datetime import UTC, datetime
from typing import Any

from app.api_execution.schemas import RunScriptRequest


def now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def execution_options(request: RunScriptRequest, policy_decision: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "project_id": request.project_id,
        "environment_id": request.environment_id,
        "environment_snapshot": request.environment_snapshot,
        "project_policy_snapshot": request.project_policy_snapshot,
        "base_url": request.base_url,
        "timeout_ms": request.timeout_ms,
        "run_timeout_ms": request.run_timeout_ms,
        "max_steps": request.max_steps,
        "step_ids": request.step_ids,
        "continue_on_failure": request.continue_on_failure,
        "has_global_headers": bool(request.global_headers),
        "policy_decision": policy_decision or {},
        "flow_template_id": request.flow_template_id or "",
        "flow_template_name": request.flow_template_name or "",
        "flow_template_tags": request.flow_template_tags or [],
    }
