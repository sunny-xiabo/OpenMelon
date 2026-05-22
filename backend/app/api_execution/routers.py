from fastapi import APIRouter

from app.api_execution.routes import agent, ai, assets, dashboard, exports, knowledge, projects, recommendations, runs, specs, tasks, templates

router = APIRouter(prefix="/api-execution", tags=["api-execution"])

for _module in (projects, agent, assets, dashboard, templates, tasks, knowledge, specs, ai, recommendations, runs, exports):
    router.include_router(_module.router)
