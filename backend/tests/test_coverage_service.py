import asyncio

from app.services.coverage import CoverageService


class FakeGraphOps:
    def __init__(self, responses):
        self.responses = responses

    async def run_cypher(self, cypher, params=None):
        for key, value in self.responses.items():
            if key in cypher:
                return value
        return []


def test_coverage_report_keeps_modules_from_fallback_rows():
    rows = [
        {"module_name": "用户中心", "feature_count": 3, "test_case_count": 2},
        {"module_name": "支付中心", "feature_count": 0, "test_case_count": 1},
        {"module_name": "通用模块", "feature_count": 0, "test_case_count": 0},
    ]
    service = CoverageService(FakeGraphOps({"RETURN module_name, feature_count, test_case_count": rows}))

    result = asyncio.run(service.get_coverage_report())

    assert result[0]["module_name"] == "用户中心"
    assert result[0]["coverage_percentage"] == 2 / 3 * 100
    assert result[1]["module_name"] == "支付中心"
    assert result[1]["coverage_percentage"] == 0
    assert result[2]["module_name"] == "通用模块"


def test_module_coverage_falls_back_to_direct_test_cases():
    responses = {
        "RETURN f.name AS feature_name": [{"feature_name": "登录"}],
        "[:CONTAINS]->(f:Feature)<-[:COVERS]-(t:TestCase)": [],
        "[:CONTAINS]->(t:TestCase) RETURN DISTINCT t.name AS test_name": [{"test_name": "登录成功"}],
    }
    service = CoverageService(FakeGraphOps(responses))

    result = asyncio.run(service.get_module_coverage("用户中心"))

    assert result["features"] == ["登录"]
    assert result["test_cases"] == ["登录成功"]
    assert result["coverage_percentage"] == 100.0
