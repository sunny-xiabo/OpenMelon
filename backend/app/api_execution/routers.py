import hashlib
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError
import json
import os
import tempfile
import uuid
from collections import Counter
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

import httpx

from fastapi import APIRouter, File, HTTPException, Request, UploadFile
from fastapi.responses import Response, StreamingResponse
from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.api.logging_service import log_event
from app.api_execution.schemas import (
    APIEnvironmentConfig,
    APIEnvironmentListResponse,
    APIEnvironmentUpsertRequest,
    APIFlowTemplate,
    APIFlowTemplateListResponse,
    APIFlowTemplateUpsertRequest,
    AIDslEnhanceRequest,
    AIFlowDraftRequest,
    AIFlowDraftResponse,
    AIRepairPatchRequest,
    AIPatchResponse,
    AutomationTaskCenterSummaryResponse,
    AutomationTaskListResponse,
    AutomationTaskRecord,
    APIOperationAsset,
    APIProjectConfig,
    APIProjectListResponse,
    APIProjectUpsertRequest,
    PolicyAuditListResponse,
    APITestCaseDsl,
    CreateRunResponse,
    DemoBootstrapResponse,
    ExportScriptRequest,
    GenerateDslRequest,
    KnowledgeIngestResponse,
    KnowledgeCandidateApproveResponse,
    KnowledgeCandidateCreateResponse,
    KnowledgeItem,
    KnowledgeReviewResponse,
    KnowledgeSearchResponse,
    KnowledgeStatusUpdateRequest,
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
    build_flow_draft,
    build_repair_patch,
    build_repair_patch_with_configured_ai,
    enhance_dsl_with_configured_ai,
)
from app.api_execution.storage import api_execution_store
from app.api_execution.diagnostics import enrich_run_report
from app.api_execution.dsl_generator import generate_api_dsl
from app.api_execution.knowledge import build_run_knowledge_items, write_run_to_graph_with_retry, build_graph_write_failure_task
from app.api_execution.exporters.postman_exporter import generate_postman_collection
from app.api_execution.exporters.pytest_exporter import generate_pytest_script
from app.api_execution.policy import assert_execution_allowed
from app.api_execution.run_queue import cancel_run, enqueue_run, subscribe_sse, unsubscribe_sse
from app.api_execution.runner import run_all_steps, run_single_step
from app.api_execution.spec_parser import SUPPORTED_EXTENSIONS, parse_api_description_file, parse_api_description_url
from app.api_execution.utils import execution_options as _execution_options
from app.api_execution.utils import now_iso as _now_iso

router = APIRouter(prefix="/api-execution", tags=["api-execution"])

RUN_STATUSES = ("queued", "running", "passed", "failed", "cancelled")
FLOW_TEMPLATE_DEFINITION_TYPE = "flow_template"
TASK_CENTER_STATUSES = ("pending", "running", "failed", "resolved")
TASK_TYPE_LABELS = {
    "manual_review": "失败待诊断",
    "knowledge_ingest_candidate": "知识待确认",
    "knowledge_write_failure": "知识写入失败",
    "scheduled_run_review": "定时执行待处理",
    "policy_blocked": "策略阻断",
}
TASK_ACTION_BUCKETS = (
    ("failure_diagnosis", "失败待诊断", {"manual_review"}),
    ("knowledge_confirmation", "知识待确认", {"knowledge_ingest_candidate"}),
    ("policy_blocked", "策略阻断", {"policy_blocked", "scheduled_run_review"}),
    ("knowledge_write_failure", "写入失败", {"knowledge_write_failure"}),
    ("scheduled_failure", "定时失败", {"scheduled_run_review"}),
)


def _dashboard_summary(project_id: str | None = None, limit: int = 50) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 200))
    project_filter = project_id.strip() if project_id else None
    runs = api_execution_store.list_runs(limit=safe_limit, project_id=project_filter)
    pending_tasks = api_execution_store.list_automation_tasks(
        limit=200,
        status="pending",
        project_id=project_filter,
    )

    status_counts = {status: 0 for status in RUN_STATUSES}
    total_duration = 0
    duration_count = 0
    failure_reasons: Counter[str] = Counter()
    failure_steps: Counter[str] = Counter()
    template_runs: dict[str, dict[str, Any]] = {}
    recent_failures = []

    for run in runs:
        status = str(run.get("status") or "").lower()
        if status in status_counts:
            status_counts[status] += 1
        duration_ms = _safe_int(run.get("duration_ms"))
        if duration_ms > 0 and status not in {"queued", "running"}:
            total_duration += duration_ms
            duration_count += 1
        template_id = str((run.get("execution_options") or {}).get("flow_template_id") or "").strip()
        if template_id:
            template_name = str((run.get("execution_options") or {}).get("flow_template_name") or template_id).strip() or template_id
            template = template_runs.setdefault(template_id, {
                "template_id": template_id,
                "template_name": template_name,
                "run_count": 0,
                "passed": 0,
                "failed": 0,
                "cancelled": 0,
                "running": 0,
                "queued": 0,
                "total_duration_ms": 0,
                "duration_count": 0,
                "last_run_at": "",
            })
            template["run_count"] += 1
            template[status] = template.get(status, 0) + 1
            if duration_ms > 0 and status not in {"queued", "running"}:
                template["total_duration_ms"] += duration_ms
                template["duration_count"] += 1
            if not template["last_run_at"] or str(run.get("run_at") or "") > template["last_run_at"]:
                template["last_run_at"] = str(run.get("run_at") or "")
        if status == "failed":
            reason = _failure_reason(run)
            failure_reasons[reason] += 1
            for result in run.get("results") or []:
                if result.get("status") != "passed":
                    failure_steps[_failure_step_key(result)] += 1
            recent_failures.append(_run_summary(run))

    total_runs = len(runs)
    passed_count = status_counts["passed"]
    finished_count = sum(status_counts[status] for status in ("passed", "failed", "cancelled"))
    pass_rate = round((passed_count / finished_count) * 100, 1) if finished_count else 0

    return {
        "project_id": project_filter or "",
        "limit": safe_limit,
        "total_runs": total_runs,
        "status_counts": status_counts,
        "pass_rate": pass_rate,
        "average_duration_ms": round(total_duration / duration_count) if duration_count else 0,
        "pending_task_count": len(pending_tasks),
        "failure_reason_top": _counter_items(failure_reasons),
        "failure_step_top": _counter_items(failure_steps),
        "template_stats": [
            {
                "template_id": item["template_id"],
                "template_name": item["template_name"],
                "run_count": item["run_count"],
                "pass_rate": _rate(item["passed"], item["passed"] + item["failed"]),
                "failure_rate": _rate(item["failed"], item["passed"] + item["failed"]),
                "failed_count": item["failed"],
                "average_duration_ms": round(item["total_duration_ms"] / item["duration_count"]) if item["duration_count"] else 0,
                "last_run_at": item["last_run_at"],
            }
            for item in sorted(template_runs.values(), key=lambda entry: (-entry["run_count"], entry["template_name"]))
        ][:5],
        "recent_failures": recent_failures[:10],
        "recent_runs": [_run_summary(run) for run in runs[:20]],
    }


def _task_center_summary(project_id: str | None = None, limit: int = 50) -> dict[str, Any]:
    safe_limit = max(1, min(limit, 200))
    project_filter = project_id.strip() if project_id else None
    tasks_by_status = {
        status: api_execution_store.list_automation_tasks(limit=200, status=status, project_id=project_filter)
        for status in TASK_CENTER_STATUSES
    }
    tasks = [task for status in TASK_CENTER_STATUSES for task in tasks_by_status[status]]

    status_counts = {status: len(tasks_by_status[status]) for status in TASK_CENTER_STATUSES}
    risk_counter: Counter[str] = Counter()
    type_stats: dict[str, dict[str, Any]] = {}
    bucket_stats = {
        bucket: {"bucket": bucket, "label": label, "count": 0, "pending_count": 0, "task_types": set()}
        for bucket, label, _types in TASK_ACTION_BUCKETS
    }

    for task in tasks:
        status = str(task.get("status") or "pending")
        task_type = _normalized_task_type(task)
        risk = str(task.get("risk_level") or "unknown")
        risk_counter[risk] += 1
        type_item = type_stats.setdefault(
            task_type,
            {
                "task_type": task_type,
                "label": TASK_TYPE_LABELS.get(task_type, task_type or "未分类任务"),
                "count": 0,
                "pending_count": 0,
                "failed_count": 0,
                "resolved_count": 0,
            },
        )
        type_item["count"] += 1
        if status == "pending":
            type_item["pending_count"] += 1
        elif status == "failed":
            type_item["failed_count"] += 1
        elif status == "resolved":
            type_item["resolved_count"] += 1

        for bucket, _label, task_types in TASK_ACTION_BUCKETS:
            if task_type not in task_types:
                continue
            bucket_stats[bucket]["count"] += 1
            bucket_stats[bucket]["task_types"].add(task_type)
            if status == "pending":
                bucket_stats[bucket]["pending_count"] += 1

    recent_tasks = sorted(
        tasks,
        key=lambda item: (item.get("updated_at") or item.get("created_at") or ""),
        reverse=True,
    )[:safe_limit]

    return {
        "total_task_count": len(tasks),
        "pending_task_count": status_counts["pending"],
        "failed_task_count": status_counts["failed"],
        "resolved_task_count": status_counts["resolved"],
        "status_counts": status_counts,
        "risk_counts": [{"label": label, "count": count} for label, count in risk_counter.most_common()],
        "type_counts": sorted(type_stats.values(), key=lambda item: (-item["pending_count"], -item["count"], item["label"])),
        "action_buckets": [
            {
                **bucket,
                "task_types": sorted(bucket["task_types"]),
            }
            for bucket in bucket_stats.values()
        ],
        "recent_tasks": recent_tasks,
    }


def _normalized_task_type(task: dict[str, Any]) -> str:
    task_type = str(task.get("task_type") or "").strip()
    decision = task.get("decision") or {}
    if decision.get("allowed") is False and str(decision.get("risk_level") or "") == "blocked":
        return "policy_blocked"
    return task_type or "manual_review"


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except (TypeError, ValueError):
        return 0


def _rate(count: int, total: int) -> float:
    return round((count / total) * 100, 1) if total else 0


def _flow_template_performance(project_id: str | None = None, limit: int = 200) -> dict[str, dict[str, Any]]:
    performance: dict[str, dict[str, Any]] = {}
    for run in api_execution_store.list_runs(limit=limit, project_id=project_id):
        template_id = str((run.get("execution_options") or {}).get("flow_template_id") or "").strip()
        if not template_id:
            continue
        status = str(run.get("status") or "").lower()
        item = performance.setdefault(
            template_id,
            {
                "run_count": 0,
                "passed": 0,
                "failed": 0,
                "cancelled": 0,
                "last_run_at": "",
            },
        )
        item["run_count"] += 1
        if status in {"passed", "failed", "cancelled"}:
            item[status] += 1
        if not item["last_run_at"] or str(run.get("run_at") or "") > item["last_run_at"]:
            item["last_run_at"] = str(run.get("run_at") or "")
    for item in performance.values():
        finished = item["passed"] + item["failed"] + item["cancelled"]
        item["pass_rate"] = round(item["passed"] / finished, 3) if finished else 0
        item["failure_rate"] = round(item["failed"] / finished, 3) if finished else 0
    return performance


def _failure_reason(run: dict[str, Any]) -> str:
    reason = str(run.get("failure_reason") or "").strip()
    if reason:
        return reason
    for result in run.get("results") or []:
        if result.get("status") == "passed":
            continue
        error = str(result.get("error") or "").strip()
        if error:
            return error
        for assertion in result.get("assertions") or []:
            if not assertion.get("passed"):
                message = str(assertion.get("message") or assertion.get("type") or "").strip()
                if message:
                    return message
    return "未知失败"


def _failure_step_key(result: dict[str, Any]) -> str:
    method = str(result.get("method") or "").upper() or "HTTP"
    target = str(result.get("url") or result.get("name") or result.get("step_id") or "未知步骤").strip()
    return f"{method} {target}"


def _counter_items(counter: Counter[str], limit: int = 5) -> list[dict[str, Any]]:
    return [{"label": label, "count": count} for label, count in counter.most_common(limit)]


def _run_summary(run: dict[str, Any]) -> dict[str, Any]:
    options = run.get("execution_options") or {}
    return {
        "run_id": run.get("run_id") or "",
        "run_at": run.get("run_at") or run.get("finished_at") or run.get("started_at") or "",
        "case_id": run.get("case_id") or "",
        "case_name": run.get("case_name") or "",
        "project_id": options.get("project_id") or "",
        "project_name": (options.get("project_policy_snapshot") or {}).get("name") or "",
        "environment_id": options.get("environment_id") or "",
        "environment_name": (options.get("environment_snapshot") or {}).get("name") or "",
        "status": run.get("status") or "",
        "mode": run.get("mode") or "",
        "duration_ms": _safe_int(run.get("duration_ms")),
        "total": _safe_int(run.get("total")),
        "passed": _safe_int(run.get("passed")),
        "failed": _safe_int(run.get("failed")),
        "failure_reason": _failure_reason(run) if run.get("status") == "failed" else "",
    }


def _flow_template_from_definition(definition: dict[str, Any]) -> dict[str, Any]:
    template_id = definition.get("template_id") or definition.get("definition_id", "").replace("flow-template:", "", 1)
    project_id = definition.get("project_id", "")
    return {
        "template_id": template_id,
        "project_id": project_id,
        "name": definition.get("name", ""),
        "description": definition.get("description", ""),
        "tags": definition.get("tags") or [],
        "script": definition.get("script") or {},
        "version": definition.get("version") or "v1",
        "deprecated": bool(definition.get("deprecated", False)),
        "scope": definition.get("scope") or ("项目内" if project_id else "全项目可用"),
        "performance_snapshot": definition.get("performance_snapshot") or _flow_template_performance(project_id or None).get(template_id, {}),
        "created_at": definition.get("created_at", ""),
        "updated_at": definition.get("updated_at", ""),
    }


@router.get("/projects", response_model=APIProjectListResponse)
async def list_projects():
    return {"projects": api_execution_store.list_projects()}


@router.get("/dashboard/summary")
async def get_dashboard_summary(project_id: str | None = None, limit: int = 50):
    return _dashboard_summary(project_id=project_id, limit=limit)


@router.get("/flow-templates", response_model=APIFlowTemplateListResponse)
async def list_flow_templates(project_id: str | None = None, limit: int = 100):
    safe_limit = max(1, min(limit, 200))
    definitions = api_execution_store.list_automation_definitions(
        limit=safe_limit,
        project_id=project_id,
        definition_type=FLOW_TEMPLATE_DEFINITION_TYPE,
    )
    return {"templates": [_flow_template_from_definition(item) for item in definitions]}


@router.post("/flow-templates", response_model=APIFlowTemplate)
async def upsert_flow_template(request: APIFlowTemplateUpsertRequest):
    now = _now_iso()
    template_id = request.template_id or str(uuid.uuid4())
    definition_id = f"flow-template:{template_id}"
    existing = api_execution_store.get_automation_definition(definition_id) or {}
    tags = [tag.strip() for tag in request.tags if tag.strip()]
    name = request.name.strip() or request.script.name or "API 流程模板"
    script = {
        **request.script.model_dump(),
        "flow_template_id": template_id,
        "flow_template_name": name,
        "flow_template_tags": tags,
    }
    definition = {
        **existing,
        "definition_id": definition_id,
        "definition_type": FLOW_TEMPLATE_DEFINITION_TYPE,
        "automation_type": "api",
        "template_id": template_id,
        "project_id": request.project_id.strip(),
        "name": name,
        "description": request.description.strip(),
        "tags": tags,
        "script": script,
        "status": "active",
        "source_id": request.script.case_id,
        "created_at": existing.get("created_at") or now,
        "updated_at": now,
    }
    saved = api_execution_store.save_automation_definition(definition)
    return _flow_template_from_definition(saved)


@router.delete("/flow-templates/{template_id}")
async def delete_flow_template(template_id: str):
    definition_id = template_id if template_id.startswith("flow-template:") else f"flow-template:{template_id}"
    existing = api_execution_store.get_automation_definition(definition_id)
    if not existing or existing.get("definition_type") != FLOW_TEMPLATE_DEFINITION_TYPE:
        raise NotFoundError(message=str("流程模板不存在"))
    if not api_execution_store.delete_automation_definition(definition_id):
        raise NotFoundError(message=str("流程模板不存在"))
    return {"deleted": True}


@router.get("/policy/audits", response_model=PolicyAuditListResponse)
async def list_policy_audits(limit: int = 20, project_id: str | None = None, action: str | None = None):
    safe_limit = max(1, min(limit, 100))
    return {"audits": api_execution_store.list_policy_audits(safe_limit, project_id, action)}


@router.get("/automation/tasks", response_model=AutomationTaskListResponse)
async def list_automation_tasks(limit: int = 20, status: str | None = None, project_id: str | None = None):
    safe_limit = max(1, min(limit, 100))
    safe_status = status if status in {"pending", "running", "resolved", "failed"} else None
    return {"tasks": api_execution_store.list_automation_tasks(safe_limit, safe_status, project_id)}


@router.get("/automation/task-center/summary", response_model=AutomationTaskCenterSummaryResponse)
async def get_task_center_summary(limit: int = 50, project_id: str | None = None):
    return _task_center_summary(project_id=project_id, limit=limit)


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
        raise NotFoundError(message=str("待处理任务不存在"))
    _log_task_event(task, "task_resolved")
    return task


@router.post("/automation/scheduled-runs/trigger", response_model=ScheduledExecutionResponse)
async def trigger_scheduled_runs():
    triggered_at = _now_iso()
    items = []
    for project in api_execution_store.list_projects():
        item = await _enqueue_scheduled_project(project, triggered_at)
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
        raise NotFoundError(message=str("待沉淀候选不存在"))
    if task.get("task_type") != "knowledge_ingest_candidate":
        raise InvalidRequestError(message=str("该待处理项不是知识沉淀候选"))
    run_id = task.get("run_id")
    run = api_execution_store.get_run(run_id) if run_id else None
    if not run:
        raise NotFoundError(message=str("候选关联的执行记录不存在"))

    response = await _ingest_single_run_to_knowledge(request, run)
    now = _now_iso()
    resolved_task = api_execution_store.update_automation_task(
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
    if resolved_task:
        _log_task_event(resolved_task, "knowledge_candidate_approved")
    return {"task_id": task_id, "run_id": run_id, **response}


@router.get("/knowledge/review", response_model=KnowledgeReviewResponse)
async def list_knowledge_review_items(
    limit: int = 50,
    project_id: str | None = None,
    status: str | None = None,
    item_type: str | None = None,
):
    safe_limit = max(1, min(limit, 200))
    items = api_execution_store.list_knowledge_items(limit=200, item_type=item_type)
    if project_id:
        safe_project_id = project_id.strip()
        items = [item for item in items if item.get("project_id", "") in {"", safe_project_id}]
    if status:
        safe_status = status.strip()
        items = [item for item in items if _knowledge_status(item) == safe_status]
    normalized = [_normalize_knowledge_item(item) for item in items[:safe_limit]]
    return {"items": normalized}


@router.patch("/knowledge/items/{knowledge_id}/status", response_model=KnowledgeItem)
async def update_knowledge_item_status(knowledge_id: str, request: KnowledgeStatusUpdateRequest):
    safe_status = request.status.strip()
    if safe_status not in {"active", "invalid", "revoked"}:
        raise InvalidRequestError(message=str("知识状态只支持 active、invalid、revoked"))
    item = _get_knowledge_item(knowledge_id)
    if not item:
        raise NotFoundError(message=str("知识项不存在"))
    now = _now_iso()
    patch = {
        **item,
        "status": safe_status,
        "governance_note": request.note.strip(),
        "updated_at": now,
    }
    if safe_status == "invalid":
        patch["invalidated_at"] = now
        patch["revoked_at"] = None
    elif safe_status == "revoked":
        patch["revoked_at"] = now
        patch["invalidated_at"] = None
    else:
        patch["invalidated_at"] = None
        patch["revoked_at"] = None
    saved = api_execution_store.save_knowledge_item(patch)
    _invalidate_knowledge_index()
    log_event(
        "warning" if safe_status != "active" else "info",
        "knowledge",
        f"knowledge_{safe_status}",
        "知识状态已更新",
        request.note.strip() or f"知识项状态更新为 {safe_status}",
        project_id=saved.get("project_id", ""),
        trace_id=saved.get("source_run_id") or knowledge_id,
        source_id=knowledge_id,
        refs=[saved.get("source_run_id")],
        data=saved,
    )
    return _normalize_knowledge_item(saved)


@router.post("/knowledge/runs/{run_id}/candidate", response_model=KnowledgeCandidateCreateResponse)
async def create_run_knowledge_candidate(run_id: str):
    run = api_execution_store.get_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))
    task = _save_knowledge_ingest_candidate(run, trigger_source="manual_repair_deposit")
    if not task:
        raise InvalidRequestError(message=str("该执行记录暂不能生成知识沉淀候选"))
    summary = task.get("summary") or {}
    return {
        "task_id": task.get("task_id", ""),
        "run_id": run_id,
        "status": task.get("status", "pending"),
        "risk_level": task.get("risk_level", "medium"),
        "reason": task.get("reason", ""),
        "candidate_item_count": summary.get("candidate_item_count", 0),
        "has_repair_history": summary.get("has_repair_history", False),
        "already_resolved": task.get("status") == "resolved",
    }


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
        raise NotFoundError(message=str("API 项目不存在"))
    return project


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    if not api_execution_store.delete_project(project_id):
        raise NotFoundError(message=str("API 项目不存在"))
    return {"deleted": True}


@router.get("/projects/{project_id}/environments", response_model=APIEnvironmentListResponse)
async def list_project_environments(project_id: str):
    if not api_execution_store.get_project(project_id):
        raise NotFoundError(message=str("API 项目不存在"))
    return {"environments": api_execution_store.list_environments(project_id)}


@router.post("/projects/{project_id}/environments", response_model=APIEnvironmentConfig)
async def upsert_project_environment(project_id: str, request: APIEnvironmentUpsertRequest):
    if not api_execution_store.get_project(project_id):
        raise NotFoundError(message=str("API 项目不存在"))
    return _save_environment(project_id, request)


@router.patch("/environments/{environment_id}", response_model=APIEnvironmentConfig)
async def update_environment(environment_id: str, request: APIEnvironmentUpsertRequest):
    existing = api_execution_store.get_environment(environment_id)
    if not existing:
        raise NotFoundError(message=str("API 环境不存在"))
    return _save_environment(existing["project_id"], request, environment_id=environment_id)


@router.delete("/environments/{environment_id}")
async def delete_environment(environment_id: str):
    if not api_execution_store.delete_environment(environment_id):
        raise NotFoundError(message=str("API 环境不存在"))
    return {"deleted": True}


MAX_UPLOAD_SIZE = 10 * 1024 * 1024  # 10MB


@router.post("/openapi/parse-file", response_model=OpenAPIParseResponse)
async def parse_openapi_file(file: UploadFile = File(...)):
    filename = file.filename or ""
    suffix = Path(filename).suffix.lower()
    if suffix not in SUPPORTED_EXTENSIONS:
        raise InvalidRequestError(message=str("仅支持 OpenAPI / Postman / HAR / Markdown / Word / Excel / HTML / TXT / CSV 文件"))

    content = await file.read()
    if not content:
        raise InvalidRequestError(message=str("API 文档文件不能为空"))
    if len(content) > MAX_UPLOAD_SIZE:
        raise InvalidRequestError(message=str("文件大小不能超过 10MB"))

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
        raise InvalidRequestError(message=str(f"API 文档解析失败: {exc}"))from exc
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
        raise InvalidRequestError(message=str(f"OpenAPI URL 获取失败: {exc}"))from exc
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc

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
        raise InvalidRequestError(message=str(f"API 文档解析失败: {exc}"))from exc


@router.get("/demo/openapi", response_model=OpenAPIParseResponse)
async def load_demo_openapi():
    demo_file = Path(__file__).resolve().parents[3] / "docs" / "samples" / "api-flow-demo-openapi.json"
    if not demo_file.exists():
        raise NotFoundError(message=str("Demo OpenAPI 资产不存在"))
    try:
        return _parse_and_store(str(demo_file), filename=demo_file.name)
    except HTTPException:
        raise
    except Exception as exc:
        raise InvalidRequestError(message=str(f"Demo OpenAPI 解析失败: {exc}"))from exc


@router.post("/demo/bootstrap", response_model=DemoBootstrapResponse)
async def bootstrap_demo_project():
    demo_file = Path(__file__).resolve().parents[3] / "docs" / "samples" / "api-flow-demo-openapi.json"
    if not demo_file.exists():
        raise NotFoundError(message=str("Demo OpenAPI 资产不存在"))
    try:
        spec = await run_in_threadpool(lambda: _parse_and_store(str(demo_file), filename=demo_file.name))
        return _seed_demo_project(spec)
    except HTTPException:
        raise
    except Exception as exc:
        raise InvalidRequestError(message=str(f"Demo 项目初始化失败: {exc}"))from exc


@router.get("/specs/{spec_id}/operations", response_model=OperationsResponse)
async def get_spec_operations(spec_id: str):
    spec = api_execution_store.get_spec(spec_id)
    if not spec:
        raise NotFoundError(message=str("OpenAPI 资产不存在"))
    return {
        "spec_id": spec_id,
        "operation_count": spec.get("operation_count", 0),
        "operations": spec.get("operations", []),
    }


@router.post("/dsl/generate", response_model=APITestCaseDsl)
async def generate_dsl(request: GenerateDslRequest):
    spec = api_execution_store.get_spec(request.spec_id)
    if not spec:
        raise NotFoundError(message=str("OpenAPI 资产不存在"))
    try:
        return generate_api_dsl(spec, request.operation_ids)
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


_VALID_ASSERTION_TYPES = {
    "status_code", "status_code_not", "status_code_in", "status_code_not_in",
    "body_contains", "body_not_contains",
    "json_path_exists", "json_path_not_exists", "json_path_equals",
    "header_exists", "header_equals", "header_contains",
    "response_time_lt",
}


@router.post("/dsl/validate")
async def validate_dsl(request: ValidateDslRequest):
    errors: list[str] = []
    script = request.script
    steps = script.steps or []
    if not steps:
        errors.append("脚本至少需要一个步骤")

    known_vars = set(script.variables or {})
    for i, step in enumerate(steps, 1):
        prefix = f"步骤 {i} ({step.id or step.name or 'unknown'})"
        if not step.method:
            errors.append(f"{prefix}: 缺少 HTTP 方法")
        if not step.path:
            errors.append(f"{prefix}: 缺少请求路径")
        for assertion in step.assertions or []:
            if assertion.type not in _VALID_ASSERTION_TYPES:
                errors.append(f"{prefix}: 未知断言类型 '{assertion.type}'")
        for extraction in step.extractions or []:
            if extraction.name:
                known_vars.add(extraction.name)

    valid = len(errors) == 0
    return {
        "valid": valid,
        "case_id": script.case_id,
        "step_count": len(steps),
        "errors": errors,
    }


@router.post("/ai/dsl/enhance", response_model=AIPatchResponse)
async def enhance_dsl_endpoint(request: AIDslEnhanceRequest):
    return await enhance_dsl_with_configured_ai(request.script, request.project_policy_snapshot)


@router.post("/ai/flow-draft", response_model=AIFlowDraftResponse)
async def flow_draft_endpoint(request: AIFlowDraftRequest):
    spec = api_execution_store.get_spec(request.spec_id)
    if not spec:
        raise NotFoundError(message=str("OpenAPI 资产不存在"))
    project_id = str(request.project_policy_snapshot.get("project_id") or "").strip()
    flow_templates = [
        _flow_template_from_definition(item)
        for item in api_execution_store.list_automation_definitions(
            limit=50,
            project_id=project_id or None,
            definition_type=FLOW_TEMPLATE_DEFINITION_TYPE,
        )
    ]
    template_performance = _flow_template_performance(project_id or None)
    flow_templates = [
        {
            **template,
            "performance": template_performance.get(template.get("template_id", ""), {}),
        }
        for template in flow_templates
    ]
    try:
        return build_flow_draft(
            spec,
            request.business_goal,
            request.operation_ids,
            project_name=request.project_name,
            environment_name=request.environment_name,
            base_url=request.base_url,
            flow_templates=flow_templates,
        )
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


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
        raise NotFoundError(message=str("执行历史不存在"))
    script = _script_from_report(run)
    if not script:
        raise InvalidRequestError(message=str("执行历史缺少可修复脚本"))
    if run.get("status") == "passed" or not run.get("failed"):
        raise InvalidRequestError(message=str("当前执行记录没有失败步骤，无需自动修复"))

    options = run.get("execution_options") or {}
    policy_snapshot = options.get("project_policy_snapshot") or {}
    environment_snapshot = options.get("environment_snapshot") or {}
    failed_step_ids = [
        str(result.get("step_id"))
        for result in run.get("results", []) or []
        if result.get("status") != "passed" and result.get("step_id")
    ]
    if not failed_step_ids:
        raise InvalidRequestError(message=str("当前执行记录没有可重跑的失败步骤"))

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
        raise InvalidRequestError(message=str(exc)) from exc


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
        raise InvalidRequestError(message=str(exc)) from exc


@router.post("/runs", response_model=APIRunReport)
async def run_all_steps_endpoint(request: RunScriptRequest):
    try:
        if request.replace_run_id and not api_execution_store.get_run(request.replace_run_id):
            raise NotFoundError(message=str("要更新的执行历史不存在"))
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
            existing = api_execution_store.get_run(request.replace_run_id) or {}
            if request.step_ids:
                report = _merge_partial_run_report(existing, report, request.script)
            if request.script.ai_repair_source:
                report = _append_applied_repair_summary(existing, report, request.script, request.step_ids, policy_decision)
        return _save_run_report(report)
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


@router.post("/runs/async", response_model=CreateRunResponse)
async def create_background_run(request: RunScriptRequest):
    try:
        policy_decision = _assert_policy_allowed(request)
        queued_run = await enqueue_run(request, _execution_options(request, policy_decision), policy_decision)
        return {"run_id": queued_run["run_id"], "status": queued_run["status"]}
    except ValueError as exc:
        raise InvalidRequestError(message=str(exc)) from exc


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
        raise NotFoundError(message=str("执行历史不存在"))
    return run


@router.get("/runs/{run_id}/stream")
async def stream_run_progress(run_id: str):
    run = api_execution_store.get_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))

    if run.get("status") in {"passed", "failed", "cancelled"}:
        async def _final():
            yield _sse_format("finished", {"status": run["status"], "run_id": run_id})
        return StreamingResponse(_final(), media_type="text/event-stream")

    queue = subscribe_sse(run_id)

    async def _stream():
        try:
            yield _sse_format("progress", {
                "progress_total": run.get("progress_total", 0),
                "progress_completed": run.get("progress_completed", 0),
                "current_step_id": run.get("current_step_id"),
                "current_step_name": run.get("current_step_name"),
            })
            while True:
                message = await queue.get()
                if message is None:
                    break
                yield _sse_format(message["event"], message["data"])
        finally:
            unsubscribe_sse(run_id, queue)

    return StreamingResponse(_stream(), media_type="text/event-stream")


def _sse_format(event: str, data: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(data, ensure_ascii=False)}\n\n"


@router.post("/runs/{run_id}/cancel", response_model=APIRunReport)
async def cancel_background_run(run_id: str):
    run = await cancel_run(run_id)
    if not run:
        raise NotFoundError(message=str("执行历史不存在"))
    return run


@router.delete("/runs/{run_id}")
async def delete_run_history(run_id: str):
    run = api_execution_store.get_run(run_id)
    if run and run.get("status") in {"queued", "running"}:
        await cancel_run(run_id)
    if not api_execution_store.delete_run(run_id):
        raise NotFoundError(message=str("执行历史不存在"))
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


DEMO_PROJECT_ID = "demo-api-flow"
DEMO_ENVIRONMENT_ID = "demo-api-flow-local"


def _seed_demo_project(spec: dict[str, Any]) -> dict[str, Any]:
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
    _log_run_event(saved)
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
    saved = api_execution_store.save_policy_audit(audit)
    _log_policy_event(saved)
    return saved


def _log_run_event(run: dict[str, Any]) -> None:
    options = run.get("execution_options") or {}
    status = run.get("status", "")
    level = "error" if status == "failed" else "warning" if status == "cancelled" else "info"
    title = "API 执行失败" if status == "failed" else "API 执行完成"
    log_event(
        level,
        "api_execution",
        f"run_{status or 'unknown'}",
        title,
        run.get("failure_reason") or f"通过 {run.get('passed', 0)} / 失败 {run.get('failed', 0)}",
        project_id=options.get("project_id", ""),
        trace_id=run.get("run_id", ""),
        source_id=run.get("run_id", ""),
        refs=[run.get("case_id"), options.get("environment_id"), options.get("flow_template_id")],
        data={
            "run_id": run.get("run_id"),
            "case_id": run.get("case_id"),
            "case_name": run.get("case_name"),
            "status": status,
            "passed": run.get("passed", 0),
            "failed": run.get("failed", 0),
            "duration_ms": run.get("duration_ms", 0),
        },
    )


def _log_policy_event(audit: dict[str, Any]) -> None:
    allowed = bool(audit.get("approved"))
    decision = audit.get("decision") or {}
    log_event(
        "info" if allowed else "warning",
        "policy",
        audit.get("action", "policy_audit"),
        "策略允许执行" if allowed else "策略需要关注",
        audit.get("approval_note") or "系统策略自动判定",
        project_id=audit.get("project_id", ""),
        trace_id=audit.get("run_id") or audit.get("audit_id", ""),
        source_id=audit.get("audit_id", ""),
        refs=[audit.get("run_id"), audit.get("environment_id")],
        data={"audit_id": audit.get("audit_id"), "decision": decision},
    )


def _log_task_event(task: dict[str, Any], event_type: str = "task_created") -> None:
    log_event(
        "error" if task.get("risk_level") == "blocked" or task.get("status") == "failed" else "warning" if task.get("status") == "pending" else "info",
        "task_center",
        event_type,
        "待处理任务已创建" if event_type == "task_created" else "待处理任务已更新",
        task.get("reason") or task.get("resolution_note") or task.get("task_id", ""),
        project_id=task.get("project_id", ""),
        trace_id=task.get("run_id") or task.get("task_id", ""),
        source_id=task.get("task_id", ""),
        refs=[task.get("run_id"), task.get("environment_id"), task.get("result_run_id")],
        data=task,
    )


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


def _save_knowledge_ingest_candidate(run: dict[str, Any], trigger_source: str = "run_completed") -> dict[str, Any] | None:
    run_id = run.get("run_id")
    if not run_id:
        return None
    task_id = f"knowledge-candidate:{run_id}"
    existing = api_execution_store.get_automation_task(task_id)
    if existing and existing.get("status") == "resolved":
        return existing
    now = _now_iso()
    decision = {
        "allowed": False,
        "risk_level": _knowledge_candidate_risk(run),
        "project_id": (run.get("execution_options") or {}).get("project_id", ""),
        "environment_id": (run.get("execution_options") or {}).get("environment_id", ""),
        "trigger_source": trigger_source,
    }
    task = api_execution_store.save_automation_task(
        {
            "task_id": task_id,
            "created_at": (existing or {}).get("created_at") or now,
            "updated_at": now,
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
                "repair_count": len(run.get("repair_history") or []),
                "automation_summary_type": (run.get("automation_summary") or {}).get("type", ""),
                "candidate_item_count": len(build_run_knowledge_items(run)),
            },
            "decision": decision,
            "result_run_id": None,
            "resolved_at": None,
            "resolution_note": "",
        }
    )
    _log_task_event(task, "knowledge_candidate_created")
    return task


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
        if response["knowledge_count"]:
            _invalidate_knowledge_index()
        if graph_ops is not None:
            graph_result = await write_run_to_graph_with_retry(graph_ops, run)
            if graph_result["success"]:
                response["graph_written"] += graph_result["written"]
            else:
                response["errors"].append(f"图谱写入失败: {graph_result['error']}")
                task = api_execution_store.save_automation_task(
                    build_graph_write_failure_task(run, graph_result["error"], graph_result["attempt"])
                )
                _log_task_event(task, "knowledge_write_failed")
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
                and _vector_knowledge_item_is_active(item)
            ]
            if filtered:
                return filtered[:top_k]
        except Exception:
            pass
    return _search_local_repair_knowledge(query, project_id=project_id, top_k=top_k)


_KNOWLEDGE_INDEX: dict[str, Any] = {"items": None, "index": None, "ts": 0.0}
_KNOWLEDGE_INDEX_TTL = 60.0  # seconds


def _tokenize(text: str) -> list[str]:
    """Normalize text into searchable tokens, stripping punctuation."""
    import re
    cleaned = re.sub(r"[^\w\s]", " ", text)
    return [t for t in cleaned.lower().split() if t]


def _build_knowledge_index() -> tuple[list[dict[str, Any]], dict[str, list[int]]]:
    items = [
        item
        for item in api_execution_store.list_knowledge_items(limit=200)
        if item.get("item_type") in {"api_repair", "api_failure"}
        and _knowledge_status(item) == "active"
    ]
    index: dict[str, list[int]] = {}
    for i, item in enumerate(items):
        text = _knowledge_item_text(item).lower()
        for token in set(_tokenize(text)):
            index.setdefault(token, []).append(i)
    return items, index


def _get_knowledge_index() -> tuple[list[dict[str, Any]], dict[str, list[int]]]:
    import time as _time

    now = _time.monotonic()
    if _KNOWLEDGE_INDEX["items"] is None or now - _KNOWLEDGE_INDEX["ts"] > _KNOWLEDGE_INDEX_TTL:
        items, index = _build_knowledge_index()
        _KNOWLEDGE_INDEX["items"] = items
        _KNOWLEDGE_INDEX["index"] = index
        _KNOWLEDGE_INDEX["ts"] = now
    return _KNOWLEDGE_INDEX["items"], _KNOWLEDGE_INDEX["index"]


def _invalidate_knowledge_index() -> None:
    _KNOWLEDGE_INDEX["items"] = None
    _KNOWLEDGE_INDEX["index"] = None
    _KNOWLEDGE_INDEX["ts"] = 0.0


def _search_local_repair_knowledge(query: str, *, project_id: str = "", top_k: int = 3) -> list[dict[str, Any]]:
    tokens = _tokenize(query)
    items, index = _get_knowledge_index()

    if not tokens:
        filtered = [item for item in items if not project_id or item.get("project_id") in {"", project_id}]
        return filtered[:top_k]

    # score using inverted index: count how many query tokens appear in item text
    # apply project_id filter during scoring to keep indices aligned with the cached list
    candidate_scores: dict[int, int] = {}
    for token in tokens:
        for idx in index.get(token, []):
            if idx < len(items) and (not project_id or items[idx].get("project_id") in {"", project_id}):
                candidate_scores[idx] = candidate_scores.get(idx, 0) + 1

    scored = [
        (score, items[idx])
        for idx, score in candidate_scores.items()
    ]
    scored.sort(key=lambda pair: (pair[0], pair[1].get("created_at", "")), reverse=True)
    return [item for _score, item in scored[:top_k]]


def _get_knowledge_item(knowledge_id: str) -> dict[str, Any] | None:
    for item in api_execution_store.list_knowledge_items(limit=500):
        if item.get("knowledge_id") == knowledge_id:
            return item
    return None


def _vector_knowledge_item_is_active(item: dict[str, Any]) -> bool:
    knowledge_id = item.get("knowledge_id", "")
    if not knowledge_id:
        return True
    local_item = _get_knowledge_item(knowledge_id)
    return not local_item or _knowledge_status(local_item) == "active"


def _knowledge_status(item: dict[str, Any]) -> str:
    status = str(item.get("status") or "active").strip()
    return status if status in {"active", "invalid", "revoked"} else "active"


def _normalize_knowledge_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        **item,
        "status": _knowledge_status(item),
        "invalidated_at": item.get("invalidated_at"),
        "revoked_at": item.get("revoked_at"),
        "governance_note": item.get("governance_note", ""),
    }


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


async def _enqueue_scheduled_project(project: dict[str, Any], triggered_at: str) -> dict[str, Any]:
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
        run = await enqueue_run(request, _execution_options(request, policy_decision), policy_decision)
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
    return [operation.get("id") for operation in operations if operation.get("id")]


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

    # Re-evaluate policy on the patched script instead of reusing the original run's decision
    options = run.get("execution_options") or {}
    patched_script = patch.get("patched_script")
    if patched_script:
        try:
            patched_decision = assert_execution_allowed(
                patched_script,
                project_id=options.get("project_id"),
                environment_id=options.get("environment_id"),
                project_policy_snapshot=options.get("project_policy_snapshot"),
                environment_snapshot=options.get("environment_snapshot"),
            )
            if patched_decision.get("risk_level") and patched_decision.get("risk_level") != "low":
                raise ValueError(f"修复后脚本风险等级为 {patched_decision.get('risk_level')}，不能无人值守自动修复")
        except ValueError:
            raise
        except Exception:
            pass


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
        "repair_effect_score": _repair_outcome_score(before, after, policy_decision.get("risk_level", patch.get("risk_level", "low"))),
    }
    repair_history = [*(previous.get("repair_history") or []), summary]
    return {
        **updated,
        "automation_summary": summary,
        "repair_history": repair_history[-10:],
    }


def _append_applied_repair_summary(
    previous: dict[str, Any],
    updated: dict[str, Any],
    script: APITestCaseDsl,
    rerun_step_ids: list[str],
    policy_decision: dict[str, Any],
) -> dict[str, Any]:
    before = _run_result_summary(previous)
    after = _run_result_summary(updated)
    source_labels = {
        "low_risk_repair": "低风险 AI 修复项",
        "full_repair_draft": "完整 AI 修复草稿",
        "direct_patch": "AI 修复补丁",
    }
    summary = {
        "type": "controlled_repair_rerun",
        "source": script.ai_repair_source,
        "source_label": source_labels.get(script.ai_repair_source, script.ai_repair_source),
        "created_at": _now_iso(),
        "applied_at": script.ai_repair_applied_at,
        "before": before,
        "after": after,
        "failed_step_ids": rerun_step_ids,
        "patched_fields": script.ai_repair_applied_operations or [],
        "status_changed": before.get("status") != after.get("status"),
        "failed_delta": int(after.get("failed") or 0) - int(before.get("failed") or 0),
        "risk_level": policy_decision.get("risk_level", "low"),
        "repair_effect_score": _repair_outcome_score(before, after, policy_decision.get("risk_level", "low")),
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


def _repair_outcome_score(before: dict[str, Any], after: dict[str, Any], risk_level: str = "low") -> dict[str, Any]:
    before_failed = int(before.get("failed") or 0)
    after_failed = int(after.get("failed") or 0)
    score = 50
    if after.get("status") == "passed":
        score += 30
    if before_failed > after_failed:
        score += min(20, (before_failed - after_failed) * 10)
    if after_failed > before_failed:
        score -= min(25, (after_failed - before_failed) * 10)
    if risk_level == "high":
        score -= 15
    elif risk_level == "medium":
        score -= 5
    score = max(0, min(100, score))
    if score >= 80:
        level = "good"
        label = "修复有效"
    elif score >= 60:
        level = "medium"
        label = "部分有效"
    else:
        level = "low"
        label = "需继续排查"
    return {"score": score, "level": level, "label": label}


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
    saved = api_execution_store.save_automation_task(task)
    _log_task_event(saved)
    return saved


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
