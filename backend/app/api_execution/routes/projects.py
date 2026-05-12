from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()

@router.get("/projects", response_model=APIProjectListResponse)
async def list_projects():
    return {"projects": api_execution_store.list_projects()}



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




__all__ = [name for name in globals() if not name.startswith("__")]
