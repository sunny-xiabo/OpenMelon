from app.api_execution.diagnostics import enrich_run_report
from app.api_execution.schemas import APITestCaseDsl


def test_enrich_run_report_adds_case_link_and_status_diagnostics():
    script = _script()
    report = {
        "status": "failed",
        "duration_ms": 18,
        "total": 1,
        "passed": 0,
        "failed": 1,
        "skipped": 0,
        "results": [
            {
                "step_id": "s1",
                "name": "读取用户",
                "method": "GET",
                "url": "http://example.test/users/u-1",
                "status": "failed",
                "status_code": 401,
                "duration_ms": 18,
                "assertions": [
                    {
                        "type": "status_code_in",
                        "passed": False,
                        "expected": [200],
                        "actual": 401,
                        "message": "状态码不在期望列表中",
                    }
                ],
            }
        ],
    }

    enriched = enrich_run_report(report, script)

    assert enriched["case_id"] == "case_diagnostics"
    assert enriched["target_project"] == "demo-api"
    assert enriched["failure_reason"].startswith("状态码断言失败")
    assert enriched["failure_diagnostics"][0]["category"] == "status_code_mismatch"
    assert "检查 Bearer Token" in enriched["repair_suggestions"][0]
    assert enriched["results"][0]["diagnostics"][0]["step_id"] == "s1"


def test_enrich_run_report_explains_json_path_mismatch():
    script = _script()
    report = {
        "status": "failed",
        "duration_ms": 10,
        "total": 1,
        "passed": 0,
        "failed": 1,
        "skipped": 0,
        "results": [
            {
                "step_id": "s1",
                "name": "读取用户",
                "method": "GET",
                "url": "http://example.test/users/u-1",
                "status": "failed",
                "status_code": 200,
                "duration_ms": 10,
                "assertions": [
                    {
                        "type": "json_path_equals",
                        "passed": False,
                        "path": "$.data.name",
                        "expected": "Alice",
                        "actual": "Bob",
                    }
                ],
            }
        ],
    }

    enriched = enrich_run_report(report, script)

    diagnostic = enriched["failure_diagnostics"][0]
    assert diagnostic["category"] == "test_data_mismatch"
    assert "JSON 路径值不匹配" in diagnostic["explanation"]
    assert "测试数据" in diagnostic["suggestions"][0]


def _script():
    return APITestCaseDsl(
        case_id="case_diagnostics",
        name="诊断 smoke",
        target_project="demo-api",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "读取用户",
                "method": "GET",
                "path": "/users/{id}",
                "operation_id": "get_user",
            }
        ],
    )
