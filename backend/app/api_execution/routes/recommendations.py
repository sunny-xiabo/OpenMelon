from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends
from pydantic import BaseModel, Field

from app.api.deps import require_production_auth
from app.api_execution.services.recommendation_service import (
    execute_api_execution_recommendation_action_service,
    list_api_execution_recommendations_service,
)

router = APIRouter()


class APIExecutionRecommendationActionRequest(BaseModel):
    action: str
    target_id: str = ""
    project_id: str | None = None
    confirm: bool = False
    params: dict[str, Any] = Field(default_factory=dict)


@router.get("/recommendations")
async def list_api_execution_recommendations(project_id: str | None = None):
    return list_api_execution_recommendations_service(project_id=project_id)


@router.post("/recommendations/actions", dependencies=[Depends(require_production_auth)])
async def execute_api_execution_recommendation_action(body: APIExecutionRecommendationActionRequest):
    return await execute_api_execution_recommendation_action_service(
        action=body.action,
        target_id=body.target_id,
        project_id=body.project_id,
        confirm=body.confirm,
        params=body.params,
    )


__all__ = [name for name in globals() if not name.startswith("__")]
