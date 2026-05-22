import json

import pytest

from app.api_execution.ai import dsl_enhance as dsl_enhance_module
from app.api_execution.ai import llm_patch as llm_patch_module
from app.api_execution.ai import repair_patch as repair_patch_module
from app.api_execution.ai_assistant import (
    build_repair_patch,
    build_repair_patch_with_configured_ai,
    enhance_dsl,
    enhance_dsl_with_configured_ai,
)
from app.api_execution.schemas import APITestCaseDsl


def test_enhance_dsl_adds_response_time_assertion_and_token_extraction():
    script = APITestCaseDsl(
        case_id="case_ai",
        name="AI DSL",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "Login",
                "method": "POST",
                "path": "/login",
                "operation_id": "login",
            }
        ],
    )

    patch = enhance_dsl(script)

    step = patch["patched_script"].steps[0]
    assert patch["automatic_applicable"] is True
    assert any(assertion.type == "response_time_lt" for assertion in step.assertions)
    assert step.extractions[0].name == "access_token"


def test_enhance_dsl_completes_basic_orchestration_chain():
    script = APITestCaseDsl(
        case_id="case_ai_chain",
        name="AI DSL chain",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "Login",
                "method": "POST",
                "path": "/auth/login",
                "operation_id": "login",
            },
            {
                "id": "s2",
                "name": "Create order",
                "method": "POST",
                "path": "/orders",
                "operation_id": "createOrder",
            },
            {
                "id": "s3",
                "name": "Get order",
                "method": "GET",
                "path": "/orders/{id}",
                "operation_id": "getOrder",
                "path_params": {"id": "example_id"},
            },
        ],
    )

    patch = enhance_dsl(script)
    steps = patch["patched_script"].steps

    assert steps[0].extractions[0].name == "access_token"
    assert steps[1].depends_on == ["s1"]
    assert steps[1].headers["Authorization"] == "Bearer {{access_token}}"
    assert steps[1].extractions[0].name == "order_id"
    assert steps[2].depends_on == ["s1", "s2"]
    assert steps[2].headers["Authorization"] == "Bearer {{access_token}}"
    assert steps[2].path_params["id"] == "{{order_id}}"
    assert any(operation["field"] == "depends_on" for operation in patch["patch_operations"])
    assert any(operation["field"] == "path_params" for operation in patch["patch_operations"])


def test_enhance_dsl_does_not_blindly_chain_independent_reads():
    script = APITestCaseDsl(
        case_id="case_ai_parallel_reads",
        name="AI DSL parallel reads",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "List users",
                "method": "GET",
                "path": "/users",
                "operation_id": "listUsers",
            },
            {
                "id": "s2",
                "name": "List orders",
                "method": "GET",
                "path": "/orders",
                "operation_id": "listOrders",
            },
        ],
    )

    patch = enhance_dsl(script)
    steps = patch["patched_script"].steps

    assert steps[0].depends_on == []
    assert steps[1].depends_on == []
    assert steps[0].parallel_group == "parallel_read_1"
    assert steps[1].parallel_group == "parallel_read_1"


@pytest.mark.asyncio
async def test_enhance_dsl_llm_uses_short_timeout_without_retries(monkeypatch):
    captured = {}
    script = APITestCaseDsl(
        case_id="case_ai_timeout",
        name="AI DSL timeout",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "List",
                "method": "GET",
                "path": "/items",
                "operation_id": "listItems",
                "assertions": [{"type": "status_code_in", "expected": [200]}],
            }
        ],
    )
    fallback = enhance_dsl(script)

    class FakeCompletions:
        async def create(self, **kwargs):
            captured["create"] = kwargs
            return type(
                "Response",
                (),
                {
                    "choices": [
                        type(
                            "Choice",
                            (),
                            {
                                "message": type(
                                    "Message",
                                    (),
                                    {
                                        "content": '{"patched_script": '
                                        + script.model_dump_json()
                                        + ', "patch_operations": [], "summary": "ok"}'
                                    },
                                )()
                            },
                        )()
                    ]
                },
            )()

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            captured["client"] = kwargs
            self.chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(llm_patch_module.settings, "API_KEY", "test-key")
    monkeypatch.setattr(llm_patch_module.settings, "API_BASE_URL", "http://llm.example/v1")
    monkeypatch.setattr(llm_patch_module.settings, "CHAT_MODEL", "test-model")
    monkeypatch.setattr(llm_patch_module, "AsyncOpenAI", FakeAsyncOpenAI)

    await llm_patch_module._build_patch_with_llm(
        task="enhance_dsl",
        script=script,
        report=None,
        project_policy_snapshot={},
        fallback=fallback,
    )

    assert captured["client"]["timeout"] == 6
    assert captured["client"]["max_retries"] == 0
    assert captured["create"]["timeout"] == 6


@pytest.mark.asyncio
async def test_enhance_dsl_llm_marks_unsafe_field_changes_for_manual_review(monkeypatch):
    captured = {}
    script = APITestCaseDsl(
        case_id="case_ai_unsafe",
        name="AI DSL unsafe",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "List",
                "method": "GET",
                "path": "/items",
                "operation_id": "listItems",
                "assertions": [{"type": "status_code_in", "expected": [200]}],
            }
        ],
    )
    fallback = enhance_dsl(script)
    unsafe_script = script.model_dump()
    unsafe_script["steps"][0]["headers"] = {"Authorization": "Bearer injected"}

    class FakeCompletions:
        async def create(self, **kwargs):
            captured["create"] = kwargs
            payload = {
                "patched_script": unsafe_script,
                "patch_operations": [
                    {
                        "step_id": "s1",
                        "field": "headers",
                        "before": {},
                        "after": {"Authorization": "Bearer injected"},
                        "reason": "unsafe header mutation",
                        "safe_to_apply": True,
                    }
                ],
                "summary": "ok",
            }
            return type(
                "Response",
                (),
                {
                    "choices": [
                        type(
                            "Choice",
                            (),
                            {
                                "message": type(
                                    "Message",
                                    (),
                                    {"content": json.dumps(payload, ensure_ascii=False)},
                                )()
                            },
                        )()
                    ]
                },
            )()

    class FakeAsyncOpenAI:
        def __init__(self, **kwargs):
            captured["client"] = kwargs
            self.chat = type("Chat", (), {"completions": FakeCompletions()})()

    monkeypatch.setattr(llm_patch_module.settings, "API_KEY", "test-key")
    monkeypatch.setattr(llm_patch_module.settings, "API_BASE_URL", "http://llm.example/v1")
    monkeypatch.setattr(llm_patch_module.settings, "CHAT_MODEL", "test-model")
    monkeypatch.setattr(llm_patch_module, "AsyncOpenAI", FakeAsyncOpenAI)

    patch = await llm_patch_module._build_patch_with_llm(
        task="enhance_dsl",
        script=script,
        report=None,
        project_policy_snapshot={},
        fallback=fallback,
    )

    assert patch["automatic_applicable"] is False
    assert patch["patch_operations"][0]["safe_to_apply"] is False
    assert "非白名单字段" in patch["fallback_reason"]
    assert "非白名单字段" in patch["summary"]


@pytest.mark.asyncio
async def test_configured_enhance_dsl_accepts_agent_asset_plan(monkeypatch):
    async def fail_if_llm_called(**_kwargs):
        raise AssertionError("Agent asset plans should use the local fast enhancement path")

    monkeypatch.setattr(dsl_enhance_module.llm_patch, "_is_llm_configured", lambda: True)
    monkeypatch.setattr(dsl_enhance_module.llm_patch, "_build_patch_with_llm", fail_if_llm_called)
    script = APITestCaseDsl(
        case_id="ASSET_demo-api_006375",
        name="OpenMelon Demo API Flow 模块接口冒烟测试",
        target_project="OpenMelon Demo API Flow",
        environment="Demo 本地环境",
        base_url="http://localhost:18080",
        agent_source="api_asset_catalog",
        agent_test_intent="smoke",
        steps=[
            {
                "id": "s1",
                "name": "登录获取 token",
                "method": "POST",
                "path": "/auth/login",
                "operation_id": "login",
                "headers": {},
                "query": {},
                "path_params": {},
                "body": {"username": "demo", "password": "demo-password"},
                "assertions": [{"type": "status_code_in", "expected": [200], "path": None, "value": None}],
                "extractions": [{"name": "access_token", "source": "body", "path": "data.token", "default": None}],
            },
            {
                "id": "s2",
                "name": "创建订单",
                "method": "POST",
                "path": "/orders",
                "operation_id": "createOrder",
                "headers": {"Authorization": "Bearer {{access_token}}"},
                "query": {},
                "path_params": {},
                "body": {"sku": "SKU-001", "quantity": 1},
                "assertions": [{"type": "status_code_in", "expected": [201], "path": None, "value": None}],
                "extractions": [{"name": "order_id", "source": "body", "path": "data.id", "default": None}],
                "depends_on": ["s1"],
            },
            {
                "id": "s3",
                "name": "查询订单详情",
                "method": "GET",
                "path": "/orders/{order_id}",
                "operation_id": "getOrder",
                "headers": {"Authorization": "Bearer {{access_token}}"},
                "query": {},
                "path_params": {"order_id": "{{order_id}}"},
                "body": None,
                "assertions": [{"type": "status_code_in", "expected": [200], "path": None, "value": None}],
                "depends_on": ["s1", "s2"],
            },
        ],
    )

    patch = await enhance_dsl_with_configured_ai(
        script,
        {
            "project_id": "demo-api-flow",
            "name": "OpenMelon Demo API Flow",
            "allow_ai_execution": True,
            "allow_ai_repair": True,
            "operation_allowlist": ["POST /auth/login", "POST /orders", "GET /orders/{order_id}"],
            "operation_blocklist": [],
            "risk_overrides": {"POST /orders": "medium"},
            "max_requests_per_run": 10,
        },
    )

    assert len(patch["patch_operations"]) == 3
    assert patch["risk_level"] == "medium"
    assert patch["patched_script"].steps[1].depends_on == ["s1"]
    assert any(assertion.type == "response_time_lt" for assertion in patch["patched_script"].steps[2].assertions)


@pytest.mark.asyncio
async def test_configured_repair_patch_uses_heuristic_when_llm_disabled(monkeypatch):
    monkeypatch.setattr(repair_patch_module.llm_patch, "_is_llm_configured", lambda: False)
    script = APITestCaseDsl(
        case_id="case_configured_repair",
        name="AI repair configured",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "Create",
                "method": "POST",
                "path": "/items",
                "operation_id": "create_item",
                "assertions": [{"type": "status_code_in", "expected": [200]}],
            }
        ],
    )
    report = {
        "status": "failed",
        "results": [
            {
                "step_id": "s1",
                "status": "failed",
                "status_code": 201,
                "assertions": [{"type": "status_code_in", "passed": False, "expected": [200], "actual": 201}],
            }
        ],
    }

    patch = await build_repair_patch_with_configured_ai(script, report, {"allow_ai_repair": True})

    assert patch["ai_mode"] == "heuristic"
    assert patch["patch_operations"][0]["safe_to_apply"] is True
    assert patch["patched_script"].steps[0].assertions[0].expected == [200, 201]


def test_repair_patch_expands_success_status_codes():
    script = APITestCaseDsl(
        case_id="case_repair",
        name="AI repair",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "Create",
                "method": "POST",
                "path": "/items",
                "operation_id": "create_item",
                "assertions": [{"type": "status_code_in", "expected": [200]}],
            }
        ],
    )
    report = {
        "status": "failed",
        "results": [
            {
                "step_id": "s1",
                "status": "failed",
                "status_code": 201,
                "assertions": [{"type": "status_code_in", "passed": False, "expected": [200], "actual": 201}],
            }
        ],
    }

    patch = build_repair_patch(script, report)

    assertion = patch["patched_script"].steps[0].assertions[0]
    assert assertion.expected == [200, 201]
    assert patch["patch_operations"][0]["safe_to_apply"] is True
    assert patch["repair_draft"]["draft_script"]["steps"][0]["assertions"][0]["expected"] == [200, 201]
    assert patch["repair_draft"]["patch_operations"][0]["field"] == "assertions"
    assert len(patch["repair_draft"]["repair_suggestion_groups"]["low_risk_apply"]) == 1
    assert patch["repair_draft"]["repair_suggestion_groups"]["needs_review"] == []
    assert patch["repair_draft"]["step_summaries"][0]["changed"] is True
    assert patch["repair_draft"]["quality_score"]["score"] >= 0
    assert patch["requires_approval"] is True


def test_repair_patch_does_not_relax_non_success_status():
    script = APITestCaseDsl(
        case_id="case_no_repair",
        name="AI no repair",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "Read",
                "method": "GET",
                "path": "/missing",
                "operation_id": "read_missing",
                "assertions": [{"type": "status_code_in", "expected": [200]}],
            }
        ],
    )
    report = {
        "status": "failed",
        "results": [
            {
                "step_id": "s1",
                "status": "failed",
                "status_code": 404,
                "assertions": [{"type": "status_code_in", "passed": False, "expected": [200], "actual": 404}],
            }
        ],
    }

    patch = build_repair_patch(script, report)

    assert patch["patch_operations"] == []
    assert patch["automatic_applicable"] is False
    assert patch["repair_draft"]["draft_script"]["case_id"] == "case_no_repair"
    assert patch["repair_draft"]["uncertainties"]
    assert patch["repair_draft"]["repair_suggestion_groups"]["low_risk_apply"] == []
    assert patch["repair_draft"]["repair_suggestion_groups"]["investigation"]


def test_repair_patch_groups_review_required_operations():
    script = APITestCaseDsl(
        case_id="case_sla",
        name="AI repair SLA",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "Slow query",
                "method": "GET",
                "path": "/items",
                "operation_id": "list_items",
                "assertions": [{"type": "response_time_lt", "expected": 100}],
            }
        ],
    )
    report = {
        "status": "failed",
        "results": [
            {
                "step_id": "s1",
                "status": "failed",
                "status_code": 200,
                "duration_ms": 250,
                "assertions": [{"type": "response_time_lt", "passed": False, "expected": 100, "actual": 250}],
            }
        ],
        "failure_diagnostics": [
            {
                "step_id": "s1",
                "category": "performance_or_flaky",
                "severity": "medium",
                "explanation": "响应时间超出阈值。",
                "suggestions": ["重跑确认是否为偶发波动。"],
            }
        ],
    }

    patch = build_repair_patch(script, report)

    groups = patch["repair_draft"]["repair_suggestion_groups"]
    assert groups["low_risk_apply"] == []
    assert len(groups["needs_review"]) == 1
    assert groups["needs_review"][0]["field"] == "assertions"
    assert groups["investigation"][0]["category"] == "performance_or_flaky"
    assert patch["repair_draft"]["repair_options"]
    assert patch["repair_draft"]["repair_effect_score"]["review_operation_count"] == 1


def test_repair_patch_surfaces_historical_verified_solutions():
    script = APITestCaseDsl(
        case_id="case_history",
        name="AI repair history",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "Create",
                "method": "POST",
                "path": "/items",
                "operation_id": "create_item",
                "assertions": [{"type": "status_code_in", "expected": [200]}],
            }
        ],
    )
    report = {
        "status": "failed",
        "results": [
            {
                "step_id": "s1",
                "status": "failed",
                "status_code": 201,
                "assertions": [{"type": "status_code_in", "passed": False, "expected": [200], "actual": 201}],
            }
        ],
    }

    patch = build_repair_patch(
        script,
        report,
        {
            "historical_repair_context": [
                {
                    "knowledge_id": "api-repair:run-1",
                    "item_type": "api_repair",
                    "source_run_id": "run-1",
                    "summary": "状态码断言扩展后通过",
                    "payload": {
                        "source_label": "低风险 AI 修复项",
                        "before": {"status": "failed", "failed": 1},
                        "after": {"status": "passed", "failed": 0},
                        "patched_fields": [{"step_id": "s1", "field": "assertions"}],
                        "risk_level": "low",
                    },
                }
            ]
        },
    )

    solutions = patch["repair_draft"]["historical_repair_solutions"]
    assert solutions[0]["source_run_id"] == "run-1"
    assert solutions[0]["effect_score"] >= 80
    assert patch["repair_draft"]["repair_effect_score"]["historical_solution_count"] == 1
