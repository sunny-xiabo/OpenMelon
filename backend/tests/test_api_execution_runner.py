import asyncio

import httpx

from app.api_execution.runner import run_all_steps, run_single_step
from app.api_execution.schemas import APITestCaseDsl


class FakeAsyncClient:
    requests = []

    def __init__(self, *args, **kwargs):
        pass

    async def __aenter__(self):
        return self

    async def __aexit__(self, exc_type, exc, traceback):
        return False

    async def request(self, method, url, **kwargs):
        self.requests.append({"method": method, "url": url, **kwargs})
        if url.endswith("/login"):
            return httpx.Response(200, json={"data": {"token": "abc-token"}})
        if url.endswith("/profile"):
            return httpx.Response(200, json={"data": {"name": "OpenMelon"}}, headers={"x-trace-id": "trace-1"})
        if url.endswith("/fail"):
            return httpx.Response(500, text="server error")
        return httpx.Response(200, text="ok")


def test_run_all_steps_builds_summary(monkeypatch):
    FakeAsyncClient.requests = []
    monkeypatch.setattr("app.api_execution.runner.httpx.AsyncClient", FakeAsyncClient)
    script = APITestCaseDsl(
        case_id="case_1",
        name="批量执行 smoke",
        base_url="http://example.test",
        steps=[
            {
                "id": "step_1",
                "name": "成功接口",
                "method": "GET",
                "path": "/ok",
                "operation_id": "ok",
                "assertions": [{"type": "status_code", "expected": 200}],
            },
            {
                "id": "step_2",
                "name": "失败接口",
                "method": "GET",
                "path": "/fail",
                "operation_id": "fail",
                "assertions": [{"type": "status_code", "expected": 200}],
            },
        ],
    )

    report = asyncio.run(run_all_steps(script))

    assert report["status"] == "failed"
    assert report["total"] == 2
    assert report["passed"] == 1
    assert report["failed"] == 1
    assert [result["status"] for result in report["results"]] == ["passed", "failed"]


def test_run_single_step_merges_global_headers(monkeypatch):
    FakeAsyncClient.requests = []
    monkeypatch.setattr("app.api_execution.runner.httpx.AsyncClient", FakeAsyncClient)
    script = APITestCaseDsl(
        case_id="case_2",
        name="鉴权 smoke",
        base_url="http://example.test",
        steps=[
            {
                "id": "step_1",
                "name": "带鉴权接口",
                "method": "GET",
                "path": "/ok",
                "operation_id": "ok",
                "headers": {"X-Step": "local"},
            },
        ],
    )

    result = asyncio.run(run_single_step(script, global_headers={"Authorization": "Bearer token", "X-Env": "dev"}))

    assert result["status"] == "passed"
    assert FakeAsyncClient.requests[0]["headers"]["Authorization"] == "Bearer token"
    assert FakeAsyncClient.requests[0]["headers"]["X-Env"] == "dev"
    assert FakeAsyncClient.requests[0]["headers"]["X-Step"] == "local"
    assert result["request"]["headers"]["Authorization"] == "******"


def test_run_all_steps_extracts_and_reuses_variables(monkeypatch):
    FakeAsyncClient.requests = []
    monkeypatch.setattr("app.api_execution.runner.httpx.AsyncClient", FakeAsyncClient)
    script = APITestCaseDsl(
        case_id="case_3",
        name="变量传递 smoke",
        base_url="http://example.test",
        steps=[
            {
                "id": "step_1",
                "name": "登录",
                "method": "POST",
                "path": "/login",
                "operation_id": "login",
                "extractions": [{"name": "access_token", "source": "body", "path": "data.token"}],
            },
            {
                "id": "step_2",
                "name": "读取用户",
                "method": "GET",
                "path": "/users/{{user_id}}",
                "operation_id": "get_user",
                "headers": {"Authorization": "Bearer {{access_token}}"},
            },
        ],
        variables={"user_id": "u-1"},
    )

    report = asyncio.run(run_all_steps(script))

    assert report["status"] == "passed"
    assert report["results"][0]["extracted"]["access_token"] == "abc-token"
    assert FakeAsyncClient.requests[1]["url"] == "http://example.test/users/u-1"
    assert FakeAsyncClient.requests[1]["headers"]["Authorization"] == "Bearer abc-token"


def test_run_all_steps_supports_json_and_header_assertions(monkeypatch):
    FakeAsyncClient.requests = []
    monkeypatch.setattr("app.api_execution.runner.httpx.AsyncClient", FakeAsyncClient)
    script = APITestCaseDsl(
        case_id="case_4",
        name="增强断言 smoke",
        base_url="http://example.test",
        steps=[
            {
                "id": "step_1",
                "name": "读取资料",
                "method": "GET",
                "path": "/profile",
                "operation_id": "profile",
                "assertions": [
                    {"type": "json_path_exists", "path": "$.data.name"},
                    {"type": "json_path_not_exists", "path": "$.data.deleted_at"},
                    {"type": "json_path_equals", "path": "$.data.name", "expected": "OpenMelon"},
                    {"type": "body_contains", "expected": "OpenMelon"},
                    {"type": "body_not_contains", "expected": "server error"},
                    {"type": "status_code_not", "expected": 500},
                    {"type": "status_code_not_in", "expected": [400, 401, 500]},
                    {"type": "header_exists", "path": "x-trace-id"},
                    {"type": "header_equals", "path": "x-trace-id", "expected": "trace-1"},
                    {"type": "header_contains", "path": "content-type", "expected": "application/json"},
                ],
            },
        ],
    )

    report = asyncio.run(run_all_steps(script))

    assert report["status"] == "passed"
    assert all(assertion["passed"] for assertion in report["results"][0]["assertions"])
    assert report["results"][0]["assertions"][0]["path"] == "$.data.name"
    assert report["results"][0]["assertions"][8]["path"] == "x-trace-id"


def test_run_all_steps_can_stop_after_failure(monkeypatch):
    FakeAsyncClient.requests = []
    monkeypatch.setattr("app.api_execution.runner.httpx.AsyncClient", FakeAsyncClient)
    script = APITestCaseDsl(
        case_id="case_5",
        name="失败停止 smoke",
        base_url="http://example.test",
        steps=[
            {
                "id": "step_1",
                "name": "失败接口",
                "method": "GET",
                "path": "/fail",
                "operation_id": "fail",
                "assertions": [{"type": "status_code", "expected": 200}],
            },
            {
                "id": "step_2",
                "name": "不应执行",
                "method": "GET",
                "path": "/ok",
                "operation_id": "ok",
            },
        ],
    )

    report = asyncio.run(run_all_steps(script, continue_on_failure=False))

    assert report["total"] == 1
    assert report["failed"] == 1
    assert report["skipped"] == 1
    assert len(FakeAsyncClient.requests) == 1


def test_run_all_steps_runs_cleanup_after_failure(monkeypatch):
    FakeAsyncClient.requests = []
    monkeypatch.setattr("app.api_execution.runner.httpx.AsyncClient", FakeAsyncClient)
    script = APITestCaseDsl(
        case_id="case_cleanup",
        name="失败后清理",
        base_url="http://example.test",
        steps=[
            {
                "id": "step_1",
                "name": "失败接口",
                "method": "GET",
                "path": "/fail",
                "operation_id": "fail",
                "assertions": [{"type": "status_code", "expected": 200}],
            },
            {
                "id": "step_2",
                "name": "主流程后续",
                "method": "GET",
                "path": "/ok",
                "operation_id": "ok",
            },
        ],
        cleanup_steps=[
            {
                "id": "cleanup_1",
                "name": "清理数据",
                "method": "DELETE",
                "path": "/cleanup",
                "operation_id": "cleanup",
                "assertions": [{"type": "status_code", "expected": 200}],
            },
        ],
    )

    report = asyncio.run(run_all_steps(script, continue_on_failure=False))

    assert report["status"] == "failed"
    assert report["total"] == 2
    assert report["skipped"] == 1
    assert [result["phase"] for result in report["results"]] == ["main", "cleanup"]
    assert [request["url"] for request in FakeAsyncClient.requests] == [
        "http://example.test/fail",
        "http://example.test/cleanup",
    ]
