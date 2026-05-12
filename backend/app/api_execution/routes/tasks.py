from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()

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




__all__ = [name for name in globals() if not name.startswith("__")]
