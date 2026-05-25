from fnmatch import fnmatch
import ipaddress
from typing import Any
from urllib.parse import urljoin, urlparse

from app.config import settings
from app.api_execution.schemas import APITestCaseDsl
from app.api_execution.storage import api_execution_store as _default_api_execution_store
from app.api_execution.storage import get_api_execution_store

api_execution_store = _default_api_execution_store


def _store():
    if api_execution_store is not _default_api_execution_store:
        return api_execution_store
    return get_api_execution_store()

HIGH_RISK_METHODS = {"DELETE"}
WRITE_METHODS = {"POST", "PUT", "PATCH", "DELETE"}
PRODUCTION_ENV_TYPES = {"prod", "production"}
HIGH_RISK_KEYWORDS = {
    "delete",
    "remove",
    "payment",
    "pay",
    "refund",
    "permission",
    "role",
    "password",
    "admin",
    "user profile",
    "personal",
}
SENSITIVE_KEYS = {"authorization", "cookie", "token", "secret", "password", "apikey", "api-key", "x-api-key"}
VALID_RISK_LEVELS = {"low", "medium", "high", "blocked"}
ALLOWED_LOCAL_HOSTS = {"localhost", "127.0.0.1", "::1"}
BLOCKED_IP_REASON = "目标地址属于 SSRF 高风险网段"


def evaluate_execution_policy(
    script: APITestCaseDsl,
    *,
    step_id: str | None = None,
    step_ids: list[str] | None = None,
    project_id: str | None = None,
    environment_id: str | None = None,
    base_url: str | None = None,
    approved_high_risk: bool = False,
    project_policy_snapshot: dict[str, Any] | None = None,
    environment_snapshot: dict[str, Any] | None = None,
) -> dict[str, Any]:
    """Validate project policy before sending HTTP requests."""

    policy = _resolve_project_policy(project_id, project_policy_snapshot)
    environment = _resolve_environment(environment_id, environment_snapshot)
    steps = _selected_steps(script, step_id=step_id, step_ids=step_ids)
    resolved_base_url = (base_url or environment.get("base_url") or script.base_url or "").strip()
    allowlist = _patterns(policy.get("operation_allowlist"))
    blocklist = _patterns(policy.get("operation_blocklist"))
    egress_allowlist = _patterns(policy.get("egress_allowlist"))
    risk_overrides = _risk_overrides(policy.get("risk_overrides"))
    violations: list[str] = []
    warnings: list[str] = []
    evaluated_steps = []
    step_risks = []

    if policy.get("enabled") is False:
        violations.append("项目已停用，禁止执行 API 自动化请求。")
    max_requests = _positive_int(policy.get("max_requests_per_run"))
    if max_requests and len(steps) > max_requests:
        violations.append(f"本次请求数 {len(steps)} 超过项目策略上限 {max_requests}。")

    for step in steps:
        signature = _step_signature(step)
        evaluated_steps.append(signature)
        step_risk = _step_risk(step, risk_overrides)
        step_risks.append({"step": signature, **step_risk})
        if _matches(signature, blocklist):
            violations.append(f"{signature} 命中项目接口黑名单，已阻断执行。")
            continue
        if allowlist and not _matches(signature, allowlist):
            violations.append(f"{signature} 不在项目接口白名单内，已阻断执行。")
            continue
        if step_risk["risk_level"] == "blocked":
            violations.append(f"{signature} 已被标记为阻断风险，禁止执行。")
        if step_risk["risk_level"] == "high" and not approved_high_risk and not _matches(signature, allowlist):
            violations.append(f"{signature} 属于高风险接口（{step_risk['reason']}），必须加入项目白名单或人工确认后才能执行。")
        if step_risk["risk_level"] == "medium":
            warnings.append(f"{signature} 属于中风险接口：{step_risk['reason']}。")
        if settings.API_EXECUTION_EGRESS_GUARD_ENABLED:
            egress_violation = _egress_violation(step, resolved_base_url, egress_allowlist)
            if egress_violation:
                violations.append(f"{signature} 出网目标被阻断：{egress_violation}")

    environment_type = str(environment.get("environment_type") or "").lower()
    if environment_type in PRODUCTION_ENV_TYPES:
        write_steps = [_step_signature(step) for step in steps if str(step.method).upper() in WRITE_METHODS]
        if write_steps:
            violations.append(f"生产环境禁止执行写操作接口：{', '.join(write_steps)}。")
        else:
            warnings.append("当前为生产环境，只允许执行只读接口。")

    return {
        "allowed": not violations,
        "risk_level": "blocked" if violations else _risk_level(step_risks, environment_type),
        "violations": violations,
        "warnings": warnings,
        "evaluated_steps": evaluated_steps,
        "step_risks": step_risks,
        "project_id": policy.get("project_id") or project_id or "",
        "environment_id": environment.get("environment_id") or environment_id or "",
        "trigger_source": "manual",
        "allow_ai_execution": bool(policy.get("allow_ai_execution")),
        "allow_ai_repair": bool(policy.get("allow_ai_repair")),
        "allow_scheduled_execution": bool(policy.get("allow_scheduled_execution")),
        "allow_ai_generate_dsl": bool(policy.get("allow_ai_generate_dsl", True)),
        "allow_overwrite_history": bool(policy.get("allow_overwrite_history", True)),
        "approved_high_risk": bool(approved_high_risk),
        "max_auto_repairs": _positive_int(policy.get("max_auto_repairs")),
        "max_reruns": _positive_int(policy.get("max_reruns")),
        "max_requests_per_run": max_requests,
        "egress_allowlist": egress_allowlist,
        "egress_guard_enabled": bool(settings.API_EXECUTION_EGRESS_GUARD_ENABLED),
    }


def assert_execution_allowed(script: APITestCaseDsl, **kwargs: Any) -> dict[str, Any]:
    decision = evaluate_execution_policy(script, **kwargs)
    if not decision["allowed"]:
        raise ValueError("；".join(decision["violations"]))
    return decision


def _egress_violation(step: Any, base_url: str, egress_allowlist: list[str]) -> str:
    if not base_url:
        return "缺少 Base URL，无法确认执行目标。"
    url = _build_policy_url(base_url, step)
    parsed = urlparse(url)
    if parsed.scheme not in {"http", "https"}:
        return f"仅允许 http/https 目标，当前 scheme={parsed.scheme or 'empty'}。"
    host = (parsed.hostname or "").strip().lower()
    if not host:
        return "目标 URL 缺少 host。"
    if _matches_egress_allowlist(parsed, egress_allowlist):
        return ""
    if host in ALLOWED_LOCAL_HOSTS:
        return ""
    ip_error = _ip_egress_violation(host)
    if ip_error is not None:
        return ip_error
    return "公网或未显式白名单 host 默认禁止执行。"


def _build_policy_url(base_url: str, step: Any) -> str:
    path = str(getattr(step, "path", "") or "")
    return urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def _matches_egress_allowlist(parsed: Any, patterns: list[str]) -> bool:
    host = (parsed.hostname or "").lower()
    if not host:
        return False
    origin = f"{parsed.scheme}://{host}"
    if parsed.port:
        origin = f"{origin}:{parsed.port}"
    for pattern in patterns:
        normalized = _normalize_egress_pattern(pattern)
        if not normalized:
            continue
        if normalized.startswith(("http://", "https://")):
            candidate = urlparse(normalized)
            if candidate.scheme and candidate.scheme != parsed.scheme:
                continue
            candidate_host = (candidate.hostname or "").lower()
            candidate_origin = f"{candidate.scheme}://{candidate_host}"
            if candidate.port:
                candidate_origin = f"{candidate_origin}:{candidate.port}"
            if fnmatch(host, candidate_host) or fnmatch(origin, candidate_origin):
                return True
            continue
        if fnmatch(host, normalized):
            return True
    return False


def _normalize_egress_pattern(pattern: str) -> str:
    text = str(pattern or "").strip().lower()
    if not text:
        return ""
    if text.startswith(("http://", "https://")):
        return text.rstrip("/")
    text = text.split("/", 1)[0]
    if ":" in text and not text.startswith("["):
        text = text.split(":", 1)[0]
    return text


def _ip_egress_violation(host: str) -> str | None:
    try:
        ip = ipaddress.ip_address(host)
    except ValueError:
        return None
    if ip.is_loopback:
        return "" if host in ALLOWED_LOCAL_HOSTS else BLOCKED_IP_REASON
    if ip.is_link_local or ip.is_multicast or ip.is_unspecified or ip.is_reserved:
        return BLOCKED_IP_REASON
    if ip.is_private:
        return ""
    return "公网 IP 默认禁止执行。"


def _resolve_project_policy(project_id: str | None, snapshot: dict[str, Any] | None) -> dict[str, Any]:
    stored = _store().get_project(project_id) if project_id else None
    return {
        **(snapshot or {}),
        **(stored or {}),
    }


def _resolve_environment(environment_id: str | None, snapshot: dict[str, Any] | None) -> dict[str, Any]:
    stored = _store().get_environment(environment_id) if environment_id else None
    return {
        **(snapshot or {}),
        **(stored or {}),
    }


def _selected_steps(script: APITestCaseDsl, *, step_id: str | None, step_ids: list[str] | None):
    all_steps = [*(script.steps or []), *(script.cleanup_steps or [])]
    if step_ids:
        selected = set(step_ids)
        return [step for step in all_steps if step.id in selected]
    if step_id:
        return [step for step in all_steps if step.id == step_id]
    return all_steps


def _patterns(value: Any) -> list[str]:
    if not isinstance(value, list):
        return []
    return [str(item).strip().lower() for item in value if str(item).strip()]


def _step_signature(step) -> str:
    return f"{str(step.method).upper()} {step.path}"


def _matches(signature: str, patterns: list[str]) -> bool:
    candidates = [signature.lower(), signature.split(" ", 1)[1].lower()]
    return any(
        fnmatch(candidate, pattern) or candidate == pattern
        for pattern in patterns
        for candidate in candidates
    )


def _step_risk(step, risk_overrides: dict[str, str]) -> dict[str, str]:
    signature = _step_signature(step)
    for candidate in (signature.lower(), str(step.path).lower()):
        if candidate in risk_overrides:
            return {"risk_level": risk_overrides[candidate], "reason": "用户手工覆盖风险等级"}
    method = str(step.method).upper()
    if method in HIGH_RISK_METHODS:
        return {"risk_level": "high", "reason": f"HTTP {method}"}
    semantic_text = " ".join(
        str(value)
        for value in (step.path, step.name, step.operation_id)
        if value
    ).lower()
    if any(keyword in semantic_text for keyword in HIGH_RISK_KEYWORDS):
        return {"risk_level": "high", "reason": "接口语义包含高风险关键词"}
    if _has_sensitive_data(step):
        return {"risk_level": "medium", "reason": "请求包含敏感 Header、变量或字段"}
    if method in WRITE_METHODS:
        return {"risk_level": "medium", "reason": f"HTTP {method} 写操作"}
    return {"risk_level": "low", "reason": "只读接口"}


def _has_sensitive_data(step) -> bool:
    return _contains_sensitive_key(step.headers) or _contains_sensitive_key(step.body)


def _contains_sensitive_key(value: Any) -> bool:
    if isinstance(value, dict):
        for key, item in value.items():
            lower_key = str(key).lower()
            if any(token in lower_key for token in SENSITIVE_KEYS):
                return True
            if _contains_sensitive_key(item):
                return True
    if isinstance(value, list):
        return any(_contains_sensitive_key(item) for item in value)
    return False


def _risk_overrides(value: Any) -> dict[str, str]:
    if not isinstance(value, dict):
        return {}
    return {
        str(key).strip().lower(): str(risk).strip().lower()
        for key, risk in value.items()
        if str(key).strip() and str(risk).strip().lower() in VALID_RISK_LEVELS
    }


def _positive_int(value: Any) -> int:
    try:
        number = int(value)
    except (TypeError, ValueError):
        return 0
    return max(number, 0)


def _risk_level(step_risks, environment_type: str) -> str:
    if environment_type in PRODUCTION_ENV_TYPES:
        return "medium"
    levels = {item.get("risk_level") for item in step_risks}
    if "high" in levels:
        return "high"
    if "medium" in levels:
        return "medium"
    return "low"
