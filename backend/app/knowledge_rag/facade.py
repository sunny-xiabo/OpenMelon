"""Public facade for Knowledge/RAG internals."""

from app.engine.agentic_rag import AgenticRAG
from app.engine.intent.router import IntentRouter
from app.engine.rag.generator import RAGGenerator
from app.engine.retrieval.multi_channel import MultiChannelRetriever
from app.services.coverage import CoverageService
from app.services.file_tracker import file_tracker
from app.services.indexer import DocumentIndexer
from app.storage.graph_ops import GraphOperations
from app.storage.neo4j_client import Neo4jClient
from app.storage.vector_ops import VectorOperations

__all__ = [
    "AgenticRAG",
    "CoverageService",
    "DocumentIndexer",
    "GraphOperations",
    "IntentRouter",
    "MultiChannelRetriever",
    "Neo4jClient",
    "RAGGenerator",
    "VectorOperations",
    "file_tracker",
]
