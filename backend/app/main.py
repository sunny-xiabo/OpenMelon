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
from app.storage.neo4j_client import Neo4jClient
from app.storage.graph_ops import GraphOperations
from app.storage.vector_ops import VectorOperations
from app.engine.intent.router import IntentRouter
from app.engine.retrieval.multi_channel import MultiChannelRetriever
from app.engine.rag.generator import RAGGenerator
from app.engine.agentic_rag import AgenticRAG
from app.services.indexer import DocumentIndexer
from app.services.coverage import CoverageService
from app.services.file_tracker import file_tracker
from app.api.routes import router
from app.testcase_gen.services.neo4j_writer import init_neo4j_writer, neo4j_writer
from app.testcase_gen.services.graph_context_retriever import (
    init_graph_context_retriever,
)

_shutdown_event = asyncio.Event()


async def _force_shutdown():
    logger.warning("强制关闭服务...")
    _shutdown_event.set()
    await asyncio.sleep(0.5)
    sys.exit(1)


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

    neo4j_client = Neo4jClient()
    await neo4j_client.connect()
    await neo4j_client.initialize_indexes()
    logger.info("Neo4j 连接成功: %s", settings.NEO4J_URI)

    driver = neo4j_client.driver
    graph_ops = GraphOperations(driver)
    vector_ops = VectorOperations(driver)
    
    if settings.USE_EXTERNAL_VECTOR:
        await vector_ops.init_external_collections()

    llm_client = AsyncOpenAI(
        api_key=settings.API_KEY,
        base_url=settings.API_BASE_URL,
    )

    intent_router = IntentRouter(llm_client, graph_ops)
    retriever = MultiChannelRetriever(graph_ops, vector_ops, llm_client)
    generator = RAGGenerator(llm_client)
    agentic_rag = AgenticRAG(llm_client, retriever)
    indexer = DocumentIndexer(neo4j_client, graph_ops, vector_ops, llm_client)
    coverage_service = CoverageService(graph_ops)

    app.state.neo4j_client = neo4j_client
    app.state.graph_ops = graph_ops
    app.state.vector_ops = vector_ops
    app.state.llm_client = llm_client
    app.state.intent_router = intent_router
    app.state.retriever = retriever
    app.state.generator = generator
    app.state.agentic_rag = agentic_rag
    app.state.indexer = indexer
    app.state.coverage_service = coverage_service
    app.state.file_tracker = file_tracker
    app.state.metrics_collector = metrics_collector
    app.state.session_manager = session_manager
    app.state.enterprise_integration = enterprise_integration
    app.state.neo4j_driver = driver

    async def generate_embedding(text: str):
        # 兼容 bge 模型 512 tokens 限制，安全截断至 400 字符。对于其他模型也截断以防越界。
        model_name = settings.EMBEDDING_MODEL or "text-embedding-3-small"
        safe_limit = 400 if "bge" in model_name.lower() else 6000
        kwargs = {
            "model": model_name,
            "input": text[:safe_limit],
        }
        # OpenAI text-embedding-3 系列支持 dimensions，显式传入可保持全局维度一致
        if settings.EMBEDDING_DIM and "text-embedding-3" in model_name:
            kwargs["dimensions"] = settings.EMBEDDING_DIM
        resp = await llm_client.embeddings.create(**kwargs)
        return resp.data[0].embedding

    writer_instance = init_neo4j_writer(driver, generate_embedding, vector_ops)
    init_graph_context_retriever(graph_ops)

    app.state._neo4j_writer = writer_instance

    logger.info("OpenMelon 服务启动完成")

    yield

    logger.info("OpenMelon 服务关闭中...")
    try:
        await asyncio.wait_for(neo4j_client.close(), timeout=5.0)
    except asyncio.TimeoutError:
        logger.warning("Neo4j 关闭超时，强制退出")
    logger.info("OpenMelon 服务已关闭")


app = FastAPI(
    title="OpenMelon",
    description="Knowledge graph + vector RAG system for documentation Q&A",
    version="0.1.0",
    lifespan=lifespan,
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
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
import os as _os

uploads_dir = _os.path.join(_os.path.dirname(__file__), "uploads")
results_dir = _os.path.join(_os.path.dirname(__file__), "results")
_os.makedirs(uploads_dir, exist_ok=True)
_os.makedirs(results_dir, exist_ok=True)

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
