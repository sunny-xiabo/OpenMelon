import asyncio
import os
from datetime import UTC, datetime
from urllib.parse import urlparse
from app.api.errors import InternalError, InvalidRequestError, NotFoundError, UnauthorizedError
from fastapi import APIRouter, HTTPException, Depends, Request, Query
from app.api.deps import get_metrics_collector, get_session_manager, require_production_auth
from app.api_execution.storage import api_execution_store
from app.config import settings
from app.runtime_paths import DB_DIR, DB_PATH, LOG_DIR as RUNTIME_LOG_DIR, RUNTIME_ROOT, UPLOAD_STORE_DIR
from app.version import APP_VERSION

router = APIRouter(tags=["system"])


def _health_component(status: str, message: str = "", **details):
    return {"status": status, "message": message, **details}


def _overall_health_status(components: dict) -> str:
    if any(component.get("status") == "down" for component in components.values()):
        return "down"
    if any(
        component.get("status") in {"degraded", "missing_config"}
        for component in components.values()
    ):
        return "degraded"
    return "ok"


def _check_llm_config_health() -> dict:
    has_api_key = bool(settings.API_KEY.strip())
    return _health_component(
        "ok" if has_api_key else "missing_config",
        "LLM 配置已提供 API Key" if has_api_key else "未配置 API_KEY，LLM/RAG 能力将不可用",
        provider=settings.LLM_PROVIDER,
        chat_model=settings.CHAT_MODEL,
        embedding_model=settings.EMBEDDING_MODEL,
        api_base_url=settings.API_BASE_URL,
        api_key_configured=has_api_key,
    )


async def _check_neo4j_health(request: Request) -> dict:
    state = request.app.state
    client = getattr(state, "neo4j_client", None)
    startup_available = bool(getattr(state, "neo4j_available", False))
    if client is None:
        return _health_component(
            "degraded",
            "Neo4j 客户端未初始化",
            uri=settings.NEO4J_URI,
            startup_available=startup_available,
        )
    try:
        ok = await asyncio.wait_for(client.health_check(), timeout=3.0)
        return _health_component(
            "ok" if ok else "degraded",
            "Neo4j 可用" if ok else "Neo4j 健康检查未通过",
            uri=settings.NEO4J_URI,
            database=settings.NEO4J_DATABASE,
            startup_available=startup_available,
        )
    except asyncio.TimeoutError:
        return _health_component(
            "degraded",
            "Neo4j 健康检查超时",
            uri=settings.NEO4J_URI,
            database=settings.NEO4J_DATABASE,
            startup_available=startup_available,
        )
    except Exception as exc:
        return _health_component(
            "degraded",
            f"Neo4j 健康检查失败: {exc}",
            uri=settings.NEO4J_URI,
            database=settings.NEO4J_DATABASE,
            startup_available=startup_available,
        )


async def _check_qdrant_health(request: Request) -> dict:
    if not settings.USE_EXTERNAL_VECTOR:
        return _health_component(
            "disabled",
            "外部向量库未启用",
            provider=settings.VECTOR_PROVIDER,
        )
    vector_ops = getattr(request.app.state, "vector_ops", None)
    client = getattr(vector_ops, "_qdrant_client", None)
    if client is None:
        return _health_component(
            "degraded",
            "Qdrant 客户端未初始化",
            provider=settings.VECTOR_PROVIDER,
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )
    try:
        collections = await asyncio.wait_for(client.get_collections(), timeout=3.0)
        collection_names = [item.name for item in getattr(collections, "collections", [])]
        collection_details = []
        for collection_name in collection_names:
            if hasattr(vector_ops, "get_qdrant_collection_info"):
                collection_details.append(await vector_ops.get_qdrant_collection_info(collection_name))
        return _health_component(
            "ok",
            "Qdrant 可用",
            provider=settings.VECTOR_PROVIDER,
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
            collections=collection_names,
            collection_details=collection_details,
        )
    except asyncio.TimeoutError:
        return _health_component(
            "degraded",
            "Qdrant 健康检查超时",
            provider=settings.VECTOR_PROVIDER,
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )
    except Exception as exc:
        return _health_component(
            "degraded",
            f"Qdrant 健康检查失败: {exc}",
            provider=settings.VECTOR_PROVIDER,
            host=settings.QDRANT_HOST,
            port=settings.QDRANT_PORT,
        )


def _postgres_target() -> tuple[str, int, str, str]:
    database_url = settings.DATABASE_URL.strip()
    if database_url:
        parsed = urlparse(database_url)
        return (
            parsed.hostname or settings.POSTGRES_HOST,
            parsed.port or settings.POSTGRES_PORT,
            parsed.path.lstrip("/") or settings.POSTGRES_DB,
            parsed.username or settings.POSTGRES_USER,
        )
    return settings.POSTGRES_HOST, settings.POSTGRES_PORT, settings.POSTGRES_DB, settings.POSTGRES_USER


async def _check_postgres_health() -> dict:
    host, port, database, user = _postgres_target()
    try:
        reader, writer = await asyncio.wait_for(asyncio.open_connection(host, port), timeout=3.0)
        writer.close()
        await writer.wait_closed()
        return _health_component(
            "ok",
            "PostgreSQL 运行时可用",
            host=host,
            port=port,
            database=database,
            user=user,
            runtime_store=True,
        )
    except asyncio.TimeoutError:
        return _health_component(
            "degraded",
            "PostgreSQL 健康检查超时",
            host=host,
            port=port,
            database=database,
            user=user,
            runtime_store=True,
        )
    except Exception as exc:
        return _health_component(
            "degraded",
            f"PostgreSQL 健康检查失败: {exc}",
            host=host,
            port=port,
            database=database,
            user=user,
            runtime_store=True,
        )


async def _check_reranker_health() -> dict:
    backend = (settings.RERANKER_BACKEND or "local").strip().lower()
    if not settings.USE_RERANKER or backend == "disabled":
        return _health_component(
            "disabled",
            "Reranker 未启用",
            backend="disabled",
        )
    if backend == "sidecar":
        try:
            import httpx

            async with httpx.AsyncClient(timeout=min(settings.RERANKER_TIMEOUT_SECONDS, 3.0)) as client:
                response = await client.get(f"{settings.RERANKER_URL.rstrip('/')}/health")
            return _health_component(
                "ok" if response.status_code == 200 else "degraded",
                "Reranker sidecar 可用" if response.status_code == 200 else "Reranker sidecar 响应异常",
                backend=backend,
                url=settings.RERANKER_URL,
                status_code=response.status_code,
            )
        except Exception as exc:
            return _health_component(
                "degraded",
                f"Reranker sidecar 检查失败: {exc}",
                backend=backend,
                url=settings.RERANKER_URL,
            )

    try:
        from app.engine.reranker import reranker

        loaded = getattr(reranker, "model", None) is not None
    except Exception:
        loaded = False
    return _health_component(
        "ok" if loaded else "not_loaded",
        "本地 Reranker 已加载" if loaded else "本地 Reranker 已配置，尚未加载模型",
        backend=backend,
        model=settings.RERANKER_MODEL_NAME,
        device=settings.RERANKER_DEVICE,
    )

@router.get("/ping")
async def ping():
    return {"status": "success", "message": "pong"}


@router.get("/system/health")
async def system_health(request: Request):
    components = {
        "api": _health_component("ok", "API 服务可用", version=APP_VERSION),
        "llm": _check_llm_config_health(),
        "neo4j": await _check_neo4j_health(request),
        "qdrant": await _check_qdrant_health(request),
        "postgres": await _check_postgres_health(),
        "reranker": await _check_reranker_health(),
    }
    return {
        "status": _overall_health_status(components),
        "version": APP_VERSION,
        "checked_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
        "runtime": {
            "root": str(RUNTIME_ROOT),
            "data_dir": str(DB_DIR),
            "log_dir": str(RUNTIME_LOG_DIR),
            "upload_dir": str(UPLOAD_STORE_DIR),
        },
        "components": components,
    }

@router.get("/metrics")
async def get_metrics(collector = Depends(get_metrics_collector)):
    try:
        if collector:
            return collector.get_all_metrics()
        return {"metrics": "not_configured"}
    except Exception as e:
        raise InternalError(details=str(e))

@router.post("/metrics/reset", dependencies=[Depends(require_production_auth)])
async def reset_metrics(collector = Depends(get_metrics_collector)):
    try:
        if collector:
            collector.reset()
            return {"reset": True}
        return {"reset": False, "reason": "not_configured"}
    except Exception as e:
        raise InternalError(details=str(e))

@router.get("/sessions")
async def list_sessions(session_manager = Depends(get_session_manager)):
    sessions = session_manager.list_sessions_with_meta()
    return {"sessions": sessions}

@router.patch(
    "/sessions/{session_id}/rename",
    dependencies=[Depends(require_production_auth)],
)
async def rename_session(session_id: str, req: Request, session_manager = Depends(get_session_manager)):
    body = await req.json()
    title = body.get("title", "")
    if not title:
        raise InvalidRequestError(message="Title is required")
    ok = session_manager.rename_session(session_id, title)
    if not ok:
        raise NotFoundError(message="Session not found")
    return {"session_id": session_id, "title": title}

@router.get("/history/{session_id}")
async def history(session_id: str, session_manager = Depends(get_session_manager)):
    try:
        history = session_manager.get_history(session_id)
        return {"session_id": session_id, "history": history}
    except Exception as e:
        raise InternalError(details=str(e))

@router.delete(
    "/history/{session_id}",
    dependencies=[Depends(require_production_auth)],
)
async def delete_session_history(session_id: str, session_manager = Depends(get_session_manager)):
    try:
        deleted = session_manager.delete_session(session_id)
        return {"session_id": session_id, "deleted": deleted}
    except Exception as e:
        raise InternalError(details=str(e))

@router.post(
    "/sessions/{session_id}/truncate",
    dependencies=[Depends(require_production_auth)],
)
async def truncate_session_history(session_id: str, req: Request, session_manager = Depends(get_session_manager)):
    try:
        body = await req.json()
        message_index = body.get("message_index")
        if message_index is None:
            raise InvalidRequestError(message="message_index is required")
        ok = session_manager.truncate_session(session_id, int(message_index))
        if not ok:
            raise NotFoundError(message="Session not found")
        return {"session_id": session_id, "message_index": message_index}
    except Exception as e:
        raise InternalError(details=str(e))

from app.utils.logger import LOG_DIR

LOG_FILES = {
    "openmelon.log": LOG_DIR,
    "openmelon_error.log": LOG_DIR,
}

@router.get("/logs")
async def get_logs(
    filename: str = Query(default="openmelon.log"),
    lines: int = Query(default=200, ge=1, le=5000),
):
    if filename not in LOG_FILES:
        raise InvalidRequestError(message=f"Unknown log file: {filename}")
    log_path = os.path.join(LOG_FILES[filename], filename)
    if not os.path.isfile(log_path):
        return {"filename": filename, "lines": [], "total_lines": 0}
    try:
        with open(log_path, "r", encoding="utf-8") as f:
            all_lines = f.readlines()
        tail = all_lines[-lines:] if len(all_lines) > lines else all_lines
        return {
            "filename": filename,
            "lines": [line.rstrip("\\n") for line in tail],
            "total_lines": len(all_lines),
        }
    except Exception as e:
        raise InternalError(details=str(e))

@router.get("/logs/list")
async def list_logs():
    result = []
    for name, dir_path in LOG_FILES.items():
        full_path = os.path.join(dir_path, name)
        size = os.path.getsize(full_path) if os.path.isfile(full_path) else 0
        result.append(
            {"filename": name, "size_bytes": size, "exists": os.path.isfile(full_path)}
        )
    return {"logs": result}
