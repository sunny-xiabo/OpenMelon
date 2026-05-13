from fastapi import APIRouter, Query
from typing import Annotated

from app.api_execution.router_support import *

router = APIRouter()

@router.get("/dashboard/summary")
async def get_dashboard_summary(project_id: str | None = None, limit: Annotated[int, Query(ge=1, le=200)] = 50):
    return get_dashboard_summary_service(project_id=project_id, limit=limit)




__all__ = [name for name in globals() if not name.startswith("__")]
