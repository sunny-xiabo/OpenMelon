import pytest

from app.api_execution.policy import assert_execution_allowed, evaluate_execution_policy
from app.api_execution.schemas import APITestCaseDsl


def test_policy_allows_low_risk_read_without_project_policy():
    decision = evaluate_execution_policy(_script("GET", "/api/ping", base_url="http://127.0.0.1:8000"))

    assert decision["allowed"] is True
    assert decision["risk_level"] == "low"
    assert decision["violations"] == []


def test_policy_allows_private_base_url():
    decision = evaluate_execution_policy(
        _script("GET", "/api/ping", base_url="http://10.1.2.3:8080")
    )

    assert decision["allowed"] is True


def test_policy_blocks_public_base_url_by_default():
    decision = evaluate_execution_policy(
        _script("GET", "/api/ping", base_url="https://api.example.com")
    )

    assert decision["allowed"] is False
    assert "出网目标被阻断" in decision["violations"][0]


def test_policy_can_disable_egress_guard(monkeypatch):
    monkeypatch.setattr("app.api_execution.policy.settings.API_EXECUTION_EGRESS_GUARD_ENABLED", False)

    decision = evaluate_execution_policy(
        _script("GET", "/api/ping", base_url="https://api.example.com")
    )

    assert decision["allowed"] is True
    assert decision["egress_guard_enabled"] is False


def test_policy_allows_explicit_egress_allowlist():
    decision = evaluate_execution_policy(
        _script("GET", "/api/ping", base_url="https://api.example.com"),
        project_policy_snapshot={"egress_allowlist": ["*.example.com"]},
    )

    assert decision["allowed"] is True


def test_policy_blocks_cloud_metadata_address():
    decision = evaluate_execution_policy(
        _script("GET", "/latest/meta-data", base_url="http://169.254.169.254")
    )

    assert decision["allowed"] is False
    assert "SSRF" in decision["violations"][0]


def test_policy_blocks_non_http_scheme():
    decision = evaluate_execution_policy(
        _script("GET", "/tmp", base_url="file:///etc/passwd")
    )

    assert decision["allowed"] is False
    assert "http/https" in decision["violations"][0]


def test_policy_blocks_operation_blocklist():
    with pytest.raises(ValueError, match="命中项目接口黑名单"):
        assert_execution_allowed(
            _script("POST", "/api/users", base_url="http://127.0.0.1:8000"),
            project_policy_snapshot={"operation_blocklist": ["POST /api/users"]},
        )


def test_policy_requires_allowlist_when_configured():
    decision = evaluate_execution_policy(
        _script("GET", "/api/ping", base_url="http://127.0.0.1:8000"),
        project_policy_snapshot={"operation_allowlist": ["GET /api/health"]},
    )

    assert decision["allowed"] is False
    assert "不在项目接口白名单内" in decision["violations"][0]


def test_policy_allows_operation_when_allowlisted():
    decision = evaluate_execution_policy(
        _script("GET", "/api/ping", base_url="http://127.0.0.1:8000"),
        project_policy_snapshot={"operation_allowlist": ["GET /api/ping"]},
    )

    assert decision["allowed"] is True
    assert decision["evaluated_steps"] == ["GET /api/ping"]


def test_policy_blocks_delete_unless_explicitly_allowlisted():
    blocked = evaluate_execution_policy(_script("DELETE", "/api/users/{id}", base_url="http://127.0.0.1:8000"))
    allowed = evaluate_execution_policy(
        _script("DELETE", "/api/users/{id}", base_url="http://127.0.0.1:8000"),
        project_policy_snapshot={"operation_allowlist": ["DELETE /api/users/{id}"]},
    )

    assert blocked["allowed"] is False
    assert "高风险接口" in blocked["violations"][0]
    assert allowed["allowed"] is True
    assert allowed["risk_level"] == "high"


def test_policy_allows_high_risk_with_manual_approval():
    decision = evaluate_execution_policy(_script("DELETE", "/api/users/{id}", base_url="http://127.0.0.1:8000"), approved_high_risk=True)

    assert decision["allowed"] is True
    assert decision["risk_level"] == "high"
    assert decision["approved_high_risk"] is True


def test_policy_blocks_write_operations_in_production_environment():
    decision = evaluate_execution_policy(
        _script("POST", "/api/users", base_url="http://127.0.0.1:8000"),
        environment_snapshot={"environment_type": "prod"},
    )

    assert decision["allowed"] is False
    assert "生产环境禁止执行写操作接口" in decision["violations"][0]


def test_policy_detects_high_risk_semantics():
    decision = evaluate_execution_policy(_script("POST", "/api/payments/refund", base_url="http://127.0.0.1:8000"))

    assert decision["allowed"] is False
    assert decision["step_risks"][0]["risk_level"] == "high"
    assert "高风险关键词" in decision["step_risks"][0]["reason"]


def test_policy_detects_sensitive_payload_as_medium_risk():
    script = _script("POST", "/api/session", base_url="http://127.0.0.1:8000")
    script.steps[0].headers = {"Authorization": "Bearer token"}

    decision = evaluate_execution_policy(script)

    assert decision["allowed"] is True
    assert decision["risk_level"] == "medium"
    assert "敏感" in decision["step_risks"][0]["reason"]


def test_policy_enforces_max_requests_per_run():
    script = APITestCaseDsl(
        case_id="case_policy",
        name="策略验证",
        base_url="http://127.0.0.1:8000",
        steps=[
            {
                "id": "s1",
                "name": "Ping",
                "method": "GET",
                "path": "/api/ping",
                "operation_id": "ping",
            },
            {
                "id": "s2",
                "name": "Metrics",
                "method": "GET",
                "path": "/api/metrics",
                "operation_id": "metrics",
            },
        ],
    )

    decision = evaluate_execution_policy(
        script,
        project_policy_snapshot={"max_requests_per_run": 1},
    )

    assert decision["allowed"] is False
    assert "超过项目策略上限" in decision["violations"][0]


def test_policy_includes_cleanup_steps_in_max_requests_and_allowlist():
    script = APITestCaseDsl(
        case_id="case_policy",
        name="策略验证",
        base_url="http://127.0.0.1:8000",
        steps=[
            {
                "id": "s1",
                "name": "Ping",
                "method": "GET",
                "path": "/api/ping",
                "operation_id": "ping",
            },
        ],
        cleanup_steps=[
            {
                "id": "cleanup",
                "name": "Cleanup",
                "method": "DELETE",
                "path": "/api/items/{{item_id}}",
                "operation_id": "cleanup",
            },
        ],
    )

    decision = evaluate_execution_policy(
        script,
        project_policy_snapshot={
            "max_requests_per_run": 1,
            "operation_allowlist": ["GET /api/ping"],
        },
    )

    assert decision["allowed"] is False
    assert "超过项目策略上限" in decision["violations"][0]
    assert any("不在项目接口白名单" in item for item in decision["violations"])


def test_policy_respects_manual_risk_override():
    decision = evaluate_execution_policy(
        _script("DELETE", "/api/demo/{id}", base_url="http://127.0.0.1:8000"),
        project_policy_snapshot={"risk_overrides": {"DELETE /api/demo/{id}": "low"}},
    )

    assert decision["allowed"] is True
    assert decision["risk_level"] == "low"


def _script(method: str, path: str, base_url: str = "http://example.test") -> APITestCaseDsl:
    return APITestCaseDsl(
        case_id="case_policy",
        name="策略验证",
        base_url=base_url,
        steps=[
            {
                "id": "s1",
                "name": f"{method} {path}",
                "method": method,
                "path": path,
                "operation_id": f"{method.lower()}_{path}",
            }
        ],
    )
