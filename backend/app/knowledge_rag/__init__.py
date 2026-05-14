"""Knowledge/RAG package boundary."""

from app.knowledge_rag.components import KnowledgeRAGComponents, build_knowledge_rag_components
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
    file_tracker,
)

__all__ = [
    "AgenticRAG",
    "CoverageService",
    "DocumentIndexer",
    "GraphOperations",
    "IntentRouter",
    "KnowledgeRAGComponents",
    "MultiChannelRetriever",
    "Neo4jClient",
    "RAGGenerator",
    "VectorOperations",
    "build_knowledge_rag_components",
    "file_tracker",
]
