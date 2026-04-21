from fastapi import Request

def get_graph_ops(request: Request):
    return request.app.state.graph_ops

def get_vector_ops(request: Request):
    return request.app.state.vector_ops

def get_llm_client(request: Request):
    return request.app.state.llm_client

def get_intent_router(request: Request):
    return request.app.state.intent_router

def get_retriever(request: Request):
    return request.app.state.retriever

def get_generator(request: Request):
    return request.app.state.generator

def get_agentic_rag(request: Request):
    return getattr(request.app.state, "agentic_rag", None)

def get_indexer(request: Request):
    return request.app.state.indexer

def get_coverage_service(request: Request):
    return request.app.state.coverage_service

def get_file_tracker(request: Request):
    return request.app.state.file_tracker

def get_metrics_collector(request: Request):
    return getattr(request.app.state, "metrics_collector", None)

def get_session_manager(request: Request):
    return request.app.state.session_manager

def get_enterprise_integration(request: Request):
    return getattr(request.app.state, "enterprise_integration", None)

def get_neo4j_driver(request: Request):
    return getattr(request.app.state, "neo4j_driver", None)
