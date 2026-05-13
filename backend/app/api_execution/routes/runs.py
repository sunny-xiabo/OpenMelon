from fastapi import APIRouter, Query
from typing import Annotated

from app.api_execution.router_support import *

router = APIRouter()


@router.post("/runs/{run_id}/auto-repair", response_model=APIRunReport)
async def auto_repair_and_rerun(run_id: str):
    return await auto_repair_and_rerun_service(run_id)


@router.post("/runs/single-step", response_model=APIStepRunResult)
async def run_single_step_endpoint(request: RunScriptRequest):
    return await run_single_step_service(request)


@router.post("/runs", response_model=APIRunReport)
async def run_all_steps_endpoint(request: RunScriptRequest):
    return await run_all_steps_service(request)


@router.post("/runs/async", response_model=CreateRunResponse)
async def create_background_run(request: RunScriptRequest):
    return await create_background_run_service(request)


@router.get("/runs", response_model=APIRunHistoryResponse)
async def list_run_history(
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
    status: str | None = None,
    keyword: str | None = None,
    project_id: str | None = None,
):
    return list_run_history_service(limit=limit, offset=offset, status=status, keyword=keyword, project_id=project_id)


@router.get("/cases/{case_id}/runs", response_model=APIRunHistoryResponse)
async def list_case_runs(
    case_id: str,
    limit: Annotated[int, Query(ge=1, le=50)] = 20,
    offset: Annotated[int, Query(ge=0)] = 0,
):
    return list_case_runs_service(case_id, limit=limit, offset=offset)


@router.get("/runs/{run_id}", response_model=APIRunReport)
async def get_run_report(run_id: str):
    return get_run_report_service(run_id)


@router.get("/runs/{run_id}/stream")
async def stream_run_progress(run_id: str):
    return stream_run_progress_service(run_id)


@router.post("/runs/{run_id}/cancel", response_model=APIRunReport)
async def cancel_background_run(run_id: str):
    return await cancel_background_run_service(run_id)


@router.delete("/runs/clear-all")
async def clear_all_runs():
    return await clear_all_runs_service()


@router.delete("/runs/{run_id}")
async def delete_run_history(run_id: str):
    return await delete_run_history_service(run_id)


@router.post("/runs/batch-delete")
async def batch_delete_run_history(run_ids: list[str]):
    return await batch_delete_run_history_service(run_ids)


__all__ = [name for name in globals() if not name.startswith("__")]
