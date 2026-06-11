"""Interface CRUD operations for API asset catalog."""

from __future__ import annotations

import uuid
from typing import Any

from app.api.errors import InvalidRequestError, NotFoundError
from app.api_execution.schemas import (
    APIAssetInterfaceCreateRequest,
    APIAssetInterfaceUpdateRequest,
)
from app.api_execution.utils import now_iso as _now_iso

from .asset_utils import (
    VALID_INTERFACE_RISKS,
    VALID_INTERFACE_STATUSES,
    _json_hash,
    _with_module_counts,
)


def _get_store():
    from . import asset_service as _mod
    return _mod.api_execution_store


def create_project_interface_service(project_id: str, request: APIAssetInterfaceCreateRequest) -> dict[str, Any]:
    store = _get_store()
    project = store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    module = store.get_api_module(str(request.module_id or ""))
    if not module or module.get("project_id") != project_id:
        raise InvalidRequestError(message=str("目标模块不存在或不属于当前项目"))
    method = str(request.method or "").strip().upper()
    path = str(request.path or "").strip()
    if method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
        raise InvalidRequestError(message=str("请求方法不合法"))
    if not path.startswith("/"):
        raise InvalidRequestError(message=str("接口路径必须以 / 开头"))
    interface_key = f"{method} {path}"
    existing = store.get_api_interface_by_key(project_id, interface_key)
    if existing:
        raise InvalidRequestError(message=str("同方法同路径接口已存在"))
    risk_level = str(request.risk_level or "low").strip().lower()
    if risk_level not in VALID_INTERFACE_RISKS:
        raise InvalidRequestError(message=str("接口风险等级不合法"))
    tags = [str(item).strip() for item in request.tags if str(item).strip()]
    now = _now_iso()
    operation = {
        "id": interface_key,
        "method": method,
        "path": path,
        "operation_id": str(request.operation_id or "").strip(),
        "summary": str(request.summary or "").strip(),
        "description": str(request.description or "").strip(),
        "tags": tags,
        "parameters": [],
        "request_body": {},
        "responses": {"200": {"description": "OK"}},
        "security": [],
    }
    interface = {
        "interface_id": str(uuid.uuid4()),
        "project_id": project_id,
        "module_id": module.get("module_id", ""),
        "module_key": module.get("module_key", ""),
        "module_name": module.get("name", ""),
        "interface_key": interface_key,
        "method": method,
        "path": path,
        "operation_id": operation["operation_id"],
        "summary": operation["summary"],
        "description": operation["description"],
        "tags": tags,
        "risk_level": risk_level,
        "status": "active",
        "current_spec_id": "",
        "current_hash": _json_hash(operation),
        "last_seen_at": now,
        "source": "manual",
        "change_state": "added",
        "operation": operation,
        "updated_at": now,
    }
    return store.save_api_interface(interface)


def update_project_interface_service(interface_id: str, request: APIAssetInterfaceUpdateRequest) -> dict[str, Any]:
    store = _get_store()
    interface = store.get_api_interface(interface_id)
    if not interface:
        raise NotFoundError(message=str("接口资产不存在"))
    project_id = interface.get("project_id", "")
    project = store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))

    patch = request.model_dump(exclude_unset=True)
    next_interface = dict(interface)

    if "module_id" in patch and patch["module_id"]:
        module = store.get_api_module(str(patch["module_id"]))
        if not module or module.get("project_id") != project_id:
            raise InvalidRequestError(message=str("目标模块不存在或不属于当前项目"))
        next_interface.update(
            {
                "module_id": module.get("module_id", ""),
                "module_key": module.get("module_key", ""),
                "module_name": module.get("name", ""),
            }
        )

    for field in ("summary", "description", "operation_id"):
        if field in patch and patch[field] is not None:
            next_interface[field] = str(patch[field]).strip()

    if "tags" in patch and patch["tags"] is not None:
        next_interface["tags"] = [str(item).strip() for item in patch["tags"] if str(item).strip()]

    if "risk_level" in patch and patch["risk_level"] is not None:
        risk_level = str(patch["risk_level"]).strip().lower()
        if risk_level not in VALID_INTERFACE_RISKS:
            raise InvalidRequestError(message=str("接口风险等级不合法"))
        next_interface["risk_level"] = risk_level

    if "status" in patch and patch["status"] is not None:
        status = str(patch["status"]).strip().lower()
        if status not in VALID_INTERFACE_STATUSES:
            raise InvalidRequestError(message=str("接口状态不合法"))
        next_interface["status"] = status
        if status == "excluded":
            next_interface["hidden"] = True
            next_interface["excluded_by_user"] = True
            next_interface["excluded_at"] = _now_iso()
        elif interface.get("status") == "excluded":
            next_interface["hidden"] = False
            next_interface["excluded_by_user"] = False
            next_interface.pop("excluded_at", None)

    if "hidden" in patch and patch["hidden"] is not None:
        hidden = bool(patch["hidden"])
        next_interface["hidden"] = hidden
        if hidden:
            next_interface["status"] = "hidden"
        elif next_interface.get("status") == "hidden":
            next_interface["status"] = "active"

    if interface.get("source") == "manual":
        method = patch.get("method")
        path = patch.get("path")
        if method is not None:
            next_method = str(method).strip().upper()
            if next_method not in {"GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"}:
                raise InvalidRequestError(message=str("请求方法不合法"))
            next_interface["method"] = next_method
        if path is not None:
            next_path = str(path).strip()
            if not next_path.startswith("/"):
                raise InvalidRequestError(message=str("接口路径必须以 / 开头"))
            next_interface["path"] = next_path
        next_key = f"{next_interface.get('method', '').upper()} {next_interface.get('path', '')}".strip()
        existing = store.get_api_interface_by_key(project_id, next_key)
        if existing and existing.get("interface_id") != interface_id:
            raise InvalidRequestError(message=str("同方法同路径接口已存在"))
        next_interface["interface_key"] = next_key
    elif "method" in patch or "path" in patch:
        raise InvalidRequestError(message=str("OpenAPI 导入接口不允许修改 method/path，请从规范同步变更"))

    next_interface["updated_at"] = _now_iso()
    if next_interface.get("operation"):
        operation = dict(next_interface.get("operation") or {})
        for field in ("summary", "description", "operation_id", "tags", "method", "path"):
            if field in next_interface:
                operation[field] = next_interface[field]
        next_interface["current_hash"] = _json_hash(operation)
        next_interface["operation"] = operation

    return store.save_api_interface(next_interface)


def delete_project_interface_service(interface_id: str) -> dict[str, Any]:
    store = _get_store()
    interface = store.get_api_interface(interface_id)
    if not interface:
        raise NotFoundError(message=str("接口资产不存在"))
    if interface.get("source") != "manual":
        raise InvalidRequestError(message=str("OpenAPI 同步接口不支持物理删除，请通过隐藏、废弃或规范同步移除"))
    deleted = store.delete_api_interface(interface_id)
    return {"deleted": bool(deleted), "interface_id": interface_id}


def list_project_interfaces_service(
    project_id: str,
    *,
    module_id: str | None = None,
    status: str | None = None,
    risk_level: str | None = None,
    keyword: str | None = None,
    limit: int = 500,
    offset: int = 0,
) -> dict[str, Any]:
    store = _get_store()
    project = store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    from .asset_plan_service import ensure_project_assets

    ensure_project_assets(project)
    safe_limit = max(1, min(limit, 1000))
    safe_offset = max(0, offset)
    safe_status = status if status in {"active", "changed", "removed", "deprecated"} else None
    safe_risk = risk_level if risk_level in VALID_INTERFACE_RISKS else None
    items = store.list_api_interfaces(
        project_id,
        module_id=module_id,
        status=safe_status,
        risk_level=safe_risk,
        keyword=keyword,
        limit=safe_limit,
        offset=safe_offset,
    )
    total = store.count_api_interfaces(project_id, module_id=module_id, status=safe_status, risk_level=safe_risk, keyword=keyword)
    return {"total": total, "limit": safe_limit, "offset": safe_offset, "items": items, "interfaces": items}


def get_project_assets_service(project_id: str) -> dict[str, Any]:
    store = _get_store()
    project = store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    from .asset_plan_service import ensure_project_assets

    sync_result = ensure_project_assets(project)
    modules = _with_module_counts(project_id, store.list_api_modules(project_id))
    interfaces = store.list_api_interfaces(project_id, limit=1000)
    versions = store.list_api_spec_versions(project_id, limit=10)
    latest_diff = (sync_result or {}).get("diff_summary") or (versions[0].get("diff_summary", {}) if versions else {})
    return {
        "project": project,
        "modules": modules,
        "interfaces": interfaces,
        "spec_versions": versions,
        "latest_diff_summary": latest_diff,
    }


def update_interface_test_results(report: dict[str, Any]) -> None:
    store = _get_store()
    project_id = str((report.get("execution_options") or {}).get("project_id") or "")
    if not project_id:
        return
    script = report.get("script") or {}
    steps_by_id = {
        str(step.get("id")): step
        for step in script.get("steps") or []
        if step.get("id")
    }
    tested_at = report.get("finished_at") or report.get("run_at") or _now_iso()
    for result in report.get("results") or []:
        step = steps_by_id.get(str(result.get("step_id") or ""))
        if not step:
            continue
        interface = None
        interface_id = step.get("interface_id")
        if interface_id:
            interface = store.get_api_interface(interface_id)
        if not interface:
            interface_key = f"{str(step.get('method') or '').upper()} {step.get('path') or ''}".strip()
            interface = store.get_api_interface_by_key(project_id, interface_key)
        if not interface or interface.get("project_id") != project_id:
            continue
        status_code = result.get("status_code")
        from .asset_plan_service import _failure_summary

        store.save_api_interface(
            {
                **interface,
                "last_tested_at": tested_at,
                "last_test_status": result.get("status") or "failed",
                "last_status_code": status_code if isinstance(status_code, int) else None,
                "last_failure_summary": _failure_summary(result),
            }
        )
