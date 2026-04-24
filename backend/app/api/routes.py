from fastapi import APIRouter

from app.api.routers.system import router as system_router
from app.api.routers.webhooks import router as webhooks_router
from app.api.routers.query import router as query_router
from app.api.routers.graph import router as graph_router
from app.api.routers.ingestion import router as ingestion_router
from app.api.routers.prompt_hub import router as prompt_hub_router
from app.api.management_routes import router as management_router

router = APIRouter(prefix="/api")

# Mount sub-routers
router.include_router(system_router)
router.include_router(webhooks_router)
router.include_router(query_router)
router.include_router(graph_router)
router.include_router(ingestion_router)
router.include_router(prompt_hub_router)
router.include_router(management_router)
