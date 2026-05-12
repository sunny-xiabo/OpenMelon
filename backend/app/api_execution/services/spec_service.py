from app.api_execution.router_deps import *

def _parse_and_store(
    file_path: str,
    *,
    filename: str | None = None,
    source_url: str | None = None,
    content_hash: str | None = None,
) -> dict[str, Any]:
    parsed = parse_api_description_file(file_path, filename=filename)
    api_info = parsed.get("api_info", {})
    return _store_parsed_info(api_info, filename=filename, source_url=source_url, content_hash=content_hash)


def _store_parsed_info(
    api_info: dict[str, Any],
    *,
    filename: str | None = None,
    source_url: str | None = None,
    content_hash: str | None = None,
) -> dict[str, Any]:
    operations = _flatten_operations(api_info)
    spec = {
        "spec_id": str(uuid.uuid4()),
        "filename": filename,
        "source_url": source_url,
        "content_hash": content_hash,
        "parsed_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "info": api_info.get("info", {}),
        "servers": api_info.get("servers", []),
        "tags": api_info.get("tags", []),
        "operation_count": len(operations),
        "operations": operations,
    }
    api_execution_store.save_spec(spec)
    return spec


DEMO_PROJECT_ID = "demo-api-flow"
DEMO_ENVIRONMENT_ID = "demo-api-flow-local"


def _seed_demo_project(spec: dict[str, Any]) -> dict[str, Any]:
    from app.api_execution.services.run_service import _save_run_report

    now = _now_iso()
    base_url = (spec.get("servers") or [{}])[0].get("url") or "http://localhost:18080"
    project = api_execution_store.save_project(
        {
            "project_id": DEMO_PROJECT_ID,
            "name": "OpenMelon Demo API Flow",
            "description": "内置 API Flow Orchestration 演示项目，包含订单流程、失败样例和修复知识。",
            "default_environment_id": DEMO_ENVIRONMENT_ID,
            "spec_id": spec.get("spec_id"),
            "enabled": True,
            "allow_ai_execution": True,
            "allow_ai_repair": True,
            "allow_scheduled_execution": False,
            "allow_ai_generate_dsl": True,
            "allow_overwrite_history": True,
            "max_auto_repairs": 2,
            "max_reruns": 2,
            "max_requests_per_run": 10,
            "risk_overrides": {"POST /orders": "medium"},
            "operation_allowlist": ["POST /auth/login", "POST /orders", "GET /orders/{order_id}"],
            "operation_blocklist": [],
            "created_at": (api_execution_store.get_project(DEMO_PROJECT_ID) or {}).get("created_at") or now,
            "updated_at": now,
        }
    )
    environment = api_execution_store.save_environment(
        {
            "environment_id": DEMO_ENVIRONMENT_ID,
            "project_id": DEMO_PROJECT_ID,
            "name": "Demo 本地环境",
            "environment_type": "test",
            "base_url": base_url,
            "headers": {"Accept": "application/json"},
            "variables": {
                "username": "demo",
                "password": "demo-password",
                "sku": "SKU-001",
            },
            "timeout_ms": 30000,
            "continue_on_failure": True,
            "enabled": True,
            "created_at": (api_execution_store.get_environment(DEMO_ENVIRONMENT_ID) or {}).get("created_at") or now,
            "updated_at": now,
        }
    )
    script = _demo_script(spec, base_url)
    seeded_runs = [
        _save_run_report(_demo_run_report(script, "demo-run-passed", "passed")),
        _save_run_report(_demo_run_report(script, "demo-run-failed", "failed")),
        _save_run_report(_demo_run_report(script, "demo-run-repaired", "repaired")),
    ]
    knowledge_ids: set[str] = set()
    for run in seeded_runs:
        for item in build_run_knowledge_items(run):
            api_execution_store.save_knowledge_item(item)
            knowledge_ids.add(item.get("knowledge_id", ""))
    pending_tasks = api_execution_store.list_automation_tasks(status="pending", project_id=DEMO_PROJECT_ID)
    return {
        "spec": spec,
        "project": project,
        "environment": environment,
        "seeded_run_ids": [run.get("run_id", "") for run in seeded_runs],
        "knowledge_item_count": len([item for item in knowledge_ids if item]),
        "pending_task_count": len(pending_tasks),
    }


def _demo_script(spec: dict[str, Any], base_url: str) -> dict[str, Any]:
    operation_ids = [operation.get("id") for operation in spec.get("operations") or [] if operation.get("id")]
    script = generate_api_dsl(spec, operation_ids)
    script.update(
        {
            "case_id": "demo-order-flow",
            "name": "Demo 登录创建订单并查询",
            "target_project": "OpenMelon Demo API Flow",
            "environment": "Demo 本地环境",
            "base_url": base_url,
            "flow_template_id": "demo-order-template",
            "flow_template_name": "Demo 订单流程模板",
            "flow_template_tags": ["demo", "order", "smoke"],
        }
    )
    return script


def _demo_run_report(script: dict[str, Any], run_id: str, scenario: str) -> dict[str, Any]:
    now = _now_iso()
    results = []
    failed_step_id = "s3"
    for step in script.get("steps") or []:
        step_id = step.get("id", "")
        status_code = 201 if step.get("operation_id") == "createOrder" else 200
        status = "passed"
        assertions = [{"type": "status_code_in", "passed": True, "expected": [status_code], "actual": status_code}]
        error = ""
        if scenario == "failed" and step_id == failed_step_id:
            status = "failed"
            status_code = 404
            assertions = [{"type": "status_code_in", "passed": False, "expected": [200], "actual": 404, "message": "期望订单详情返回 200，实际返回 404"}]
            error = "订单 ID 未正确传递或测试数据不存在"
        results.append(
            {
                "step_id": step_id,
                "name": step.get("name", ""),
                "method": step.get("method", ""),
                "url": f"{script.get('base_url', '')}{step.get('path', '')}",
                "status": status,
                "status_code": status_code,
                "duration_ms": 120 if status == "passed" else 180,
                "assertions": assertions,
                "error": error,
            }
        )
    failed = sum(1 for result in results if result["status"] != "passed")
    passed = len(results) - failed
    report = {
        "run_id": run_id,
        "run_at": now,
        "case_id": script.get("case_id", ""),
        "target_project": script.get("target_project", ""),
        "case_name": script.get("name", ""),
        "mode": "demo",
        "script": script,
        "execution_options": _demo_execution_options(script),
        "status": "failed" if failed else "passed",
        "duration_ms": sum(result["duration_ms"] for result in results),
        "total": len(results),
        "passed": passed,
        "failed": failed,
        "skipped": 0,
        "results": results,
        "failure_reason": "订单详情返回 404" if failed else "",
        "failure_diagnostics": _demo_failure_diagnostics() if failed else [],
    }
    if scenario == "repaired":
        summary = {
            "type": "controlled_repair_rerun",
            "source": "low_risk_repair",
            "source_label": "低风险 AI 修复项",
            "created_at": "2026-05-12T00:00:00Z",
            "before": {"status": "failed", "passed": 2, "failed": 1, "duration_ms": 420},
            "after": {"status": "passed", "passed": 3, "failed": 0, "duration_ms": report["duration_ms"]},
            "failed_step_ids": [failed_step_id],
            "patched_fields": [{"step_id": "s3", "field": "path_params", "reason": "修复 order_id 变量引用"}],
            "status_changed": True,
            "failed_delta": -1,
            "risk_level": "low",
            "repair_effect_score": {"score": 100, "level": "good", "label": "修复有效"},
        }
        report["automation_summary"] = summary
        report["repair_history"] = [summary]
    return report


def _demo_execution_options(script: dict[str, Any]) -> dict[str, Any]:
    return {
        "project_id": DEMO_PROJECT_ID,
        "environment_id": DEMO_ENVIRONMENT_ID,
        "base_url": script.get("base_url", ""),
        "environment_snapshot": {
            "environment_id": DEMO_ENVIRONMENT_ID,
            "project_id": DEMO_PROJECT_ID,
            "name": "Demo 本地环境",
            "environment_type": "test",
            "base_url": script.get("base_url", ""),
            "headers": {"Accept": "application/json"},
            "variables": {"username": "demo", "password": "demo-password", "sku": "SKU-001"},
            "timeout_ms": 30000,
            "continue_on_failure": True,
        },
        "project_policy_snapshot": {
            "project_id": DEMO_PROJECT_ID,
            "name": "OpenMelon Demo API Flow",
            "allow_ai_execution": True,
            "allow_ai_repair": True,
            "allow_scheduled_execution": False,
            "allow_ai_generate_dsl": True,
            "allow_overwrite_history": True,
            "max_auto_repairs": 2,
            "max_reruns": 2,
            "max_requests_per_run": 10,
            "risk_overrides": {"POST /orders": "medium"},
            "operation_allowlist": ["POST /auth/login", "POST /orders", "GET /orders/{order_id}"],
            "operation_blocklist": [],
        },
        "flow_template_id": script.get("flow_template_id", ""),
        "flow_template_name": script.get("flow_template_name", ""),
        "flow_template_tags": script.get("flow_template_tags", []),
        "timeout_ms": 30000,
        "continue_on_failure": True,
    }


def _demo_failure_diagnostics() -> list[dict[str, Any]]:
    return [
        {
            "step_id": "s3",
            "category": "variable_reference_missing",
            "severity": "high",
            "explanation": "订单详情接口返回 404，常见原因是创建订单步骤未正确提取或传递 order_id。",
            "suggestions": [
                "确认创建订单响应中的订单 ID 路径，例如 data.id。",
                "确认查询订单 path_params.order_id 引用 {{order_id}}。",
                "修复后优先只重跑查询订单失败步骤。",
            ],
        }
    ]


def _save_environment(
    project_id: str,
    request: APIEnvironmentUpsertRequest,
    *,
    environment_id: str | None = None,
) -> dict[str, Any]:
    now = _now_iso()
    env_id = environment_id or request.environment_id or str(uuid.uuid4())
    existing = api_execution_store.get_environment(env_id) or {}
    environment = {
        **existing,
        **request.model_dump(exclude_none=True),
        "environment_id": env_id,
        "project_id": project_id,
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    saved = api_execution_store.save_environment(environment)

    project = api_execution_store.get_project(project_id) or {}
    if not project.get("default_environment_id"):
        api_execution_store.save_project(
            {
                **project,
                "project_id": project_id,
                "default_environment_id": env_id,
                "updated_at": now,
            }
        )
    return saved


def _flatten_operations(api_info: dict[str, Any]) -> list[dict[str, Any]]:
    operations = []
    for path_info in api_info.get("paths", []):
        path = path_info.get("path", "")
        for operation in path_info.get("operations", []):
            method = str(operation.get("method", "")).upper()
            operation_id = operation.get("operation_id") or f"{method}_{path}"
            operations.append(
                APIOperationAsset(
                    id=f"{method} {path}",
                    method=method,
                    path=path,
                    operation_id=operation_id,
                    summary=operation.get("summary", ""),
                    description=operation.get("description", ""),
                    tags=operation.get("tags", []),
                    parameters=operation.get("parameters", []),
                    request_body=operation.get("request_body", {}),
                    responses=operation.get("responses", {}),
                    security=operation.get("security", []),
                ).model_dump()
            )
    return operations


__all__ = [name for name in globals() if not name.startswith("__")]
