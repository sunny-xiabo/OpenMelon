from app.api_execution.ai_assistant import build_repair_patch, enhance_dsl
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
