import asyncio
import json
import os
import random
import re
import string
import time
import uuid
from collections.abc import Awaitable, Callable
from datetime import UTC, datetime
from typing import Any
from urllib.parse import urljoin

import httpx

from app.api_execution.schemas import (
    APIRunReport,
    APIStepRunResult,
    APITestCaseDsl,
    APITestStep,
    AssertionResult,
    VariableSetup,
)

VARIABLE_PATTERN = re.compile(r"\{\{\s*([\w.-]+)\s*\}\}")
ProgressCallback = Callable[[dict[str, Any]], Awaitable[None]]


def _build_step_levels(steps: list[APITestStep]) -> list[list[APITestStep]]:
    """Topological sort: returns list of levels, each level contains steps that can run in parallel."""
    if not steps:
        return []

    step_map = {step.id: step for step in steps}
    step_ids = set(step_map)

    # Validate dependencies exist
    for step in steps:
        for dep in step.depends_on:
            if dep not in step_ids:
                raise ValueError(f"步骤 {step.id} 依赖的步骤 {dep} 不存在")

    # Detect cycles using DFS
    _detect_cycle(steps, step_map)

    # Kahn's algorithm for topological sort into levels
    in_degree: dict[str, int] = {step.id: 0 for step in steps}
    dependents: dict[str, list[str]] = {step.id: [] for step in steps}
    for step in steps:
        for dep in step.depends_on:
            in_degree[step.id] += 1
            dependents[dep].append(step.id)

    levels: list[list[APITestStep]] = []
    current_level = [step.id for step in steps if in_degree[step.id] == 0]

    while current_level:
        levels.append([step_map[sid] for sid in current_level])
        next_level = []
        for sid in current_level:
            for dependent_id in dependents[sid]:
                in_degree[dependent_id] -= 1
                if in_degree[dependent_id] == 0:
                    next_level.append(dependent_id)
        current_level = next_level

    return levels


def _detect_cycle(steps: list[APITestStep], step_map: dict[str, APITestStep]) -> None:
    UNVISITED, IN_STACK, DONE = 0, 1, 2
    state: dict[str, int] = {step.id: UNVISITED for step in steps}

    def dfs(step_id: str) -> None:
        state[step_id] = IN_STACK
        for dep in step_map[step_id].depends_on:
            if state.get(dep) == IN_STACK:
                raise ValueError(f"检测到循环依赖: {step_id} -> {dep}")
            if state.get(dep) == UNVISITED:
                dfs(dep)
        state[step_id] = DONE

    for step in steps:
        if state[step.id] == UNVISITED:
            dfs(step.id)


def _needs_dag_execution(steps: list[APITestStep]) -> bool:
    """Check if any step has depends_on, requiring DAG-based execution."""
    return any(step.depends_on for step in steps)


def _init_variables(script: APITestCaseDsl, environment: dict[str, Any] | None = None) -> dict[str, Any]:
    """Initialize variable context from environment, script, and setup_variables."""
    variables: dict[str, Any] = {}
    if environment:
        variables.update(environment.get("variables") or {})
    variables.update(script.variables or {})
    for setup in script.setup_variables or []:
        if setup.source == "static":
            variables[setup.name] = setup.value
        elif setup.source == "env":
            variables[setup.name] = os.environ.get(setup.env_key, setup.value)
        elif setup.source == "random":
            variables[setup.name] = _generate_random(setup)
        elif setup.source == "timestamp":
            variables[setup.name] = datetime.now(UTC).isoformat()
    return variables


def _generate_random(setup: VariableSetup) -> Any:
    if setup.random_type == "uuid":
        return str(uuid.uuid4())
    if setup.random_type == "string":
        return "".join(random.choices(string.ascii_letters + string.digits, k=setup.random_length))
    if setup.random_type == "int":
        return random.randint(setup.random_min, setup.random_max)
    if setup.random_type == "float":
        return random.uniform(setup.random_min, setup.random_max)
    return setup.value


async def _run_step_with_retry(
    client: httpx.AsyncClient,
    step: APITestStep,
    url: str,
    headers: dict[str, Any],
    query: dict[str, Any],
    body: dict[str, Any] | list[Any] | str | None,
    request_summary: dict[str, Any],
    variables: dict[str, Any],
) -> APIStepRunResult:
    retry = step.retry
    if not retry or retry.max_attempts < 1:
        return await _run_step(client, step, url, headers, query, body, request_summary, variables)

    delay = retry.delay_ms / 1000
    last_result = None
    for attempt in range(retry.max_attempts):
        result = await _run_step(client, step, url, headers, query, body, request_summary, variables)
        if result.status == "passed" or attempt == retry.max_attempts - 1:
            return result
        failed_types = {a.type for a in result.assertions if not a.passed}
        if not failed_types.intersection(set(retry.retry_on)):
            return result
        last_result = result
        await asyncio.sleep(delay)
        delay *= retry.backoff_factor
    return last_result


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

    variables = _init_variables(script)
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
        return (await _run_step_with_retry(client, step, url, headers, query, body, request_summary, variables)).model_dump()


async def run_all_steps(
    script: APITestCaseDsl,
    base_url: str | None = None,
    global_headers: dict[str, Any] | None = None,
    timeout_ms: int = 30000,
    max_steps: int | None = None,
    continue_on_failure: bool = True,
    step_ids: list[str] | None = None,
    progress_callback: ProgressCallback | None = None,
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

    variables = _init_variables(script)
    progress_total = len(runnable_steps)
    use_dag = _needs_dag_execution(runnable_steps)

    async with httpx.AsyncClient(timeout=timeout_ms / 1000) as client:
        if use_dag:
            results = await _run_dag(
                client, runnable_steps, resolved_base_url, global_headers,
                variables, progress_total, results, continue_on_failure, progress_callback,
            )
        else:
            results = await _run_sequential(
                client, runnable_steps, resolved_base_url, global_headers,
                variables, progress_total, results, continue_on_failure, progress_callback,
            )

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
        progress_total=progress_total,
        progress_completed=len(results),
        current_step_id=None,
        current_step_name=None,
        results=results,
    )
    return report.model_dump()


async def _run_sequential(
    client: httpx.AsyncClient,
    runnable_steps: list[APITestStep],
    base_url: str,
    global_headers: dict[str, Any] | None,
    variables: dict[str, Any],
    progress_total: int,
    results: list[APIStepRunResult],
    continue_on_failure: bool,
    progress_callback: ProgressCallback | None,
) -> list[APIStepRunResult]:
    for step in runnable_steps:
        if progress_callback:
            await progress_callback(
                {
                    "event": "step_started",
                    "progress_total": progress_total,
                    "progress_completed": len(results),
                    "current_step_id": step.id,
                    "current_step_name": step.name,
                    "results": [result.model_dump() for result in results],
                }
            )
        url = _build_url(base_url, step, variables)
        headers = _substitute_data(_merge_headers(global_headers, step.headers), variables)
        query = _substitute_data(step.query, variables)
        body = _substitute_data(step.body, variables)
        request_summary = {
            "headers": _mask_sensitive(headers),
            "query": query,
            "body": _body_preview(body),
        }
        result = await _run_step_with_retry(client, step, url, headers, query, body, request_summary, variables)
        results.append(result)
        if progress_callback:
            await progress_callback(
                {
                    "event": "step_finished",
                    "progress_total": progress_total,
                    "progress_completed": len(results),
                    "current_step_id": None,
                    "current_step_name": None,
                    "results": [item.model_dump() for item in results],
                }
            )
        if result.status != "passed" and not continue_on_failure:
            break
    return results


async def _run_dag(
    client: httpx.AsyncClient,
    runnable_steps: list[APITestStep],
    base_url: str,
    global_headers: dict[str, Any] | None,
    variables: dict[str, Any],
    progress_total: int,
    results: list[APIStepRunResult],
    continue_on_failure: bool,
    progress_callback: ProgressCallback | None,
) -> list[APIStepRunResult]:
    levels = _build_step_levels(runnable_steps)

    for level in levels:
        if len(level) == 1:
            # Single step — run sequentially, share variables directly
            result = await _execute_one_step(
                client, level[0], base_url, global_headers, variables, progress_callback,
                progress_total, results,
            )
            results.append(result)
            if result.status != "passed" and not continue_on_failure:
                break
        else:
            # Parallel execution — each step gets a copy of variables
            if progress_callback:
                for step in level:
                    await progress_callback(
                        {
                            "event": "step_started",
                            "progress_total": progress_total,
                            "progress_completed": len(results),
                            "current_step_id": step.id,
                            "current_step_name": step.name,
                            "results": [r.model_dump() for r in results],
                        }
                    )

            tasks = [
                _execute_one_step(
                    client, step, base_url, global_headers, dict(variables), None,
                    progress_total, results,
                )
                for step in level
            ]
            level_results = await asyncio.gather(*tasks, return_exceptions=True)

            has_failure = False
            for step, step_result in zip(level, level_results):
                if isinstance(step_result, BaseException):
                    step_result = APIStepRunResult(
                        step_id=step.id, name=step.name, method=step.method,
                        url="", status="failed", duration_ms=0, error=str(step_result),
                    )
                results.append(step_result)
                # Merge extracted variables back
                if step_result.extracted:
                    variables.update(step_result.extracted)
                if step_result.status != "passed":
                    has_failure = True

            if progress_callback:
                await progress_callback(
                    {
                        "event": "step_finished",
                        "progress_total": progress_total,
                        "progress_completed": len(results),
                        "current_step_id": None,
                        "current_step_name": None,
                        "results": [r.model_dump() for r in results],
                    }
                )

            if has_failure and not continue_on_failure:
                break

    return results


async def _execute_one_step(
    client: httpx.AsyncClient,
    step: APITestStep,
    base_url: str,
    global_headers: dict[str, Any] | None,
    variables: dict[str, Any],
    progress_callback: ProgressCallback | None,
    progress_total: int,
    results: list[APIStepRunResult],
) -> APIStepRunResult:
    url = _build_url(base_url, step, variables)
    headers = _substitute_data(_merge_headers(global_headers, step.headers), variables)
    query = _substitute_data(step.query, variables)
    body = _substitute_data(step.body, variables)
    request_summary = {
        "headers": _mask_sensitive(headers),
        "query": query,
        "body": _body_preview(body),
    }
    return await _run_step_with_retry(client, step, url, headers, query, body, request_summary, variables)


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
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=assertion.expected, actual=response.status_code, path=assertion.path, message="" if passed else "状态码不匹配"))
        elif assertion.type == "status_code_not":
            passed = response.status_code != assertion.expected
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=assertion.expected, actual=response.status_code, path=assertion.path, message="" if passed else "状态码不应等于该值"))
        elif assertion.type == "status_code_in":
            expected = _ensure_list(assertion.expected)
            passed = response.status_code in expected
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual=response.status_code, path=assertion.path, message="" if passed else "状态码不在期望列表中"))
        elif assertion.type == "status_code_not_in":
            expected = _ensure_list(assertion.expected)
            passed = response.status_code not in expected
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual=response.status_code, path=assertion.path, message="" if passed else "状态码不应出现在该列表中"))
        elif assertion.type == "body_contains":
            expected = str(assertion.expected if assertion.expected is not None else assertion.value)
            passed = expected in response.text
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual="body", path=assertion.path, message="" if passed else "响应体未包含期望文本"))
        elif assertion.type == "body_not_contains":
            expected = str(assertion.expected if assertion.expected is not None else assertion.value)
            passed = expected not in response.text
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual="body", path=assertion.path, message="" if passed else "响应体不应包含期望文本"))
        elif assertion.type == "json_path_exists":
            actual = _extract_response_value(response, "body", assertion.path)
            passed = actual is not None
            results.append(AssertionResult(type=assertion.type, passed=passed, expected="exists", actual=actual, path=assertion.path, message="" if passed else "JSON 路径不存在"))
        elif assertion.type == "json_path_not_exists":
            actual = _extract_response_value(response, "body", assertion.path)
            passed = actual is None
            results.append(AssertionResult(type=assertion.type, passed=passed, expected="not exists", actual=actual, path=assertion.path, message="" if passed else "JSON 路径不应存在"))
        elif assertion.type == "json_path_equals":
            actual = _extract_response_value(response, "body", assertion.path)
            expected = assertion.expected if assertion.expected is not None else assertion.value
            passed = actual == expected
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual=actual, path=assertion.path, message="" if passed else "JSON 路径值不匹配"))
        elif assertion.type == "header_exists":
            actual = response.headers.get(assertion.path or "")
            passed = actual is not None
            results.append(AssertionResult(type=assertion.type, passed=passed, expected="exists", actual=actual, path=assertion.path, message="" if passed else "响应头不存在"))
        elif assertion.type == "header_equals":
            actual = response.headers.get(assertion.path or "")
            expected = assertion.expected if assertion.expected is not None else assertion.value
            passed = actual == expected
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual=actual, path=assertion.path, message="" if passed else "响应头不匹配"))
        elif assertion.type == "header_contains":
            actual = response.headers.get(assertion.path or "")
            expected = str(assertion.expected if assertion.expected is not None else assertion.value)
            passed = expected in str(actual or "")
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=expected, actual=actual, path=assertion.path, message="" if passed else "响应头未包含期望文本"))
        elif assertion.type == "response_time_lt":
            passed = duration_ms < int(assertion.expected)
            results.append(AssertionResult(type=assertion.type, passed=passed, expected=assertion.expected, actual=duration_ms, path=assertion.path, message="" if passed else "响应耗时超出阈值"))
        else:
            results.append(AssertionResult(type=assertion.type, passed=False, expected=assertion.expected, actual=None, path=assertion.path, message=f"未知断言类型: {assertion.type}"))
    if not results:
        results.append(AssertionResult(type="status_code_in", passed=200 <= response.status_code < 300, expected=[200, 299], actual=response.status_code, message="默认 2xx 状态码检查"))
    return results


def _ensure_list(value: Any) -> list[Any]:
    if isinstance(value, list):
        return value
    if value is None:
        return []
    return [value]


def _run_extractions(step: APITestStep, response: httpx.Response) -> dict[str, Any]:
    extracted = {}
    for extraction in step.extractions or []:
        name = extraction.name.strip()
        if not name:
            continue
        value = _extract_response_value(response, extraction.source, extraction.path)
        if value is not None:
            extracted[name] = value
        elif extraction.default is not None:
            extracted[name] = extraction.default
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
        # handle bracket notation: "items[0]" -> key "items", index 0
        bracket_match = re.match(r"^(.*?)\[(\d+)\]$", part)
        if bracket_match:
            key, index_str = bracket_match.group(1), bracket_match.group(2)
            if key:
                current = current.get(key) if isinstance(current, dict) else None
                if current is None:
                    return None
            index = int(index_str)
            if isinstance(current, list):
                current = current[index] if 0 <= index < len(current) else None
            else:
                return None
        elif isinstance(current, dict):
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
        text = json.dumps(body, ensure_ascii=False)
        if len(text) <= 4000:
            return body
        return text[:4000] + "...(truncated)"
    except Exception:
        return body


def _text_preview(text: str, limit: int = 4000) -> str:
    if len(text) <= limit:
        return text
    return text[:limit] + "...(truncated)"
