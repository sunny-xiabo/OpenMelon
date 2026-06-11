"""Module CRUD operations for API asset catalog."""

from __future__ import annotations

import uuid
from typing import Any

from app.api.errors import InvalidRequestError, NotFoundError
from app.api_execution.schemas import (
    APIAssetModuleCreateRequest,
    APIAssetModuleMergeRequest,
    APIAssetModuleRemoveRequest,
    APIAssetModuleUpdateRequest,
)
from app.api_execution.utils import now_iso as _now_iso

from .asset_utils import _normalize_module_key


def _get_store():
    from . import asset_service as _mod
    return _mod.api_execution_store


def list_project_modules_service(project_id: str) -> dict[str, Any]:
    store = _get_store()
    project = store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    from .asset_plan_service import ensure_project_assets
    from .asset_utils import _with_module_counts

    ensure_project_assets(project)
    modules = _with_module_counts(project_id, store.list_api_modules(project_id))
    return {"modules": modules}


def create_project_module_service(project_id: str, request: APIAssetModuleCreateRequest) -> dict[str, Any]:
    store = _get_store()
    project = store.get_project(project_id)
    if not project:
        raise NotFoundError(message=str("API 项目不存在"))
    name = str(request.name or "").strip()
    if not name:
        raise InvalidRequestError(message=str("模块名称不能为空"))
    module_key = _normalize_module_key(name)
    existing = store.get_api_module_by_key(project_id, module_key)
    if existing and existing.get("status") != "removed":
        raise InvalidRequestError(message=str("同名模块已存在"))
    modules = store.list_api_modules(project_id)
    now = _now_iso()
    module = {
        "module_id": str(uuid.uuid4()),
        "project_id": project_id,
        "module_key": module_key,
        "name": name,
        "description": str(request.description or "").strip(),
        "status": "active",
        "sort_order": len(modules) * 10 + 100,
        "source": "manual",
        "path_prefixes": [],
        "tag_aliases": [name],
        "updated_at": now,
    }
    return {**store.save_api_module(module), "interface_count": 0}


def update_project_module_service(module_id: str, request: APIAssetModuleUpdateRequest) -> dict[str, Any]:
    store = _get_store()
    module = store.get_api_module(module_id)
    if not module:
        raise NotFoundError(message=str("模块不存在"))
    if request.name is not None:
        name = str(request.name).strip()
        if not name:
            raise InvalidRequestError(message=str("模块名称不能为空"))
        module["name"] = name
        module["module_key"] = _normalize_module_key(name)
    if request.description is not None:
        module["description"] = str(request.description).strip()
    if request.status is not None:
        module["status"] = str(request.status).strip()
    if request.sort_order is not None:
        module["sort_order"] = int(request.sort_order)
    module["updated_at"] = _now_iso()
    return store.save_api_module(module)


def remove_project_module_service(module_id: str, request: APIAssetModuleRemoveRequest) -> dict[str, Any]:
    store = _get_store()
    module = store.get_api_module(module_id)
    if not module:
        raise NotFoundError(message=str("模块不存在"))
    mode = str(request.mode or "").strip()
    if mode == "delete":
        interfaces = store.list_api_interfaces(module.get("project_id"), module_id=module_id)
        if interfaces:
            raise InvalidRequestError(message=str("模块下有接口，不能直接删除，请先迁移或排除"))
        store.delete_api_module(module_id)
        return {**module, "deleted": True}
    if mode == "exclude":
        interfaces = store.list_api_interfaces(module.get("project_id"), module_id=module_id)
        for iface in interfaces:
            iface["status"] = "excluded"
            iface["hidden"] = True
            iface["excluded_by_user"] = True
            iface["excluded_at"] = _now_iso()
            iface["updated_at"] = _now_iso()
            store.save_api_interface(iface)
        module["status"] = "excluded"
        module["updated_at"] = _now_iso()
        return store.save_api_module(module)
    target_id = str(request.target_module_id or "").strip()
    if not target_id:
        raise InvalidRequestError(message=str("迁移模式需要指定目标模块"))
    target = store.get_api_module(target_id)
    if not target or target.get("project_id") != module.get("project_id"):
        raise InvalidRequestError(message=str("目标模块不存在或不属于同一项目"))
    interfaces = store.list_api_interfaces(module.get("project_id"), module_id=module_id)
    for iface in interfaces:
        iface["module_id"] = target_id
        iface["module_name"] = target.get("name", "")
        iface["updated_at"] = _now_iso()
        store.save_api_interface(iface)
    store.delete_api_module(module_id)
    return {**module, "deleted": True}


def merge_project_module_service(module_id: str, request: APIAssetModuleMergeRequest) -> dict[str, Any]:
    store = _get_store()
    module = store.get_api_module(module_id)
    if not module:
        raise NotFoundError(message=str("模块不存在"))
    target_id = str(request.target_module_id or "").strip()
    if not target_id:
        raise InvalidRequestError(message=str("合并目标模块不能为空"))
    target = store.get_api_module(target_id)
    if not target or target.get("project_id") != module.get("project_id"):
        raise InvalidRequestError(message=str("目标模块不存在或不属于同一项目"))
    if module_id == target_id:
        raise InvalidRequestError(message=str("不能合并到自身"))
    interfaces = store.list_api_interfaces(module.get("project_id"), module_id=module_id)
    for iface in interfaces:
        iface["module_id"] = target_id
        iface["module_name"] = target.get("name", "")
        iface["updated_at"] = _now_iso()
        store.save_api_interface(iface)
    module["status"] = "excluded"
    module["merged_into_module_id"] = target_id
    module["updated_at"] = _now_iso()
    return store.save_api_module(module)


def delete_project_module_service(module_id: str) -> dict[str, Any]:
    store = _get_store()
    module = store.get_api_module(module_id)
    if not module:
        raise NotFoundError(message=str("模块不存在"))
    interfaces = store.list_api_interfaces(module.get("project_id"), module_id=module_id)
    if interfaces:
        raise InvalidRequestError(message=str("模块下有接口，不能直接删除，请先迁移或排除"))
    store.delete_api_module(module_id)
    return {**module, "deleted": True}
