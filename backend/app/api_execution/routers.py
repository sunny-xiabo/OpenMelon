import hashlib
import json
import os
import tempfile
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx
from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.api_execution.schemas import (
    APIEnvironmentConfig,
    APIEnvironmentListResponse,
    APIEnvironmentUpsertRequest,
    AIDslEnhanceRequest,
    AIRepairPatchRequest,
    AIPatchResponse,
    AutomationTaskListResponse,
    AutomationTaskRecord,
    APIOperationAsset,
    APIProjectConfig,
    APIProjectListResponse,
    APIProjectUpsertRequest,
    PolicyAuditListResponse,
    APITestCaseDsl,
    CreateRunResponse,
    ExportScriptRequest,
    GenerateDslRequest,
    KnowledgeIngestResponse,
    KnowledgeCandidateApproveResponse,
    KnowledgeSearchResponse,
    OpenAPIParseResponse,
    OperationsResponse,
    ParseUrlRequest,
    APIRunReport,
    APIRunHistoryResponse,
    RunScriptRequest,
    APIStepRunResult,
    ScheduledExecutionResponse,
    SpecSyncResponse,
    ValidateDslRequest,
)
from app.api_execution.ai_assistant import (
    build_repair_patch,
    build_repair_patch_with_configured_ai,
    enhance_dsl_with_configured_ai,
)
from app.api_execution.storage import api_execution_store
from app.api_execution.diagnostics import enrich_run_report
from app.api_execution.dsl_generator import generate_api_dsl
from app.api_execution.knowledge import build_run_knowledge_items, write_run_to_graph
from app.api_execution.exporters.postman_exporter import generate_postman_collection
from app.api_execution.exporters.pytest_exporter import generate_pytest_script
from app.api_execution.policy import assert_execution_allowed
from app.api_execution.run_queue import cancel_run, enqueue_run
from app.api_execution.runner import run_all_steps, run_single_step
from app.api_execution.spec_parser import SUPPORTED_EXTENSIONS, parse_api_description_file, parse_api_description_url

router = APIRouter(prefix="/api-execution", tags=["api-execution"])


@router.get("/projects", response_model=APIProjectListResponse)
async def list_projects():
    return {"projects": api_execution_store.list_projects()}


@router.get("/policy/audits", response_model=PolicyAuditListResponse)
async def list_policy_audits(limit: int = 20, project_id: str | None = None, action: str | None = None):
    safe_limit = max(1, min(limit, 100))
    return {"audits": api_execution_store.list_policy_audits(safe_limit, project_id, action)}


@router.get("/automation/tasks", response_model=AutomationTaskListResponse)
async def list_automation_tasks(limit: int = 20, status: str | None = None, project_id: str | None = None):
    safe_limit = max(1, min(limit, 100))
    safe_status = status if status in {"pending", "running", "resolved", "failed"} else None
    return {"tasks": api_execution_store.list_automation_tasks(safe_limit, safe_status, project_id)}


@router.post("/automation/tasks/{task_id}/resolve", response_model=AutomationTaskRecord)
async def resolve_automation_task(task_id: str):
    now = _now_iso()
    task = api_execution_store.update_automation_task(
        task_id,
        {
            "status": "resolved",
            "updated_at": now,
            "resolved_at": now,
            "resolution_note": "人工确认完成",
        },
    )
    if not task:
        raise HTTPException(status_code=404, detail="待处理任务不存在")
    return task


@router.post("/automation/scheduled-runs/trigger", response_model=ScheduledExecutionResponse)
async def trigger_scheduled_runs():
    triggered_at = _now_iso()
    items = []
    for project in api_execution_store.list_projects():
        item = _enqueue_scheduled_project(project, triggered_at)
        items.append(item)
    return {"triggered_at": triggered_at, "items": items}


@router.post("/automation/spec-sync/trigger", response_model=SpecSyncResponse)
async def trigger_spec_sync():
    triggered_at = _now_iso()
    items = []
    for project in api_execution_store.list_projects():
        items.append(_sync_project_spec_dsl(project, triggered_at))
    return {"triggered_at": triggered_at, "items": items}


@router.post("/knowledge/ingest-runs", response_model=KnowledgeIngestResponse)
async def ingest_runs_to_knowledge(request: Request, limit: int = 20):
    safe_limit = max(1, min(limit, 100))
    ingested_at = _now_iso()
    graph_ops = getattr(request.app.state, "graph_ops", None)
    vector_ops = getattr(request.app.state, "vector_ops", None)
    llm_client = getattr(request.app.state, "llm_client", None)
    response = {
        "ingested_at": ingested_at,
        "run_count": 0,
        "knowledge_count": 0,
        "graph_written": 0,
        "vector_written": 0,
        "graph_available": graph_ops is not None,
        "vector_available": vector_ops is not None and llm_client is not None,
        "errors": [],
    }
    for run in api_execution_store.list_runs(limit=safe_limit):
        single = await _ingest_single_run_to_knowledge(request, run)
        response["run_count"] += single.get("run_count", 0)
        response["knowledge_count"] += single.get("knowledge_count", 0)
        response["graph_written"] += single.get("graph_written", 0)
        response["vector_written"] += single.get("vector_written", 0)
        response["errors"].extend(single.get("errors", []))
    return response


@router.get("/knowledge/search-repairs", response_model=KnowledgeSearchResponse)
async def search_repair_knowledge(request: Request, query: str, project_id: str = "", limit: int = 5):
    safe_limit = max(1, min(limit, 20))
    items = await _search_historical_repair_context(request, query, project_id=project_id, top_k=safe_limit)
    return {"query": query, "items": items}


@router.post("/knowledge/candidates/{task_id}/approve", response_model=KnowledgeCandidateApproveResponse)
async def approve_knowledge_candidate(request: Request, task_id: str):
    task = api_execution_store.get_automation_task(task_id)
    if not task:
        raise HTTPException(status_code=404, detail="待沉淀候选不存在")
    if task.get("task_type") != "knowledge_ingest_candidate":
        raise HTTPException(status_code=400, detail="该待处理项不是知识沉淀候选")
    run_id = task.get("run_id")
    run = api_execution_store.get_run(run_id) if run_id else None
    if not run:
        raise HTTPException(status_code=404, detail="候选关联的执行记录不存在")

    response = await _ingest_single_run_to_knowledge(request, run)
    now = _now_iso()
    api_execution_store.update_automation_task(
        task_id,
        {
            "status": "resolved",
            "updated_at": now,
            "resolved_at": now,
            "resolution_note": "已确认沉淀到知识库",
            "summary": {
                **(task.get("summary") or {}),
                "knowledge_count": response.get("knowledge_count", 0),
                "vector_written": response.get("vector_written", 0),
                "graph_written": response.get("graph_written", 0),
            },
        },
    )
    return {"task_id": task_id, "run_id": run_id, **response}


@router.post("/projects", response_model=APIProjectConfig)
async def upsert_project(request: APIProjectUpsertRequest):
    now = _now_iso()
    project_id = request.project_id or str(uuid.uuid4())
    existing = api_execution_store.get_project(project_id) or {}
    project = {
        **existing,
        **request.model_dump(exclude_none=True),
        "project_id": project_id,
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    return api_execution_store.save_project(project)


@router.get("/projects/{project_id}", response_model=APIProjectConfig)
async def get_project(project_id: str):
    project = api_execution_store.get_project(project_id)
    if not project:
        raise HTTPException(status_code=404, detail="API 项目不存在")
    return project


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    if not api_execution_store.delete_project(project_id):
        raise HTTPException(status_code=404, detail="API 项目不存在")
    return {"deleted": True}


@router.get("/projects/{project_id}/environments", response_model=APIEnvironmentListResponse)
async def list_project_environments(project_id: str):
    if not api_execution_store.get_project(project_id):
        raise HTTPException(status_code=404, detail="API 项目不存在")
    return {"environments": api_execution_store.list_environments(project_id)}


@router.post("/projects/{project_id}/environments", response_model=APIEnvironmentConfig)
async def upsert_project_environment(project_id: str, request: APIEnvironmentUpsertRequest):
    if not api_execution_store.get_project(project_id):
        raise HTTPException(status_code=404, detail="API 项目不存在")
    return _save_environment(project_id, request)


@router.patch("/environments/{environment_id}", response_model=APIEnvironmentConfig)
async def update_environment(environment_id: str, request: APIEnvironmentUpsertRequest):
    existing = api_execution_store.get_environment(environment_id)
    if not existing:
        raise HTTPException(status_code=404, detail="API 环境不存在")
    return _save_environment(existing["project_id"], request, environment_id=environment_id)


@router.delete("/environments/{environment_id}")
async def delete_environment(environment_id: str):
    if not api_execution_store.delete_environment(environment_id):
        raise HTTPException(status_code=404, detail="API 环境不存在")
    return {"deleted": True}


@router.post("/openapi/parse-file", response_model=OpenAPIParseResponse)
async def parse_openapi_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise HTTPException(status_code=400, detail="仅支持 OpenAPI / Postman / HAR / Markdown / Word / Excel / HTML / TXT / CSV 文件")

    content = await file.read()
    if not content:
        raise HTTPException(status_code=400, detail="API 文档文件不能为空")

    content_hash = _content_hash(content)
    cached_spec = api_execution_store.get_spec_by_content_hash(content_hash)
    if cached_spec:
        return cached_spec

    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(content)
            tmp_path = tmp.name
        return await run_in_threadpool(_parse_and_store, tmp_path, filename=filename, content_hash=content_hash)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"API 文档解析失败: {exc}") from exc
    finally:
        if "tmp_path" in locals() and os.path.exists(tmp_path):
            os.unlink(tmp_path)


@router.post("/openapi/parse-url", response_model=OpenAPIParseResponse)
async def parse_openapi_url(request: ParseUrlRequest):
    url = str(request.url)
    if not request.force_refresh:
        cached_spec = api_execution_store.get_latest_spec_by_source_url(url)
        if cached_spec:
            return cached_spec

    try:
        async with httpx.AsyncClient(timeout=20, follow_redirects=True) as client:
            response = await client.get(url)
            response.raise_for_status()
            parsed_info = await parse_api_description_url(url, client=client, response=response)
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=400, detail=f"OpenAPI URL 获取失败: {exc}") from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    content_hash = _content_hash(response.content)
    if not request.force_refresh:
        cached_spec = api_execution_store.get_spec_by_content_hash(content_hash)
        if cached_spec:
            return cached_spec

    try:
        return _store_parsed_info(parsed_info, source_url=url, content_hash=content_hash)
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=400, detail=f"API 文档解析失败: {exc}") from exc


@router.get("/specs/{spec_id}/operations", response_model=OperationsResponse)
async def get_spec_operations(spec_id: str):
    spec = api_execution_store.get_spec(spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="OpenAPI 资产不存在")
    return {
        "spec_id": spec_id,
        "operation_count": spec.get("operation_count", 0),
        "operations": spec.get("operations", []),
    }


@router.post("/dsl/generate", response_model=APITestCaseDsl)
async def generate_dsl(request: GenerateDslRequest):
    spec = api_execution_store.get_spec(request.spec_id)
    if not spec:
        raise HTTPException(status_code=404, detail="OpenAPI 资产不存在")
    try:
        return generate_api_dsl(spec, request.operation_ids)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/dsl/validate")
async def validate_dsl(request: ValidateDslRequest):
    return {
        "valid": True,
        "case_id": request.script.case_id,
        "step_count": len(request.script.steps or []),
    }


@router.post("/ai/dsl/enhance", response_model=AIPatchResponse)
async def enhance_dsl_endpoint(request: AIDslEnhanceRequest):
    return await enhance_dsl_with_configured_ai(request.script, request.project_policy_snapshot)


@router.post("/ai/repair-patch", response_model=AIPatchResponse)
async def repair_patch_endpoint(api_request: Request, request: AIRepairPatchRequest):
    historical_context = await _search_historical_repair_context(
        api_request,
        _repair_context_query(request.script, request.report),
        project_id=request.project_policy_snapshot.get("project_id", ""),
        top_k=3,
    )
    policy_snapshot = {
        **request.project_policy_snapshot,
        "historical_repair_context": historical_context,
    }
    return await build_repair_patch_with_configured_ai(request.script, request.report, policy_snapshot)


@router.post("/runs/{run_id}/auto-repair", response_model=APIRunReport)
async def auto_repair_and_rerun(run_id: str):
    run = api_execution_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="执行历史不存在")
    script = _script_from_report(run)
    if not script:
        raise HTTPException(status_code=400, detail="执行历史缺少可修复脚本")
    if run.get("status") == "passed" or not run.get("failed"):
        raise HTTPException(status_code=400, detail="当前执行记录没有失败步骤，无需自动修复")

    options = run.get("execution_options") or {}
    policy_snapshot = options.get("project_policy_snapshot") or {}
    environment_snapshot = options.get("environment_snapshot") or {}
    failed_step_ids = [
        str(result.get("step_id"))
        for result in run.get("results", []) or []
        if result.get("status") != "passed" and result.get("step_id")
    ]
    if not failed_step_ids:
        raise HTTPException(status_code=400, detail="当前执行记录没有可重跑的失败步骤")

    try:
        _assert_auto_repair_allowed(run, policy_snapshot)
        patch = build_repair_patch(script, run, policy_snapshot)
        _assert_patch_auto_applicable(run, patch)
        request = RunScriptRequest(
            script=patch["patched_script"],
            step_ids=failed_step_ids,
            project_id=options.get("project_id"),
            environment_id=options.get("environment_id"),
            environment_snapshot=environment_snapshot,
            project_policy_snapshot=policy_snapshot,
            base_url=options.get("base_url") or script.base_url,
            global_headers={},
            timeout_ms=options.get("timeout_ms") or 30000,
            run_timeout_ms=options.get("run_timeout_ms"),
            max_steps=options.get("max_steps"),
            continue_on_failure=options.get("continue_on_failure", True),
            replace_run_id=run_id,
        )
        policy_decision = _assert_policy_allowed(request, step_ids=failed_step_ids)
        report = await run_all_steps(
            request.script,
            base_url=request.base_url,
            global_headers=request.global_headers,
            timeout_ms=request.timeout_ms,
            max_steps=request.max_steps,
            continue_on_failure=request.continue_on_failure,
            step_ids=request.step_ids,
        )
        report["run_id"] = run_id
        report["case_name"] = request.script.name
        report["mode"] = "auto_repair_rerun"
        report["script"] = request.script.model_dump()
        report["execution_options"] = _execution_options(request, policy_decision)
        report = _merge_partial_run_report(run, report, request.script)
        report = _append_repair_summary(run, report, patch, failed_step_ids, policy_decision)
        saved_report = _save_run_report(report)
        _save_policy_audit("auto_repair_rerun", policy_decision, run_id=run_id)
        if saved_report.get("failed"):
            _save_automation_task(
                "manual_review",
                saved_report,
                policy_decision,
                reason="自动修复重跑后仍有失败步骤，需要人工确认参数、环境或断言。",
                summary=saved_report.get("automation_summary") or {},
            )
        return saved_report
    except ValueError as exc:
        decision = _decision_from_run(run, risk_level="blocked", reason=str(exc))
        _save_automation_task("manual_review", run, decision, reason=str(exc))
        _save_policy_audit("auto_repair_blocked", decision, run_id=run_id)
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/runs/single-step", response_model=APIStepRunResult)
async def run_single_step_endpoint(request: RunScriptRequest):
    try:
        policy_decision = _assert_policy_allowed(request, step_id=request.step_id)
        result = await run_single_step(
            request.script,
            step_id=request.step_id,
            base_url=request.base_url,
            global_headers=request.global_headers,
            timeout_ms=request.timeout_ms,
        )
        saved_report = _save_run_report(_single_step_report(request.script, result, _execution_options(request, policy_decision)))
        return (saved_report.get("results") or [result])[0]
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/runs", response_model=APIRunReport)
async def run_all_steps_endpoint(request: RunScriptRequest):
    try:
        if request.replace_run_id and not api_execution_store.get_run(request.replace_run_id):
            raise HTTPException(status_code=404, detail="要更新的执行历史不存在")
        policy_decision = _assert_policy_allowed(request, step_ids=request.step_ids)
        report = await run_all_steps(
            request.script,
            base_url=request.base_url,
            global_headers=request.global_headers,
            timeout_ms=request.timeout_ms,
            max_steps=request.max_steps,
            continue_on_failure=request.continue_on_failure,
            step_ids=request.step_ids,
        )
        report["case_name"] = request.script.name
        report["mode"] = "batch"
        report["script"] = request.script.model_dump()
        report["execution_options"] = _execution_options(request, policy_decision)
        if request.replace_run_id:
            report["run_id"] = request.replace_run_id
            if request.step_ids:
                existing = api_execution_store.get_run(request.replace_run_id) or {}
                report = _merge_partial_run_report(existing, report, request.script)
        return _save_run_report(report)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.post("/runs/async", response_model=CreateRunResponse)
async def create_background_run(request: RunScriptRequest):
    try:
        policy_decision = _assert_policy_allowed(request)
        queued_run = enqueue_run(request, _execution_options(request, policy_decision), policy_decision)
        return {"run_id": queued_run["run_id"], "status": queued_run["status"]}
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@router.get("/runs", response_model=APIRunHistoryResponse)
async def list_run_history(
    limit: int = 20,
    status: str | None = None,
    keyword: str | None = None,
    project_id: str | None = None,
):
    safe_limit = max(1, min(limit, 50))
    safe_status = status if status in {"queued", "running", "passed", "failed", "cancelled"} else None
    return {"runs": api_execution_store.list_runs(safe_limit, safe_status, keyword, project_id)}


@router.get("/cases/{case_id}/runs", response_model=APIRunHistoryResponse)
async def list_case_runs(case_id: str, limit: int = 20):
    safe_limit = max(1, min(limit, 50))
    return {"runs": api_execution_store.list_runs(safe_limit, keyword=case_id)}


@router.get("/runs/{run_id}", response_model=APIRunReport)
async def get_run_report(run_id: str):
    run = api_execution_store.get_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="执行历史不存在")
    return run


@router.post("/runs/{run_id}/cancel", response_model=APIRunReport)
async def cancel_background_run(run_id: str):
    run = cancel_run(run_id)
    if not run:
        raise HTTPException(status_code=404, detail="执行历史不存在")
    return run


@router.delete("/runs/{run_id}")
async def delete_run_history(run_id: str):
    run = api_execution_store.get_run(run_id)
    if run and run.get("status") in {"queued", "running"}:
        cancel_run(run_id)
    if not api_execution_store.delete_run(run_id):
        raise HTTPException(status_code=404, detail="执行历史不存在")
    return {"deleted": True}


@router.post("/export/pytest")
async def export_pytest_script(request: ExportScriptRequest):
    content = generate_pytest_script(request.script)
    filename = _safe_export_filename("api-test-script", "py")
    return Response(
        content=content,
        media_type="text/x-python; charset=utf-8",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


@router.post("/export/postman")
async def export_postman_collection(request: ExportScriptRequest):
    content = json.dumps(generate_postman_collection(request.script), ensure_ascii=False, indent=2)
    filename = _safe_export_filename("api-postman-collection", "json")
    return Response(
        content=content,
        media_type="application/json; charset=utf-8",
        headers={"Content-Disposition": _content_disposition(filename)},
    )


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


def _content_hash(content: bytes) -> str:
    return hashlib.sha256(content).hexdigest()


def _single_step_report(script: APITestCaseDsl, result: dict[str, Any], execution_options: dict[str, Any]) -> dict[str, Any]:
    passed = 1 if result.get("status") == "passed" else 0
    failed = 0 if passed else 1
    return {
        "case_id": script.case_id,
        "target_project": script.target_project,
        "case_name": script.name,
        "mode": "single",
        "script": script.model_dump(),
        "execution_options": execution_options,
        "status": result.get("status", "failed"),
        "duration_ms": result.get("duration_ms", 0),
        "total": 1,
        "passed": passed,
        "failed": failed,
        "skipped": 0,
        "results": [result],
    }


def _save_run_report(report: dict[str, Any]) -> dict[str, Any]:
    script = _script_from_report(report)
    if script:
        report = enrich_run_report(report, script)
    saved = {
        **report,
        "run_id": report.get("run_id") or str(uuid.uuid4()),
        "run_at": _now_iso(),
    }
    api_execution_store.save_run(saved)
    _save_unified_automation_records(saved)
    _save_knowledge_ingest_candidate(saved)
    return saved


def _merge_partial_run_report(
    existing: dict[str, Any],
    partial: dict[str, Any],
    script: APITestCaseDsl,
) -> dict[str, Any]:
    old_results = existing.get("results") or []
    new_results = partial.get("results") or []
    results_by_step = {
        str(result.get("step_id")): result
        for result in old_results
        if result.get("step_id")
    }
    for result in new_results:
        if result.get("step_id"):
            results_by_step[str(result.get("step_id"))] = result

    ordered_results = []
    seen_step_ids: set[str] = set()
    for step in script.steps or []:
        result = results_by_step.get(step.id)
        if result:
            ordered_results.append(result)
            seen_step_ids.add(step.id)
    ordered_results.extend(
        result
        for step_id, result in results_by_step.items()
        if step_id not in seen_step_ids
    )

    passed = sum(1 for result in ordered_results if result.get("status") == "passed")
    failed = len(ordered_results) - passed
    skipped = max(len(script.steps or []) - len(ordered_results), 0)
    return {
        **existing,
        **partial,
        "script": script.model_dump(),
        "results": ordered_results,
        "total": len(ordered_results),
        "passed": passed,
        "failed": failed,
        "skipped": skipped,
        "status": "passed" if failed == 0 and skipped == 0 else "failed",
        "failure_reason": None,
        "failure_diagnostics": [],
        "repair_suggestions": [],
    }


def _script_from_report(report: dict[str, Any]) -> APITestCaseDsl | None:
    script = report.get("script")
    if isinstance(script, APITestCaseDsl):
        return script
    if isinstance(script, dict):
        try:
            return APITestCaseDsl(**script)
        except Exception:
            return None
    return None


def _assert_policy_allowed(
    request: RunScriptRequest,
    *,
    step_id: str | None = None,
    step_ids: list[str] | None = None,
) -> dict[str, Any]:
    try:
        decision = assert_execution_allowed(
            request.script,
            step_id=step_id,
            step_ids=step_ids,
            project_id=request.project_id,
            environment_id=request.environment_id,
            project_policy_snapshot=request.project_policy_snapshot,
            environment_snapshot=request.environment_snapshot,
        )
        _save_policy_audit("execute", decision)
        return decision
    except ValueError as exc:
        decision = {
            "allowed": False,
            "risk_level": "blocked",
            "violations": [str(exc)],
            "project_id": request.project_id or request.project_policy_snapshot.get("project_id", ""),
            "environment_id": request.environment_id or request.environment_snapshot.get("environment_id", ""),
            "evaluated_steps": [f"{step.method} {step.path}" for step in request.script.steps],
        }
        _save_policy_audit("execute_blocked", decision)
        raise


def _save_policy_audit(action: str, decision: dict[str, Any], run_id: str | None = None) -> dict[str, Any]:
    audit = {
        "audit_id": str(uuid.uuid4()),
        "created_at": _now_iso(),
        "action": action,
        "run_id": run_id,
        "project_id": decision.get("project_id", ""),
        "environment_id": decision.get("environment_id", ""),
        "trigger_source": decision.get("trigger_source", "manual"),
        "decision": decision,
        "approved": decision.get("allowed", False),
        "approval_note": "系统策略自动判定",
    }
    return api_execution_store.save_policy_audit(audit)


def _save_unified_automation_records(run: dict[str, Any]) -> None:
    now = _now_iso()
    options = run.get("execution_options") or {}
    script = run.get("script") or {}
    definition_id = f"api:{run.get('case_id') or script.get('case_id') or run.get('run_id')}"
    automation_run_id = f"api-run:{run.get('run_id')}"
    api_execution_store.save_automation_definition(
        {
            "definition_id": definition_id,
            "automation_type": "api",
            "name": run.get("case_name") or script.get("name") or run.get("case_id") or "API 自动化用例",
            "project_id": options.get("project_id", ""),
            "source_id": run.get("case_id") or script.get("case_id", ""),
            "status": "active",
            "policy_snapshot": options.get("project_policy_snapshot") or {},
            "created_at": run.get("run_at") or now,
            "updated_at": now,
        }
    )
    api_execution_store.save_automation_run(
        {
            "automation_run_id": automation_run_id,
            "automation_type": "api",
            "source_run_id": run.get("run_id", ""),
            "definition_id": definition_id,
            "project_id": options.get("project_id", ""),
            "environment_id": options.get("environment_id", ""),
            "status": run.get("status", ""),
            "run_at": run.get("run_at") or now,
            "summary": _run_result_summary(run),
            "policy_snapshot": options.get("project_policy_snapshot") or {},
        }
    )
    for stage, status in _stage_events_from_run(run):
        api_execution_store.save_run_stage_event(
            {
                "event_id": f"{automation_run_id}:{stage}",
                "automation_run_id": automation_run_id,
                "stage": stage,
                "status": status,
                "created_at": now,
                "detail": _run_result_summary(run) if stage == "summary" else {},
            }
        )
    api_execution_store.save_artifact_meta(
        {
            "artifact_id": f"{automation_run_id}:report-json",
            "automation_run_id": automation_run_id,
            "artifact_type": "report_json",
            "name": f"{run.get('case_name') or run.get('case_id') or 'api-run'} 报告",
            "created_at": now,
            "metadata": {
                "source_run_id": run.get("run_id"),
                "result_count": len(run.get("results") or []),
                "has_repair_history": bool(run.get("repair_history")),
            },
        }
    )


def _stage_events_from_run(run: dict[str, Any]) -> list[tuple[str, str]]:
    events = [("queued", "passed"), ("policy_check", "passed"), ("execute", run.get("status", "unknown")), ("summary", "passed")]
    if run.get("repair_history"):
        events.append(("auto_repair", run.get("status", "unknown")))
    return events


def _save_knowledge_ingest_candidate(run: dict[str, Any]) -> None:
    run_id = run.get("run_id")
    if not run_id:
        return
    decision = {
        "allowed": False,
        "risk_level": _knowledge_candidate_risk(run),
        "project_id": (run.get("execution_options") or {}).get("project_id", ""),
        "environment_id": (run.get("execution_options") or {}).get("environment_id", ""),
        "trigger_source": "run_completed",
    }
    api_execution_store.save_automation_task(
        {
            "task_id": f"knowledge-candidate:{run_id}",
            "created_at": _now_iso(),
            "updated_at": _now_iso(),
            "task_type": "knowledge_ingest_candidate",
            "status": "pending",
            "run_id": run_id,
            "project_id": decision["project_id"],
            "environment_id": decision["environment_id"],
            "risk_level": decision["risk_level"],
            "reason": _knowledge_candidate_reason(run),
            "summary": {
                "status": run.get("status", ""),
                "passed": run.get("passed", 0),
                "failed": run.get("failed", 0),
                "has_repair_history": bool(run.get("repair_history")),
                "candidate_item_count": len(build_run_knowledge_items(run)),
            },
            "decision": decision,
            "result_run_id": None,
            "resolved_at": None,
            "resolution_note": "",
        }
    )


def _knowledge_candidate_risk(run: dict[str, Any]) -> str:
    if run.get("repair_history"):
        return "medium"
    if run.get("status") == "passed":
        return "low"
    return "medium"


def _knowledge_candidate_reason(run: dict[str, Any]) -> str:
    if run.get("repair_history"):
        return "执行包含自动修复历史，请确认修复有效后再沉淀到知识库/向量库"
    if run.get("status") == "passed":
        return "执行已通过，可确认沉淀为接口覆盖与运行摘要知识"
    return "执行失败，请确认失败原因有效后再沉淀，避免污染 AI 修复知识"


async def _ingest_single_run_to_knowledge(request: Request, run: dict[str, Any]) -> dict[str, Any]:
    ingested_at = _now_iso()
    graph_ops = getattr(request.app.state, "graph_ops", None)
    vector_ops = getattr(request.app.state, "vector_ops", None)
    llm_client = getattr(request.app.state, "llm_client", None)
    response = {
        "ingested_at": ingested_at,
        "run_count": 0,
        "knowledge_count": 0,
        "graph_written": 0,
        "vector_written": 0,
        "graph_available": graph_ops is not None,
        "vector_available": vector_ops is not None and llm_client is not None,
        "errors": [],
    }
    try:
        _save_unified_automation_records(run)
        for item in build_run_knowledge_items(run):
            api_execution_store.save_knowledge_item(item)
            response["knowledge_count"] += 1
            if vector_ops is not None and llm_client is not None:
                response["vector_written"] += await _index_knowledge_item(vector_ops, llm_client, item)
        if graph_ops is not None:
            response["graph_written"] += await write_run_to_graph(graph_ops, run)
        response["run_count"] += 1
    except Exception as exc:
        response["errors"].append(f"{run.get('run_id', '<unknown>')}: {exc}")
    return response


async def _index_knowledge_item(vector_ops: Any, llm_client: Any, item: dict[str, Any]) -> int:
    try:
        embedding = await _generate_embedding(llm_client, _knowledge_item_text(item))
        ok = await vector_ops.create_document_chunk(
            doc_type="api_execution_knowledge",
            module=item.get("project_id", "") or "api_execution",
            filename=item.get("knowledge_id", ""),
            chunk_index=0,
            content=_knowledge_item_text(item),
            section_path=item.get("source_run_id", ""),
            page_label=None,
            sheet_name=None,
            slide_label=None,
            block_type=item.get("item_type", ""),
            embedding=embedding,
        )
        return 1 if ok else 0
    except Exception:
        return 0


async def _search_historical_repair_context(
    request: Request,
    query: str,
    *,
    project_id: str = "",
    top_k: int = 3,
) -> list[dict[str, Any]]:
    vector_ops = getattr(request.app.state, "vector_ops", None)
    llm_client = getattr(request.app.state, "llm_client", None)
    if vector_ops is not None and llm_client is not None and query.strip():
        try:
            embedding = await _generate_embedding(llm_client, query)
            vector_results = await vector_ops.similarity_search(
                embedding,
                top_k=top_k,
                filters={"doc_type": "api_execution_knowledge"},
            )
            items = [_knowledge_item_from_vector(result) for result in vector_results]
            filtered = [
                item
                for item in items
                if item.get("item_type") in {"api_repair", "api_failure"}
                and (not project_id or item.get("project_id") in {"", project_id})
            ]
            if filtered:
                return filtered[:top_k]
        except Exception:
            pass
    return _search_local_repair_knowledge(query, project_id=project_id, top_k=top_k)


def _search_local_repair_knowledge(query: str, *, project_id: str = "", top_k: int = 3) -> list[dict[str, Any]]:
    tokens = [token for token in query.lower().replace("/", " ").replace("_", " ").split() if token]
    candidates = [
        item
        for item in api_execution_store.list_knowledge_items(limit=200)
        if item.get("item_type") in {"api_repair", "api_failure"}
        and (not project_id or item.get("project_id") in {"", project_id})
    ]
    scored = []
    for item in candidates:
        text = _knowledge_item_text(item).lower()
        score = sum(1 for token in tokens if token in text)
        if score or not tokens:
            scored.append((score, item))
    scored.sort(key=lambda pair: (pair[0], pair[1].get("created_at", "")), reverse=True)
    return [item for _score, item in scored[:top_k]]


async def _generate_embedding(llm_client: Any, text: str) -> list[float]:
    model_name = settings.EMBEDDING_MODEL or "text-embedding-3-small"
    kwargs = {
        "model": model_name,
        "input": text[:6000],
    }
    if settings.EMBEDDING_DIM and "text-embedding-3" in model_name:
        kwargs["dimensions"] = settings.EMBEDDING_DIM
    response = await llm_client.embeddings.create(**kwargs)
    return response.data[0].embedding


def _knowledge_item_text(item: dict[str, Any]) -> str:
    return json.dumps(
        {
            "type": item.get("item_type", ""),
            "summary": item.get("summary", ""),
            "payload": item.get("payload") or {},
        },
        ensure_ascii=False,
    )


def _knowledge_item_from_vector(result: dict[str, Any]) -> dict[str, Any]:
    item_type = result.get("block_type", "")
    project_id = result.get("module", "")
    source_run_id = result.get("section_path", "")
    content = result.get("content", "")
    payload: dict[str, Any] = {}
    summary = content
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            summary = str(parsed.get("summary") or content)
            payload = parsed.get("payload") or {}
            item_type = item_type or str(parsed.get("type") or "")
    except Exception:
        pass
    return {
        "knowledge_id": result.get("filename", ""),
        "item_type": item_type,
        "source_run_id": source_run_id,
        "project_id": project_id,
        "created_at": "",
        "summary": summary,
        "payload": payload,
    }


def _repair_context_query(script: APITestCaseDsl, report: dict[str, Any]) -> str:
    failed_results = [
        result
        for result in report.get("results", []) or []
        if result.get("status") != "passed"
    ]
    failed_step_ids = {str(result.get("step_id")) for result in failed_results if result.get("step_id")}
    failed_steps = [
        step
        for step in script.steps or []
        if not failed_step_ids or step.id in failed_step_ids
    ]
    return json.dumps(
        {
            "case": script.name,
            "failed_steps": [
                {
                    "id": step.id,
                    "method": step.method,
                    "path": step.path,
                    "operation_id": step.operation_id,
                }
                for step in failed_steps
            ],
            "errors": [
                {
                    "step_id": result.get("step_id"),
                    "status_code": result.get("status_code"),
                    "error": result.get("error"),
                    "assertions": result.get("assertions", []),
                }
                for result in failed_results
            ],
        },
        ensure_ascii=False,
    )


def _enqueue_scheduled_project(project: dict[str, Any], triggered_at: str) -> dict[str, Any]:
    project_id = project.get("project_id", "")
    project_name = project.get("name", "")
    if not project.get("enabled", True):
        return _automation_item(project_id, project_name, "skipped", reason="项目已停用")
    if not project.get("allow_scheduled_execution"):
        return _automation_item(project_id, project_name, "skipped", reason="项目未开启定时执行")
    if not project.get("allow_ai_execution"):
        return _automation_item(project_id, project_name, "blocked", reason="项目未开启 AI 自动执行")

    environment = api_execution_store.get_environment(project.get("default_environment_id", ""))
    if not environment or not environment.get("enabled", True):
        return _automation_item(project_id, project_name, "blocked", reason="默认环境不存在或已停用")

    script_payload = project.get("auto_generated_dsl") or _generate_project_dsl(project)
    if not script_payload:
        return _automation_item(project_id, project_name, "blocked", reason="项目缺少可执行 DSL 或接口资产")

    script = APITestCaseDsl(**script_payload)
    request = RunScriptRequest(
        script=script,
        project_id=project_id,
        environment_id=environment.get("environment_id"),
        environment_snapshot=_environment_snapshot(environment),
        project_policy_snapshot=_project_policy_snapshot(project),
        base_url=environment.get("base_url") or script.base_url,
        global_headers=environment.get("headers") or {},
        timeout_ms=int(environment.get("timeout_ms") or 30000),
        run_timeout_ms=None,
        max_steps=project.get("max_requests_per_run") or None,
        continue_on_failure=environment.get("continue_on_failure", True),
    )
    try:
        policy_decision = _assert_policy_allowed(request)
        run = enqueue_run(request, _execution_options(request, policy_decision), policy_decision)
        api_execution_store.save_project({**project, "last_scheduled_run_at": triggered_at, "updated_at": triggered_at})
        _save_policy_audit("scheduled_run", policy_decision, run_id=run.get("run_id"))
        return _automation_item(project_id, project_name, "queued", run_id=run.get("run_id"))
    except ValueError as exc:
        decision = {
            "allowed": False,
            "risk_level": "blocked",
            "violations": [str(exc)],
            "project_id": project_id,
            "environment_id": environment.get("environment_id", ""),
            "trigger_source": "scheduled",
        }
        _save_automation_task("scheduled_run_review", {"run_id": None, "execution_options": {"project_id": project_id}}, decision, reason=str(exc))
        return _automation_item(project_id, project_name, "blocked", reason=str(exc))


def _sync_project_spec_dsl(project: dict[str, Any], triggered_at: str) -> dict[str, Any]:
    project_id = project.get("project_id", "")
    project_name = project.get("name", "")
    if not project.get("enabled", True):
        return _spec_sync_item(project_id, project_name, "skipped", reason="项目已停用")
    if not project.get("allow_ai_generate_dsl", True):
        return _spec_sync_item(project_id, project_name, "skipped", reason="项目未开启 AI 自动生成 DSL")

    spec = _latest_project_spec(project)
    if not spec:
        return _spec_sync_item(project_id, project_name, "skipped", reason="项目未绑定接口资产")

    content_hash = spec.get("content_hash", "")
    if content_hash and project.get("last_spec_content_hash") == content_hash and project.get("auto_generated_dsl"):
        return _spec_sync_item(
            project_id,
            project_name,
            "unchanged",
            spec_id=spec.get("spec_id", ""),
            operation_count=spec.get("operation_count", 0),
            reason="接口资产未变化",
        )

    try:
        dsl = _generate_project_dsl({**project, "spec_id": spec.get("spec_id")}, spec=spec)
    except ValueError as exc:
        return _spec_sync_item(project_id, project_name, "blocked", spec_id=spec.get("spec_id", ""), reason=str(exc))

    api_execution_store.save_project(
        {
            **project,
            "spec_id": spec.get("spec_id"),
            "last_spec_content_hash": content_hash,
            "last_dsl_generated_at": triggered_at,
            "auto_generated_dsl": dsl,
            "updated_at": triggered_at,
        }
    )
    return _spec_sync_item(
        project_id,
        project_name,
        "updated",
        spec_id=spec.get("spec_id", ""),
        operation_count=len(dsl.get("steps") or []),
    )


def _generate_project_dsl(project: dict[str, Any], spec: dict[str, Any] | None = None) -> dict[str, Any] | None:
    spec = spec or api_execution_store.get_spec(project.get("spec_id", ""))
    if not spec:
        return None
    operation_ids = _project_operation_ids(project, spec)
    dsl = generate_api_dsl(spec, operation_ids)
    dsl["target_project"] = project.get("name") or dsl.get("target_project", "")
    return dsl


def _project_operation_ids(project: dict[str, Any], spec: dict[str, Any]) -> list[str]:
    operations = spec.get("operations") or []
    allowlist = set(project.get("operation_allowlist") or [])
    if allowlist:
        return [
            operation.get("id")
            for operation in operations
            if operation.get("id") in allowlist
        ]
    return [
        operation.get("id")
        for operation in operations
        if str(operation.get("method", "")).upper() in {"GET", "HEAD"}
    ]


def _latest_project_spec(project: dict[str, Any]) -> dict[str, Any] | None:
    current = api_execution_store.get_spec(project.get("spec_id", ""))
    source_url = current.get("source_url") if current else ""
    if source_url:
        return api_execution_store.get_latest_spec_by_source_url(source_url) or current
    return current


def _environment_snapshot(environment: dict[str, Any]) -> dict[str, Any]:
    return {
        "environment_id": environment.get("environment_id", ""),
        "project_id": environment.get("project_id", ""),
        "name": environment.get("name", ""),
        "environment_type": environment.get("environment_type", "test"),
        "base_url": environment.get("base_url", ""),
        "headers": environment.get("headers", {}),
        "variables": environment.get("variables", {}),
        "timeout_ms": environment.get("timeout_ms", 30000),
        "continue_on_failure": environment.get("continue_on_failure", True),
    }


def _project_policy_snapshot(project: dict[str, Any]) -> dict[str, Any]:
    keys = {
        "project_id",
        "name",
        "allow_ai_execution",
        "allow_ai_repair",
        "allow_scheduled_execution",
        "allow_ai_generate_dsl",
        "allow_overwrite_history",
        "max_auto_repairs",
        "max_reruns",
        "max_requests_per_run",
        "risk_overrides",
        "operation_allowlist",
        "operation_blocklist",
    }
    return {key: project.get(key) for key in keys if key in project}


def _automation_item(project_id: str, project_name: str, status: str, *, run_id: str | None = None, reason: str = "") -> dict[str, Any]:
    return {
        "project_id": project_id,
        "project_name": project_name,
        "status": status,
        "run_id": run_id,
        "reason": reason,
    }


def _spec_sync_item(
    project_id: str,
    project_name: str,
    status: str,
    *,
    spec_id: str = "",
    operation_count: int = 0,
    reason: str = "",
) -> dict[str, Any]:
    return {
        "project_id": project_id,
        "project_name": project_name,
        "status": status,
        "spec_id": spec_id,
        "operation_count": operation_count,
        "reason": reason,
    }


def _assert_auto_repair_allowed(run: dict[str, Any], policy_snapshot: dict[str, Any]) -> None:
    if not policy_snapshot.get("allow_ai_execution"):
        raise ValueError("项目未开启 AI 自动执行，自动修复重跑已进入人工待处理")
    if not policy_snapshot.get("allow_ai_repair"):
        raise ValueError("项目未开启 AI 自动修复，自动修复重跑已进入人工待处理")
    if policy_snapshot.get("allow_overwrite_history") is False:
        raise ValueError("项目策略禁止覆盖更新历史记录，自动修复重跑已进入人工待处理")

    max_auto_repairs = int(policy_snapshot.get("max_auto_repairs") or 0)
    repair_count = len(run.get("repair_history") or [])
    if max_auto_repairs > 0 and repair_count >= max_auto_repairs:
        raise ValueError(f"自动修复次数已达到项目上限 {max_auto_repairs} 次")


def _assert_patch_auto_applicable(run: dict[str, Any], patch: dict[str, Any]) -> None:
    if not patch.get("patch_operations"):
        raise ValueError("AI 未找到可自动应用的安全修复补丁")
    if not patch.get("automatic_applicable"):
        raise ValueError("AI 修复补丁需要人工确认，已进入待处理队列")
    if patch.get("risk_level") != "low":
        raise ValueError(f"AI 修复补丁风险等级为 {patch.get('risk_level') or 'unknown'}，不能无人值守重跑")
    unsafe_ops = [
        op
        for op in patch.get("patch_operations", []) or []
        if not op.get("safe_to_apply")
    ]
    if unsafe_ops:
        raise ValueError("AI 修复补丁包含需要人工确认的修改，已进入待处理队列")

    decision = ((run.get("execution_options") or {}).get("policy_decision") or {})
    if decision.get("risk_level") and decision.get("risk_level") != "low":
        raise ValueError(f"原执行风险等级为 {decision.get('risk_level')}，不能无人值守自动修复")


def _append_repair_summary(
    previous: dict[str, Any],
    updated: dict[str, Any],
    patch: dict[str, Any],
    failed_step_ids: list[str],
    policy_decision: dict[str, Any],
) -> dict[str, Any]:
    before = _run_result_summary(previous)
    after = _run_result_summary(updated)
    summary = {
        "type": "auto_repair_rerun",
        "created_at": _now_iso(),
        "before": before,
        "after": after,
        "failed_step_ids": failed_step_ids,
        "patched_fields": [
            {
                "step_id": op.get("step_id"),
                "field": op.get("field"),
                "reason": op.get("reason"),
            }
            for op in patch.get("patch_operations", []) or []
        ],
        "status_changed": before.get("status") != after.get("status"),
        "failed_delta": int(after.get("failed") or 0) - int(before.get("failed") or 0),
        "risk_level": policy_decision.get("risk_level", patch.get("risk_level", "low")),
    }
    repair_history = [*(previous.get("repair_history") or []), summary]
    return {
        **updated,
        "automation_summary": summary,
        "repair_history": repair_history[-10:],
    }


def _run_result_summary(report: dict[str, Any]) -> dict[str, Any]:
    return {
        "status": report.get("status", ""),
        "total": report.get("total", 0),
        "passed": report.get("passed", 0),
        "failed": report.get("failed", 0),
        "skipped": report.get("skipped", 0),
        "duration_ms": report.get("duration_ms", 0),
        "run_at": report.get("run_at") or report.get("finished_at") or "",
    }


def _save_automation_task(
    task_type: str,
    run: dict[str, Any],
    decision: dict[str, Any],
    *,
    reason: str,
    summary: dict[str, Any] | None = None,
) -> dict[str, Any]:
    now = _now_iso()
    task = {
        "task_id": str(uuid.uuid4()),
        "created_at": now,
        "updated_at": now,
        "task_type": task_type,
        "status": "pending",
        "run_id": run.get("run_id"),
        "project_id": decision.get("project_id") or ((run.get("execution_options") or {}).get("project_id") or ""),
        "environment_id": decision.get("environment_id") or ((run.get("execution_options") or {}).get("environment_id") or ""),
        "risk_level": decision.get("risk_level", "medium"),
        "reason": reason,
        "summary": summary or _run_result_summary(run),
        "decision": decision,
        "result_run_id": None,
        "resolved_at": None,
        "resolution_note": "",
    }
    return api_execution_store.save_automation_task(task)


def _decision_from_run(run: dict[str, Any], *, risk_level: str, reason: str) -> dict[str, Any]:
    options = run.get("execution_options") or {}
    decision = options.get("policy_decision") or {}
    return {
        **decision,
        "allowed": False,
        "risk_level": risk_level,
        "violations": [reason],
        "project_id": decision.get("project_id") or options.get("project_id", ""),
        "environment_id": decision.get("environment_id") or options.get("environment_id", ""),
        "trigger_source": "auto_repair",
    }


def _execution_options(request: RunScriptRequest, policy_decision: dict[str, Any] | None = None) -> dict[str, Any]:
    return {
        "project_id": request.project_id,
        "environment_id": request.environment_id,
        "environment_snapshot": request.environment_snapshot,
        "project_policy_snapshot": request.project_policy_snapshot,
        "base_url": request.base_url,
        "timeout_ms": request.timeout_ms,
        "run_timeout_ms": request.run_timeout_ms,
        "max_steps": request.max_steps,
        "step_ids": request.step_ids,
        "continue_on_failure": request.continue_on_failure,
        "has_global_headers": bool(request.global_headers),
        "policy_decision": policy_decision or {},
    }


def _now_iso() -> str:
    return datetime.now(UTC).isoformat().replace("+00:00", "Z")


def _safe_export_filename(prefix: str, suffix: str) -> str:
    return f"{prefix}-{_download_timestamp()}.{suffix}"


def _content_disposition(filename: str) -> str:
    return f'attachment; filename="{filename}"'


def _download_timestamp() -> str:
    return datetime.now(UTC).strftime("%Y%m%d-%H%M%S")


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
