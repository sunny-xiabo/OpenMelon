import base64
import hashlib
import hmac
import json
from datetime import datetime, timezone
from typing import Any

from fastapi import Depends, Request
from fastapi.security import APIKeyHeader

from app.api.errors import InvalidRequestError, UnauthorizedError
from app.config import settings


ADMIN_API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)


def _require_service(service, name: str):
    if service is None:
        raise InvalidRequestError(message=f"{name} 当前不可用，请先启动 Neo4j 后重启后端服务。")
    return service


def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


def _candidate_matches_any(candidate: str | None, values: list[str]) -> bool:
    if not candidate:
        return False
    return any(hmac.compare_digest(candidate, value) for value in values)


def _verify_admin_jwt(token: str) -> dict[str, Any] | None:
    secret = settings.ADMIN_JWT_SECRET.strip()
    if not secret:
        return None
    try:
        header_part, payload_part, signature_part = token.split(".", 2)
        expected_signature = hmac.new(
            secret.encode("utf-8"),
            f"{header_part}.{payload_part}".encode("ascii"),
            hashlib.sha256,
        ).digest()
        if not hmac.compare_digest(signature_part, _base64url_encode(expected_signature)):
            return None

        header = json.loads(_base64url_decode(header_part))
        if header.get("alg") != "HS256":
            return None

        payload = json.loads(_base64url_decode(payload_part))
        exp = payload.get("exp")
        if exp is not None and datetime.now(timezone.utc).timestamp() > float(exp):
            return None
        return payload
    except Exception:
        return None


async def require_production_auth(
    request: Request,
    api_key: str | None = Depends(ADMIN_API_KEY_HEADER),
) -> dict[str, Any]:
    if not settings.PROTECT_ADMIN_API:
        return {"authenticated": False, "mode": "open"}

    if _candidate_matches_any(api_key, settings.admin_api_keys):
        return {"authenticated": True, "method": "api_key"}

    auth_header = request.headers.get("Authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() == "bearer" and _verify_admin_jwt(token.strip()):
        return {"authenticated": True, "method": "jwt"}

    raise UnauthorizedError(message="未提供有效的管理 API 凭据")


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
