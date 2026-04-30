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
