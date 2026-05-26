from copy import deepcopy
from typing import Any

from app.api_execution.schemas import APITestCaseDsl

SAFE_PATCH_FIELDS = {"assertions", "extractions", "depends_on", "parallel_group"}
SAFE_ROOT_FIELDS = {
    "case_id",
    "name",
    "target_project",
    "environment",
    "base_url",
    "agent_source",
    "agent_test_intent",
    "variables",
    "steps",
}


def normalize_patch_operations(
    patch_operations: list[dict[str, Any]], allowed_fields: set[str] | None = None
) -> list[dict[str, Any]]:
    allowed = allowed_fields or SAFE_PATCH_FIELDS
    normalized: list[dict[str, Any]] = []
    for operation in patch_operations:
        if not isinstance(operation, dict):
            continue
        item = deepcopy(operation)
        item["safe_to_apply"] = bool(item.get("safe_to_apply")) and item.get("field") in allowed
        normalized.append(item)
    return normalized


def review_patch_safety(
    original_script: APITestCaseDsl,
    patched_script: APITestCaseDsl,
    patch_operations: list[dict[str, Any]],
) -> dict[str, Any]:
    original = original_script.model_dump()
    patched = patched_script.model_dump()
    unsafe_changes: list[str] = []

    for root_field in sorted(set(original) | set(patched)):
        if root_field not in SAFE_ROOT_FIELDS:
            if original.get(root_field) != patched.get(root_field):
                unsafe_changes.append(root_field)
            continue
        if root_field != "steps" and original.get(root_field) != patched.get(root_field):
            unsafe_changes.append(root_field)

    original_steps = {str(step.get("id")): step for step in original.get("steps", []) or []}
    patched_steps = {str(step.get("id")): step for step in patched.get("steps", []) or []}

    if list(original_steps) != list(patched_steps):
        unsafe_changes.append("steps.order_or_membership")

    for step_id, original_step in original_steps.items():
        patched_step = patched_steps.get(step_id)
        if not patched_step:
            unsafe_changes.append(f"steps[{step_id}].missing")
            continue
        original_fields = set(original_step)
        patched_fields = set(patched_step)
        if original_fields != patched_fields:
            diff_fields = sorted(original_fields ^ patched_fields)
            unsafe_changes.extend(f"steps[{step_id}].{field}" for field in diff_fields if field not in SAFE_PATCH_FIELDS)
        for field in sorted((original_fields & patched_fields) - SAFE_PATCH_FIELDS):
            if original_step.get(field) != patched_step.get(field):
                unsafe_changes.append(f"steps[{step_id}].{field}")

    for operation in patch_operations:
        field = str(operation.get("field") or "")
        if field and field not in SAFE_PATCH_FIELDS:
            unsafe_changes.append(f"operation.field:{field}")

    deduped = list(dict.fromkeys(unsafe_changes))
    return {
        "unsafe_changes": deduped,
        "is_safe_for_auto_apply": not deduped,
        "blocked_reason": (
            "检测到非白名单字段修改，已禁止自动应用"
            if deduped
            else ""
        ),
    }


__all__ = [name for name in globals() if not name.startswith("__")]
