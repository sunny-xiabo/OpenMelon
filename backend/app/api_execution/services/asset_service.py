"""Project API asset catalog services.

This module serves as a facade that re-exports from focused submodules
for backward compatibility. Import from this module as before.
"""

from __future__ import annotations

from .asset_utils import (
    AUTH_TOKENS,
    CREATE_TOKENS,
    DEFAULT_MODULE_NAME,
    EXECUTABLE_INTERFACE_STATUSES,
    NEGATIVE_STATUS_CODES,
    RESOURCE_STOPWORDS,
    VALID_INTERFACE_RISKS,
    VALID_INTERFACE_STATUSES,
    _auth_injection,
    _auth_secret,
    _infer_module_name,
    _interface_risk,
    _interface_text,
    _interface_to_operation,
    _json_hash,
    _looks_like_auth_interface,
    _looks_like_create_interface,
    _matches_interface_pattern,
    _module_name_from_path,
    _normalize_module_key,
    _orchestration_sort_key,
    _patterns,
    _resource_name_from_path,
    _risk_level,
    _singular_resource,
    _source_type,
    _stable_id,
    _tokenize_text,
    _with_module_counts,
    _with_planned_module_counts,
)

from .asset_plan_service import (
    _active_interface_counts,
    _apply_project_setup_and_auth,
    _asset_impact_response,
    _build_negative_dsl,
    _build_project_asset_plan,
    _discover_dependencies_and_recommendations,
    _failure_summary,
    _invalid_value_for_schema,
    _is_negative_test_intent,
    _json_request_schema,
    _negative_assertions,
    _negative_body_cases,
    _negative_parameter_cases,
    _negative_step,
    _normalize_setup_step,
    _project_and_spec,
    _project_dsl_steps,
    build_asset_test_plan_service,
    ensure_project_assets,
    get_project_asset_impact_service,
    preview_project_assets_service,
    preview_project_spec_assets,
    sync_project_assets_service,
    sync_project_spec_assets,
)

from .asset_module_service import (
    create_project_module_service,
    delete_project_module_service,
    list_project_modules_service,
    merge_project_module_service,
    remove_project_module_service,
    update_project_module_service,
)

from .asset_interface_service import (
    create_project_interface_service,
    delete_project_interface_service,
    get_project_assets_service,
    list_project_interfaces_service,
    update_interface_test_results,
    update_project_interface_service,
)

from app.api_execution.utils import now_iso as _now_iso


def __getattr__(name: str):
    if name == "api_execution_store":
        from app.api_execution.storage import api_execution_store
        return api_execution_store
    raise AttributeError(f"module {__name__!r} has no attribute {name!r}")


__all__ = [name for name in globals() if not name.startswith("__")]
__all__.append("api_execution_store")
