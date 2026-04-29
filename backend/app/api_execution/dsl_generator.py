from typing import Any

from app.api_execution.schemas import APITestCaseDsl, APITestStep, APIAssertion


def generate_api_dsl(spec: dict[str, Any], operation_ids: list[str]) -> dict[str, Any]:
    operations = spec.get("operations", [])
    selected = [operation for operation in operations if operation.get("id") in set(operation_ids)]
    if not selected:
        raise ValueError("请选择至少一个有效接口")

    title = spec.get("info", {}).get("title") or "API"
    steps = [_operation_to_step(operation, index + 1) for index, operation in enumerate(selected)]
    dsl = APITestCaseDsl(
        case_id=f"API_{spec.get('spec_id', '')[:8]}",
        name=f"{title} API 自动化用例",
        target_project=title,
        base_url=_default_base_url(spec),
        steps=steps,
    )
    return dsl.model_dump()


def _operation_to_step(operation: dict[str, Any], index: int) -> APITestStep:
    method = operation.get("method", "GET")
    path = operation.get("path", "")
    operation_id = operation.get("operation_id") or f"{method}_{path}"
    parameters = operation.get("parameters", [])
    return APITestStep(
        id=f"s{index}",
        name=operation.get("summary") or f"{method} {path}",
        method=method,
        path=path,
        operation_id=operation_id,
        headers=_params_by_location(parameters, "header"),
        query=_params_by_location(parameters, "query"),
        path_params=_params_by_location(parameters, "path"),
        body=_request_body_example(operation.get("request_body", {})),
        assertions=[APIAssertion(type="status_code_in", expected=_success_status_codes(operation.get("responses", {})))],
    )


def _default_base_url(spec: dict[str, Any]) -> str:
    servers = spec.get("servers") or []
    if servers and isinstance(servers[0], dict):
        return servers[0].get("url", "")
    return ""


def _params_by_location(parameters: list[dict[str, Any]], location: str) -> dict[str, Any]:
    values = {}
    for param in parameters:
        if param.get("in") != location:
            continue
        name = param.get("name")
        if not name:
            continue
        values[name] = _example_from_schema(param.get("schema", {}), name)
    return values


def _request_body_example(request_body: dict[str, Any]) -> dict[str, Any] | list[Any] | str | None:
    content = request_body.get("content", {}) if isinstance(request_body, dict) else {}
    json_content = content.get("application/json") or next(iter(content.values()), None) if content else None
    if not isinstance(json_content, dict):
        return None
    schema = json_content.get("schema", {})
    if "example" in json_content:
        return json_content["example"]
    if "example" in schema:
        return schema["example"]
    return _example_from_schema(schema, "body")


def _example_from_schema(schema: dict[str, Any], name: str) -> Any:
    if not isinstance(schema, dict):
        return f"example_{name}"
    if "example" in schema:
        return schema["example"]
    if "enum" in schema and schema["enum"]:
        return schema["enum"][0]

    schema_type = schema.get("type", "string")
    if schema_type == "object":
        properties = schema.get("properties", {})
        if not properties:
            return {}
        return {key: _example_from_schema(value, key) for key, value in properties.items()}
    if schema_type == "array":
        return [_example_from_schema(schema.get("items", {}), name)]
    if schema_type == "integer":
        return 1
    if schema_type == "number":
        return 1.0
    if schema_type == "boolean":
        return True
    return f"example_{name}"


def _success_status_codes(responses: dict[str, Any]) -> list[int]:
    codes = []
    for status_code in responses:
        if str(status_code).startswith("2") and str(status_code).isdigit():
            codes.append(int(status_code))
    return codes or [200]
