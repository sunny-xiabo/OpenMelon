"""
API 依赖注入

认证逻辑已统一到 app.auth 模块，此处保留向后兼容的 re-export
以及各类服务 getter 函数。
"""

from fastapi import Request

from app.api.errors import InvalidRequestError

# --- 从统一认证模块 re-export（向后兼容） ---
from app.auth import (  # noqa: F401
    require_auth,
    require_production_auth,
    optional_auth,
    create_jwt_token,
    verify_jwt_token,
)


# --- 服务 getter ---
def _require_service(service, name: str):
    if service is None:
        raise InvalidRequestError(message=f"{name} 当前不可用，请先启动 Neo4j 后重启后端服务。")
    return service


def get_graph_ops(request: Request):
    return _require_service(getattr(request.app.state, "graph_ops", None), "图谱服务")

def get_vector_ops(request: Request):
    return _require_service(getattr(request.app.state, "vector_ops", None), "向量检索服务")

def get_llm_client(request: Request):
    return request.app.state.llm_client

def get_intent_router(request: Request):
    return _require_service(getattr(request.app.state, "intent_router", None), "意图识别服务")

def get_retriever(request: Request):
    return _require_service(getattr(request.app.state, "retriever", None), "检索服务")

def get_generator(request: Request):
    return request.app.state.generator

def get_agentic_rag(request: Request):
    return getattr(request.app.state, "agentic_rag", None)

def get_indexer(request: Request):
    return _require_service(getattr(request.app.state, "indexer", None), "文档索引服务")

def get_coverage_service(request: Request):
    return _require_service(getattr(request.app.state, "coverage_service", None), "覆盖率服务")

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
