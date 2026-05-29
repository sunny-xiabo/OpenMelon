from contextlib import asynccontextmanager
import time
import signal
import sys
import asyncio
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.staticfiles import StaticFiles
from openai import AsyncOpenAI
import os

from app.config import settings
from app.utils.logger import logger
from app.testcase_gen.routers import router as testcase_router
from app.services.metrics import metrics_collector
from app.services.session_manager import session_manager
from app.services.enterprise_webhook import enterprise_integration
from app.knowledge_rag import build_knowledge_rag_components, file_tracker
from app.api.routes import router
from app.testcase_gen.services.neo4j_writer import init_neo4j_writer
from app.testcase_gen.services.graph_context_retriever import (
    init_graph_context_retriever,
)
from app.api.ai_observability_service import build_usage_from_response, safe_record_ai_call
from app.version import APP_VERSION

_shutdown_event = asyncio.Event()


async def _force_shutdown():
    logger.warning("强制关闭服务...")
    _shutdown_event.set()
    await asyncio.sleep(0.5)
    sys.exit(1)


# lifespan 是 FastAPI 的生命周期管理器，应用启动前和关闭后会分别执行 yield 前后的代码。
# 在这里我们集中初始化了所有的核心服务（如数据库连接、大模型客户端、各类引擎实例等），
# 并将它们挂载到 app.state 上，这样全局都可以通过 request.app.state 访问这些单例。
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("OpenMelon 服务启动中...")
    logger.info(
        "LLM Provider: %s, Model: %s", settings.LLM_PROVIDER, settings.CHAT_MODEL
    )
    embedding_model = settings.EMBEDDING_MODEL or "text-embedding-3-small"
    enforce_dimensions = bool(
        settings.EMBEDDING_DIM and "text-embedding-3" in embedding_model
    )
    logger.info(
        "Embedding 自检: model=%s, dim=%s, dimensions_enforced=%s",
        embedding_model,
        settings.EMBEDDING_DIM,
        enforce_dimensions,
    )

    llm_client = AsyncOpenAI(
        api_key=settings.API_KEY,
        base_url=settings.API_BASE_URL,
    )

    # Initialize PG FTS store and BM25 retriever early so they can be wired into MultiChannelRetriever
    from app.storage.pg_fts_store import create_pg_fts_store
    from app.engine.retrieval.pg_bm25_retriever import PGBM25Retriever

    fts_store = create_pg_fts_store()
    bm25_retriever = PGBM25Retriever(fts_store)

    knowledge_rag = await build_knowledge_rag_components(llm_client, logger, bm25_retriever=bm25_retriever)

    app.state.neo4j_client = knowledge_rag.neo4j_client
    app.state.graph_ops = knowledge_rag.graph_ops
    app.state.vector_ops = knowledge_rag.vector_ops
    app.state.llm_client = llm_client
    app.state.intent_router = knowledge_rag.intent_router
    app.state.retriever = knowledge_rag.retriever
    app.state.generator = knowledge_rag.generator
    app.state.agentic_rag = knowledge_rag.agentic_rag
    app.state.indexer = knowledge_rag.indexer
    app.state.coverage_service = knowledge_rag.coverage_service
    app.state.file_tracker = file_tracker
    app.state.metrics_collector = metrics_collector
    app.state.session_manager = session_manager
    app.state.enterprise_integration = enterprise_integration
    app.state.neo4j_driver = knowledge_rag.driver
    app.state.neo4j_available = knowledge_rag.neo4j_available
    app.state.bm25_retriever = bm25_retriever

    # Attach FTS store to VectorOperations for Neo4j-to-PG sync (requires vector_ops)
    if fts_store is not None and knowledge_rag.vector_ops is not None:
        knowledge_rag.vector_ops.set_fts_store(fts_store)
        logger.info("PgFtsStore attached to VectorOperations for Neo4j-to-PG sync")

    logger.info(
        "BM25 retriever initialized (available=%s, top_k=%d)",
        bm25_retriever.available,
        settings.BM25_TOP_K,
    )

    from app.storage.qa_feedback_store import QaFeedbackStore
    app.state.qa_feedback_store = QaFeedbackStore()

    async def generate_embedding(text: str):
        # 兼容 bge 模型 512 tokens 限制，安全截断至 400 字符。对于其他模型也截断以防越界。
        model_name = settings.EMBEDDING_MODEL or "text-embedding-3-small"
        safe_limit = 400 if "bge" in model_name.lower() else 6000
        started_at = time.perf_counter()
        kwargs = {
            "model": model_name,
            "input": text[:safe_limit],
        }
        # OpenAI text-embedding-3 系列支持 dimensions，显式传入可保持全局维度一致
        if settings.EMBEDDING_DIM and "text-embedding-3" in model_name:
            kwargs["dimensions"] = settings.EMBEDDING_DIM
        try:
            resp = await llm_client.embeddings.create(**kwargs)
            safe_record_ai_call(
                feature="embedding",
                operation="neo4j_writer_embedding",
                provider=settings.LLM_PROVIDER,
                model=model_name,
                status="success",
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                prompt_chars=len(kwargs["input"]),
                response_chars=0,
                **build_usage_from_response(resp),
            )
            return resp.data[0].embedding
        except Exception as exc:
            safe_record_ai_call(
                feature="embedding",
                operation="neo4j_writer_embedding",
                provider=settings.LLM_PROVIDER,
                model=model_name,
                status="failed",
                latency_ms=round((time.perf_counter() - started_at) * 1000),
                prompt_chars=len(kwargs["input"]),
                degraded=True,
                failure_reason=str(exc),
            )
            raise

    writer_instance = None
    if knowledge_rag.neo4j_available:
        writer_instance = init_neo4j_writer(knowledge_rag.driver, generate_embedding, knowledge_rag.vector_ops)
        init_graph_context_retriever(knowledge_rag.graph_ops)

    app.state._neo4j_writer = writer_instance

    # 恢复上次服务重启后残留的 queued/running 状态任务，标记为 failed
    try:
        from app.api_execution.run_queue import recover_stale_runs
        recovered_ids = recover_stale_runs()
        if recovered_ids:
            logger.info("已恢复 %d 个残留执行任务: %s", len(recovered_ids), recovered_ids)
    except Exception as exc:
        logger.warning("恢复残留执行任务失败: %s", exc)

    try:
        from app.index_governance.tasks import task_manager

        recovered_task_ids = task_manager.recover_stale_tasks()
        if recovered_task_ids:
            logger.info("已标记 %d 个残留索引治理任务为失败: %s", len(recovered_task_ids), recovered_task_ids)
    except Exception as exc:
        logger.warning("恢复索引治理任务状态失败: %s", exc)

    logger.info("OpenMelon 服务启动完成")

    yield

    logger.info("OpenMelon 服务关闭中...")
    try:
        if knowledge_rag.neo4j_available:
            await asyncio.wait_for(knowledge_rag.neo4j_client.close(), timeout=5.0)
    except asyncio.TimeoutError:
        logger.warning("Neo4j 关闭超时，强制退出")
    try:
        from app.storage.postgres_store import close_postgres_pools

        close_postgres_pools()
    except Exception as exc:
        logger.warning("PostgreSQL 连接池关闭失败: %s", exc)
    logger.info("OpenMelon 服务已关闭")


app = FastAPI(
    title="OpenMelon",
    description="Knowledge graph + vector RAG system for documentation Q&A",
    version=APP_VERSION,
    lifespan=lifespan,
)

from app.api.errors import setup_exception_handlers
setup_exception_handlers(app)

cors_allow_origins = settings.cors_allow_origins
app.add_middleware(
    CORSMiddleware,
    allow_origins=cors_allow_origins,
    allow_credentials="*" not in cors_allow_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.middleware("http")
async def request_logging_middleware(request, call_next):
    start = time.time()
    response = await call_next(request)
    duration_ms = (time.time() - start) * 1000

    level = "INFO" if response.status_code < 400 else "WARNING"
    log_fn = getattr(logger, level.lower(), logger.info)
    log_fn(
        "%s %s %d %.0fms",
        request.method,
        request.url.path,
        response.status_code,
        duration_ms,
    )

    try:
        collector = getattr(request.app.state, "metrics_collector", None)
        if collector is not None:
            collector.record_request(
                request.url.path, duration_ms, success=(response.status_code < 400)
            )
    except Exception:
        pass
    return response


app.include_router(router)
app.include_router(testcase_router)

# Ensure upload and result directories exist for testcase generator
from app.runtime_paths import UPLOAD_TEMP_DIR, RESULTS_DIR  # noqa: E402

# Mount React frontend build
frontend_dir = os.path.join(
    os.path.dirname(os.path.dirname(os.path.dirname(__file__))), "frontend", "dist"
)
if os.path.isdir(frontend_dir):
    app.mount("/", StaticFiles(directory=frontend_dir, html=True), name="frontend")


def _register_force_exit_handler():
    force_exit = [False]

    def handler(sig, frame):
        if force_exit[0]:
            logger.warning("二次信号，强制退出")
            os._exit(1)
        force_exit[0] = True
        logger.warning("收到关闭信号，5秒后强制退出...")

        def _force():
            os._exit(0)

        import threading

        threading.Timer(5.0, _force).start()

    signal.signal(signal.SIGINT, handler)
    signal.signal(signal.SIGTERM, handler)


_register_force_exit_handler()
