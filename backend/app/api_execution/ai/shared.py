from app.api_execution.ai.common import *


def _has_assertion(assertions: list[dict[str, Any]], assertion_type: str) -> bool:
    return any(assertion.get("type") == assertion_type for assertion in assertions or [])


def _looks_like_login(step: dict[str, Any]) -> bool:
    haystack = " ".join(str(step.get(key, "")) for key in ("name", "path", "operation_id")).lower()
    return any(token in haystack for token in ("login", "token", "auth", "signin"))


def _operation(
    step: dict[str, Any],
    field: str,
    before: Any,
    after: Any,
    reason: str,
    safe_to_apply: bool,
) -> dict[str, Any]:
    return {
        "step_id": step.get("id", ""),
        "field": field,
        "before": before,
        "after": after,
        "reason": reason,
        "safe_to_apply": safe_to_apply,
    }


__all__ = [name for name in globals() if not name.startswith("__")]
