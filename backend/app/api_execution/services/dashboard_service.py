from collections import Counter
from typing import Any

from app.api_execution.router_deps import (
    RUN_STATUSES,
    TASK_ACTION_BUCKETS,
    TASK_CENTER_STATUSES,
    TASK_TYPE_LABELS,
)
from app.api_execution.storage import api_execution_store


def get_dashboard_summary_service(project_id: str | None = None, limit: int = 50) -> dict[str, Any]:
    return _dashboard_summary(project_id=project_id, limit=limit)

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


def task_center_summary(project_id: str | None = None, limit: int = 50) -> dict[str, Any]:
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


def flow_template_performance(project_id: str | None = None, limit: int = 200) -> dict[str, dict[str, Any]]:
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


def flow_template_from_definition(definition: dict[str, Any]) -> dict[str, Any]:
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
        "performance_snapshot": definition.get("performance_snapshot") or flow_template_performance(project_id or None).get(template_id, {}),
        "created_at": definition.get("created_at", ""),
        "updated_at": definition.get("updated_at", ""),
    }




__all__ = [name for name in globals() if not name.startswith("__")]
