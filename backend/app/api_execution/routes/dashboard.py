from fastapi import APIRouter

from app.api_execution.router_support import *

router = APIRouter()

@router.get("/dashboard/summary")
async def get_dashboard_summary(project_id: str | None = None, limit: int = 50):
    return _dashboard_summary(project_id=project_id, limit=limit)




__all__ = [name for name in globals() if not name.startswith("__")]
