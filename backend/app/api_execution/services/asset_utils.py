"""Utility functions and constants for API asset catalog services."""

from __future__ import annotations

import hashlib
import json
import re
from base64 import b64encode
from fnmatch import fnmatch
from typing import Any

DEFAULT_MODULE_NAME = "未分组"
EXECUTABLE_INTERFACE_STATUSES = {"active", "changed"}
VALID_INTERFACE_RISKS = {"low", "medium", "high", "blocked"}
VALID_INTERFACE_STATUSES = {"active", "changed", "deprecated", "removed", "hidden", "excluded"}
NEGATIVE_STATUS_CODES = [400, 401, 403, 404, 409, 422]
AUTH_TOKENS = {"auth", "login", "signin", "token", "session", "oauth"}
CREATE_TOKENS = {"create", "add", "new", "submit", "register", "生成", "创建", "新增"}
RESOURCE_STOPWORDS = {"api", "v1", "v2", "v3"}


def _json_hash(value: Any) -> str:
    payload = json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":"))
    return hashlib.sha256(payload.encode("utf-8")).hexdigest()


def _stable_id(prefix: str, *parts: str) -> str:
    raw = "|".join(str(part or "") for part in parts)
    return f"{prefix}-{hashlib.sha1(raw.encode('utf-8')).hexdigest()[:24]}"


def _normalize_module_key(name: str) -> str:
    normalized = re.sub(r"\s+", "-", (name or "").strip().lower())
    normalized = re.sub(r"[^0-9a-zA-Z_\-\u4e00-\u9fff]+", "-", normalized).strip("-")
    return normalized or "ungrouped"


def _module_name_from_path(path: str) -> str:
    for segment in (path or "").strip("/").split("/"):
        clean = segment.strip()
        if not clean or clean.startswith("{"):
            continue
        if clean.lower() == "api" or re.fullmatch(r"v\d+", clean.lower()):
            continue
        return clean.replace("-", " ").replace("_", " ").strip().title() or DEFAULT_MODULE_NAME
    return DEFAULT_MODULE_NAME


def _infer_module_name(operation: dict[str, Any]) -> str:
    tags = [str(tag).strip() for tag in operation.get("tags") or [] if str(tag).strip()]
    if tags:
        return tags[0]
    return _module_name_from_path(operation.get("path", ""))


def _source_type(spec: dict[str, Any]) -> str:
    if spec.get("source_url"):
        return "url"
    if spec.get("filename"):
        return "file"
    return "unknown"


def _risk_level(method: str, project: dict[str, Any], interface_key: str) -> str:
    overrides = project.get("risk_overrides") or {}
    if interface_key in overrides:
        return overrides[interface_key]
    method = method.upper()
    if method == "DELETE":
        return "high"
    if method in {"POST", "PUT", "PATCH"}:
        return "medium"
    return "low"


def _patterns(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip().lower() for item in value if str(item).strip()]


def _matches_interface_pattern(interface_key: str, patterns: list[str]) -> bool:
    signature = str(interface_key or "").lower()
    path = signature.split(" ", 1)[1] if " " in signature else signature
    return any(fnmatch(candidate, pattern) or candidate == pattern for pattern in patterns for candidate in (signature, path))


def _interface_risk(project: dict[str, Any], interface: dict[str, Any]) -> str:
    stored = str(interface.get("risk_level") or "").lower()
    if stored in VALID_INTERFACE_RISKS:
        return stored
    return _risk_level(interface.get("method", ""), project, interface.get("interface_key", ""))


def _interface_to_operation(interface: dict[str, Any]) -> dict[str, Any]:
    operation = dict(interface.get("operation") or {})
    operation.update(
        {
            "id": interface.get("interface_id", ""),
            "method": (interface.get("method") or operation.get("method") or "GET").upper(),
            "path": interface.get("path") or operation.get("path") or "",
            "operation_id": interface.get("operation_id") or operation.get("operation_id") or interface.get("interface_key", ""),
            "summary": interface.get("summary") or operation.get("summary") or interface.get("interface_key", ""),
            "description": interface.get("description") or operation.get("description", ""),
            "tags": interface.get("tags") or operation.get("tags") or [],
        }
    )
    operation.setdefault("parameters", [])
    operation.setdefault("request_body", {})
    operation.setdefault("responses", {"200": {"description": "OK"}})
    operation.setdefault("security", [])
    return operation


def _tokenize_text(value: str) -> set[str]:
    normalized = re.sub(r"[^0-9a-zA-Z\u4e00-\u9fff]+", " ", str(value or "").lower())
    return {item for item in normalized.split() if item}


def _singular_resource(value: str) -> str:
    text = re.sub(r"[^0-9a-zA-Z]+", "_", str(value or "").lower()).strip("_")
    if text.endswith("ies") and len(text) > 3:
        text = f"{text[:-3]}y"
    elif text.endswith("s") and len(text) > 3:
        text = text[:-1]
    return text


def _resource_name_from_path(path: str) -> str:
    segments: list[str] = []
    for raw_segment in str(path or "").split("/"):
        stripped = raw_segment.strip()
        if not stripped or (stripped.startswith("{") and stripped.endswith("}")):
            continue
        segments.append(stripped)
    static_segments = [
        segment
        for segment in segments
        if segment.lower() not in RESOURCE_STOPWORDS
        and not re.fullmatch(r"v\d+", segment.lower())
    ]
    if static_segments:
        return _singular_resource(static_segments[-1])
    return _singular_resource(segments[-1] if segments else "")


def _interface_text(interface: dict[str, Any]) -> str:
    return " ".join(
        str(interface.get(key) or "")
        for key in ("operation_id", "summary", "description", "interface_key", "path")
    ).lower()


def _looks_like_auth_interface(interface: dict[str, Any]) -> bool:
    tokens = _tokenize_text(_interface_text(interface))
    return bool(tokens & AUTH_TOKENS)


def _looks_like_create_interface(interface: dict[str, Any]) -> bool:
    if _looks_like_auth_interface(interface):
        return False
    if str(interface.get("method") or "").upper() != "POST":
        return False
    tokens = _tokenize_text(_interface_text(interface))
    return bool(tokens & CREATE_TOKENS) or "{" not in str(interface.get("path") or "")


def _orchestration_sort_key(interface: dict[str, Any]) -> tuple[int, str]:
    method = str(interface.get("method") or "").upper()
    path = str(interface.get("path") or "")
    if _looks_like_auth_interface(interface):
        bucket = 0
    elif _looks_like_create_interface(interface):
        bucket = 1
    elif method == "GET" and "{" in path:
        bucket = 2
    elif method in {"PUT", "PATCH"}:
        bucket = 3
    elif method == "GET":
        bucket = 4
    elif method == "DELETE":
        bucket = 5
    else:
        bucket = 6
    return bucket, _resource_name_from_path(path), path


def _get_store():
    from . import asset_service as _mod
    return _mod.api_execution_store


def _with_module_counts(project_id: str, modules: list[dict[str, Any]]) -> list[dict[str, Any]]:
    store = _get_store()

    counts: dict[str, int] = {}
    for item in store.list_api_interfaces(project_id, limit=1000):
        if item.get("status") in {"removed", "deprecated", "hidden"} or item.get("hidden"):
            continue
        module_id = item.get("module_id", "")
        counts[module_id] = counts.get(module_id, 0) + 1
    return [{**module, "interface_count": counts.get(module.get("module_id", ""), 0)} for module in modules]


def _with_planned_module_counts(modules: list[dict[str, Any]], interfaces: list[dict[str, Any]]) -> list[dict[str, Any]]:
    counts: dict[str, int] = {}
    for item in interfaces:
        if item.get("status") == "removed":
            continue
        module_id = item.get("module_id", "")
        counts[module_id] = counts.get(module_id, 0) + 1
    return [{**module, "interface_count": counts.get(module.get("module_id", ""), 0)} for module in modules]


def _auth_secret(config: dict[str, Any], value_key: str, variable_key: str) -> str:
    variable = str(config.get(variable_key) or "").strip()
    if variable:
        return "{{" + variable + "}}"
    return str(config.get(value_key) or "").strip()


def _auth_injection(project: dict[str, Any]) -> tuple[dict[str, Any], dict[str, Any]]:
    config = project.get("auth_config") or {}
    if not isinstance(config, dict) or not config.get("type"):
        return {}, {}
    auth_type = str(config.get("type") or "none").strip().lower()
    if auth_type in {"", "none"}:
        return {}, {}

    headers: dict[str, Any] = {}
    query: dict[str, Any] = {}
    if auth_type == "bearer":
        token = _auth_secret(config, "token", "token_variable")
        if token:
            header_name = str(config.get("header_name") or "Authorization").strip() or "Authorization"
            prefix = str(config.get("prefix") if config.get("prefix") is not None else "Bearer").strip()
            headers[header_name] = f"{prefix} {token}".strip()
    elif auth_type == "api_key":
        name = str(config.get("name") or config.get("api_key_name") or "").strip()
        value = _auth_secret(config, "value", "value_variable")
        target = str(config.get("in") or config.get("api_key_in") or "header").strip().lower()
        if name and value:
            if target == "query":
                query[name] = value
            else:
                headers[name] = value
    elif auth_type == "basic":
        header_name = str(config.get("header_name") or "Authorization").strip() or "Authorization"
        encoded = _auth_secret(config, "encoded", "encoded_variable")
        if not encoded:
            username = str(config.get("username") or "").strip()
            password = str(config.get("password") or "").strip()
            if username or password:
                encoded = b64encode(f"{username}:{password}".encode("utf-8")).decode("ascii")
        if encoded:
            headers[header_name] = f"Basic {encoded}"
    return headers, query
