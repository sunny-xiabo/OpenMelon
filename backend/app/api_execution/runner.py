import json
import re
import time
from typing import Any
from urllib.parse import urljoin

import httpx

from app.api_execution.schemas import APIRunReport, APIStepRunResult, APITestCaseDsl, APITestStep, AssertionResult

VARIABLE_PATTERN = re.compile(r"\{\{\s*([\w.-]+)\s*\}\}")


async def run_single_step(
    script: APITestCaseDsl,
    step_id: str | None = None,
    base_url: str | None = None,
    global_headers: dict[str, Any] | None = None,
    timeout_ms: int = 30000,
) -> dict[str, Any]:
    if not script.steps:
        raise ValueError("测试脚本没有可执行步骤")

    step = _select_step(script.steps, step_id)
    resolved_base_url = (base_url or script.base_url or "").strip()
    if not resolved_base_url:
        raise ValueError("请先配置 Base URL")

    variables = dict(script.variables or {})
    url = _build_url(resolved_base_url, step, variables)
    headers = _substitute_data(_merge_headers(global_headers, step.headers), variables)
    query = _substitute_data(step.query, variables)
    body = _substitute_data(step.body, variables)
    request_summary = {
        "headers": _mask_sensitive(headers),
        "query": query,
        "body": _body_preview(body),
    }
    async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
        return (await _run_step(client, step, url, headers, query, body, request_summary, variables)).model_dump()


async def run_all_steps(
    script: APITestCaseDsl,
    base_url: str | None = None,
    global_headers: dict[str, Any] | None = None,
    timeout_ms: int = 30000,
    max_steps: int | None = None,
    continue_on_failure: bool = True,
    step_ids: list[str] | None = None,
) -> dict[str, Any]:
    if not script.steps:
        raise ValueError("测试脚本没有可执行步骤")

    resolved_base_url = (base_url or script.base_url or "").strip()
    if not resolved_base_url:
        raise ValueError("请先配置 Base URL")

    started_at = time.perf_counter()
    results: list[APIStepRunResult] = []
    runnable_steps = script.steps
    if step_ids:
        selected_ids = set(step_ids)
        runnable_steps = [step for step in script.steps if step.id in selected_ids]
        if not runnable_steps:
            raise ValueError("测试脚本中找不到要重跑的步骤")
    if max_steps and max_steps > 0:
        runnable_steps = runnable_steps[:max_steps]
    variables = dict(script.variables or {})
    async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
        for step in runnable_steps:
            url = _build_url(resolved_base_url, step, variables)
            headers = _substitute_data(_merge_headers(global_headers, step.headers), variables)
            query = _substitute_data(step.query, variables)
            body = _substitute_data(step.body, variables)
            request_summary = {
                "headers": _mask_sensitive(headers),
                "query": query,
                "body": _body_preview(body),
            }
            result = await _run_step(client, step, url, headers, query, body, request_summary, variables)
            results.append(result)
            if result.status != "passed" and not continue_on_failure:
                break

    passed = sum(1 for result in results if result.status == "passed")
    failed = len(results) - passed
    skipped = max(len(script.steps) - len(results), 0)
    report = APIRunReport(
        status="passed" if failed == 0 and skipped == 0 else "failed",
        duration_ms=int((time.perf_counter() - started_at) * 1000),
        total=len(results),
        passed=passed,
        failed=failed,
        skipped=skipped,
        results=results,
    )
    return report.model_dump()


async def _run_step(
    client: httpx.AsyncClient,
    step: APITestStep,
    url: str,
    headers: dict[str, Any],
    query: dict[str, Any],
    body: dict[str, Any] | list[Any] | str | None,
    request_summary: dict[str, Any],
    variables: dict[str, Any],
) -> APIStepRunResult:
    start = time.perf_counter()
    try:
        response = await client.request(
            step.method,
            url,
            headers={k: str(v) for k, v in headers.items()},
            params=query,
            json=body if isinstance(body, (dict, list)) else None,
            content=body if isinstance(body, str) else None,
        )
        duration_ms = int((time.perf_counter() - start) * 1000)
        assertion_results = _run_assertions(step, response, duration_ms)
        extracted = _run_extractions(step, response)
        variables.update(extracted)
        status = "passed" if all(item.passed for item in assertion_results) else "failed"
        return APIStepRunResult(
            step_id=step.id,
            name=step.name,
            method=step.method,
            url=url,
            status=status,
            status_code=response.status_code,
            duration_ms=duration_ms,
            assertions=assertion_results,
            extracted=extracted,
            request=request_summary,
            response={
                "headers": dict(response.headers),
                "body_preview": _text_preview(response.text),
            },
        )
    except Exception as exc:
        duration_ms = int((time.perf_counter() - start) * 1000)
        return APIStepRunResult(
            step_id=step.id,
            name=step.name,
            method=step.method,
            url=url,
            status="failed",
            duration_ms=duration_ms,
            request=request_summary,
            error=str(exc),
        )


def _select_step(steps: list[APITestStep], step_id: str | None) -> APITestStep:
    if not step_id:
        return steps[0]
    for step in steps:
        if step.id == step_id:
            return step
    raise ValueError(f"步骤不存在: {step_id}")


def _build_url(base_url: str, step: APITestStep, variables: dict[str, Any] | None = None) -> str:
    resolved_variables = variables or {}
    path = str(_substitute_value(step.path, resolved_variables))
    path_params = _substitute_data(step.path_params, resolved_variables)
    for key, value in path_params.items():
        path = path.replace(f"{{{key}}}", str(value))
    return urljoin(base_url.rstrip("/") + "/", path.lstrip("/"))


def _merge_headers(global_headers: dict[str, Any] | None, step_headers: dict[str, Any]) -> dict[str, Any]:
    merged = {}
    for source in (global_headers or {}, step_headers or {}):
        for key, value in source.items():
            if key and value is not None:
                merged[str(key)] = value
    return merged


def _substitute_data(value: Any, variables: dict[str, Any]) -> Any:
    if isinstance(value, dict):
        return {key: _substitute_data(item, variables) for key, item in value.items()}
    if isinstance(value, list):
        return [_substitute_data(item, variables) for item in value]
    return _substitute_value(value, variables)


def _substitute_value(value: Any, variables: dict[str, Any]) -> Any:
    if not isinstance(value, str):
        return value
    full_match = VARIABLE_PATTERN.fullmatch(value)
    if full_match:
        variable_name = full_match.group(1)
        return variables.get(variable_name, value)
    return VARIABLE_PATTERN.sub(lambda match: str(variables.get(match.group(1), match.group(0))), value)


def _run_assertions(step: APITestStep, response: httpx.Response, duration_ms: int) -> list[AssertionResult]:
    results = []
    assertions = step.assertions or []
    for assertion in assertions:
        if assertion.type == "status_code":
            passed = response.status_code == assertion.expected
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=assertion.expected, actual=response.status_code, message="" if passed else "状态码不匹配"))
        elif assertion.type == "status_code_in":
            expected = assertion.expected or []
            passed = response.status_code in expected
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual=response.status_code, message="" if passed else "状态码不在期望列表中"))
        elif assertion.type == "body_contains":
            expected = str(assertion.expected if assertion.expected is not None else assertion.value)
            passed = expected in response.text
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual="body", message="" if passed else "响应体未包含期望文本"))
        elif assertion.type == "json_path_exists":
            actual = _extract_response_value(response, "body", assertion.path)
            passed = actual is not None
            results.append(AssertionResult(type=assertion.type, passed=passed, expected="exists", actual=actual, message="" if passed else "JSON 路径不存在"))
        elif assertion.type == "json_path_equals":
            actual = _extract_response_value(response, "body", assertion.path)
            expected = assertion.expected if assertion.expected is not None else assertion.value
            passed = actual == expected
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual=actual, message="" if passed else "JSON 路径值不匹配"))
        elif assertion.type == "header_equals":
            actual = response.headers.get(assertion.path or "")
            expected = assertion.expected if assertion.expected is not None else assertion.value
            passed = actual == expected
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual=actual, message="" if passed else "响应头不匹配"))
        elif assertion.type == "response_time_lt":
            passed = duration_ms < int(assertion.expected)
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=assertion.expected, actual=duration_ms, message="" if passed else "响应耗时超出阈值"))
        else:
            results.append(AssertionResult(type=assertion.type, passed=True, expected=assertion.expected, actual=None, message="暂未执行该断言类型"))
    if not results:
        results.append(AssertionResult(type="status_code_in", passed=200 <= response.status_code < 300, expected=[200, 299], actual=response.status_code, message="默认 2xx 状态码检查"))
    return results


def _run_extractions(step: APITestStep, response: httpx.Response) -> dict[str, Any]:
    extracted = {}
    for extraction in step.extractions or []:
        name = extraction.name.strip()
        if not name:
            continue
        value = _extract_response_value(response, extraction.source, extraction.path)
        if value is not None:
            extracted[name] = value
    return extracted


def _extract_response_value(response: httpx.Response, source: str, path: str | None) -> Any:
    if source == "status_code":
        return response.status_code
    if source == "header":
        return response.headers.get(path or "")
    if source == "body_text":
        return response.text

    try:
        body = response.json()
    except Exception:
        return None
    if not path:
        return body
    return _read_path(body, path)


def _read_path(data: Any, path: str) -> Any:
    current = data
    normalized_path = path[2:] if path.startswith("$.") else path.lstrip(".")
    for part in normalized_path.split("."):
        if isinstance(current, dict):
            current = current.get(part)
        elif isinstance(current, list) and part.isdigit():
            index = int(part)
            current = current[index] if 0 <= index < len(current) else None
        else:
            return None
        if current is None:
            return None
    return current


def _mask_sensitive(data: dict[str, Any]) -> dict[str, Any]:
    masked = {}
    for key, value in data.items():
        if any(token in key.lower() for token in ("authorization", "token", "password", "secret", "key")):
            masked[key] = "******"
        else:
            masked[key] = value
    return masked


def _body_preview(body: Any) -> Any:
    if body is None:
        return None
    if isinstance(body, str):
        return _text_preview(body)
    try:
        return json.loads(_text_preview(json.dumps(body, ensure_ascii=False)))
    except Exception:
        return body


def _text_preview(text: str, limit: int = 4000) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "...(truncated)"
