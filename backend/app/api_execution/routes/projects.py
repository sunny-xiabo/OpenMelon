from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()


@router.get("/projects", response_model=APIProjectListResponse)
async def list_projects():
    return list_projects_service()


@router.post("/projects", response_model=APIProjectConfig)
async def upsert_project(request: APIProjectUpsertRequest):
    return upsert_project_service(request)


@router.get("/projects/{project_id}", response_model=APIProjectConfig)
async def get_project(project_id: str):
    return get_project_service(project_id)


@router.delete("/projects/{project_id}")
async def delete_project(project_id: str):
    return delete_project_service(project_id)


@router.get("/projects/{project_id}/environments", response_model=APIEnvironmentListResponse)
async def list_project_environments(project_id: str):
    return list_project_environments_service(project_id)


@router.post("/projects/{project_id}/environments", response_model=APIEnvironmentConfig)
async def upsert_project_environment(project_id: str, request: APIEnvironmentUpsertRequest):
    return upsert_project_environment_service(project_id, request)


@router.patch("/environments/{environment_id}", response_model=APIEnvironmentConfig)
async def update_environment(environment_id: str, request: APIEnvironmentUpsertRequest):
    return update_environment_service(environment_id, request)


@router.delete("/environments/{environment_id}")
async def delete_environment(environment_id: str):
    return delete_environment_service(environment_id)


__all__ = [name for name in globals() if not name.startswith("__")]
