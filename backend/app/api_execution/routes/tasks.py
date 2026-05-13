from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()


@router.get("/policy/audits", response_model=PolicyAuditListResponse)
async def list_policy_audits(limit: int = 20, project_id: str | None = None, action: str | None = None):
    return list_policy_audits_service(limit=limit, project_id=project_id, action=action)


@router.get("/automation/tasks", response_model=AutomationTaskListResponse)
async def list_automation_tasks(limit: int = 20, status: str | None = None, project_id: str | None = None):
    return list_automation_tasks_service(limit=limit, status=status, project_id=project_id)


@router.get("/automation/task-center/summary", response_model=AutomationTaskCenterSummaryResponse)
async def get_task_center_summary(limit: int = 50, project_id: str | None = None):
    return get_task_center_summary_service(limit=limit, project_id=project_id)


@router.post("/automation/tasks/{task_id}/resolve", response_model=AutomationTaskRecord)
async def resolve_automation_task(task_id: str):
    return resolve_automation_task_service(task_id)


@router.post("/automation/scheduled-runs/trigger", response_model=ScheduledExecutionResponse)
async def trigger_scheduled_runs():
    return await trigger_scheduled_runs_service()


@router.post("/automation/spec-sync/trigger", response_model=SpecSyncResponse)
async def trigger_spec_sync():
    return trigger_spec_sync_service()


__all__ = [name for name in globals() if not name.startswith("__")]
