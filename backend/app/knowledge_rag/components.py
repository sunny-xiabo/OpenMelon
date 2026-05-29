"""Knowledge/RAG component assembly."""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from app.config import settings
from app.knowledge_rag.facade import (
    AgenticRAG,
    CoverageService,
    DocumentIndexer,
    GraphOperations,
    IntentRouter,
    MultiChannelRetriever,
    Neo4jClient,
    RAGGenerator,
    VectorOperations,
)


@dataclass
class KnowledgeRAGComponents:
    neo4j_client: Neo4jClient
    neo4j_available: bool
    driver: Any = None
    graph_ops: GraphOperations | None = None
    vector_ops: VectorOperations | None = None
    intent_router: IntentRouter | None = None
    retriever: MultiChannelRetriever | None = None
    generator: RAGGenerator | None = None
    agentic_rag: AgenticRAG | None = None
    indexer: DocumentIndexer | None = None
    coverage_service: CoverageService | None = None


async def build_knowledge_rag_components(llm_client: Any, logger: Any, bm25_retriever: Any = None) -> KnowledgeRAGComponents:
    neo4j_client = Neo4jClient()
    neo4j_available = False
    driver = None
    graph_ops = None
    vector_ops = None
    indexer = None
    coverage_service = None

    try:
        await neo4j_client.connect()
        await neo4j_client.initialize_indexes()
        logger.info("Neo4j 连接成功: %s", settings.NEO4J_URI)
        neo4j_available = True
    except Exception as exc:
        logger.warning(
            "Neo4j 当前不可用，OpenMelon 将以降级模式启动；图谱、覆盖率、导入索引和 RAG 检索暂不可用。"
            "请启动 Neo4j 后重启后端。URI=%s, error=%s",
            settings.NEO4J_URI,
            exc,
        )

    if neo4j_available:
        driver = neo4j_client.driver
        graph_ops = GraphOperations(driver)
        vector_ops = VectorOperations(driver)

        if settings.USE_EXTERNAL_VECTOR:
            await vector_ops.init_external_collections()

    intent_router = IntentRouter(llm_client, graph_ops) if graph_ops else None
    retriever = MultiChannelRetriever(graph_ops, vector_ops, llm_client, bm25_retriever=bm25_retriever) if graph_ops and vector_ops else None
    generator = RAGGenerator(llm_client)
    agentic_rag = AgenticRAG(llm_client, retriever) if retriever else None

    if neo4j_available:
        indexer = DocumentIndexer(neo4j_client, graph_ops, vector_ops, llm_client)
        coverage_service = CoverageService(graph_ops)

    return KnowledgeRAGComponents(
        neo4j_client=neo4j_client,
        neo4j_available=neo4j_available,
        driver=driver,
        graph_ops=graph_ops,
        vector_ops=vector_ops,
        intent_router=intent_router,
        retriever=retriever,
        generator=generator,
        agentic_rag=agentic_rag,
        indexer=indexer,
        coverage_service=coverage_service,
    )
