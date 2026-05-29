"""
统一认证模块

合并原 app.api.deps 中的认证逻辑和 app.testcase_gen.utils.auth 中的 JWT 创建能力，
提供一套一致的认证接口。

环境变量:
    PROTECT_ADMIN_API  - 是否启用认证（默认 False）
    ADMIN_API_KEYS     - API Key 列表（逗号分隔，支持 key:name 格式）
    ADMIN_JWT_SECRET   - JWT 签名密钥（必须持久化，重启不变）
    JWT_EXPIRATION_HOURS - JWT 过期时间（小时，默认 24）
"""

import base64
import hashlib
import hmac
import json
import logging
import secrets
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import Depends, Request
from fastapi.security import APIKeyHeader

from app.api.errors import InvalidRequestError, UnauthorizedError
from app.config import settings

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 常量
# ---------------------------------------------------------------------------
ADMIN_API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
JWT_ALGORITHM = "HS256"
_DEFAULT_JWT_EXPIRATION_HOURS = 24


# ---------------------------------------------------------------------------
# Base64url 工具
# ---------------------------------------------------------------------------
def _base64url_decode(value: str) -> bytes:
    padding = "=" * (-len(value) % 4)
    return base64.urlsafe_b64decode(f"{value}{padding}".encode("ascii"))


def _base64url_encode(value: bytes) -> str:
    return base64.urlsafe_b64encode(value).rstrip(b"=").decode("ascii")


# ---------------------------------------------------------------------------
# API Key 验证
# ---------------------------------------------------------------------------
def _candidate_matches_any(candidate: str | None, values: list[str]) -> bool:
    """常量时间比较候选 key 与允许列表。"""
    if not candidate:
        return False
    return any(hmac.compare_digest(candidate, value) for value in values)


# ---------------------------------------------------------------------------
# JWT 操作
# ---------------------------------------------------------------------------
# 未配置 ADMIN_JWT_SECRET 时自动生成进程内临时密钥（开发模式），
# 生产环境必须通过环境变量显式设置以保证重启后 token 仍然有效。
_ephemeral_secret: str | None = None


def _get_jwt_secret() -> str:
    global _ephemeral_secret
    secret = (settings.ADMIN_JWT_SECRET or "").strip()
    if secret:
        return secret
    if _ephemeral_secret is None:
        _ephemeral_secret = secrets.token_urlsafe(32)
        logger.warning(
            "ADMIN_JWT_SECRET 未配置，已生成临时密钥（重启后失效）。"
            "生产环境请设置 ADMIN_JWT_SECRET 环境变量。"
        )
    return _ephemeral_secret


def _sign_jwt(header_part: str, payload_part: str) -> str:
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    digest = hmac.new(
        _get_jwt_secret().encode("utf-8"), signing_input, hashlib.sha256
    ).digest()
    return _base64url_encode(digest)


def create_jwt_token(
    data: dict,
    expires_delta: Optional[timedelta] = None,
) -> str:
    """
    创建 JWT Token。

    参数:
        data: 要编码到 payload 中的数据
        expires_delta: 自定义过期时间增量，默认使用 JWT_EXPIRATION_HOURS

    返回:
        JWT Token 字符串 (header.payload.signature)
    """
    to_encode = data.copy()
    if expires_delta is None:
        expires_delta = timedelta(
            hours=int(getattr(settings, "JWT_EXPIRATION_HOURS", _DEFAULT_JWT_EXPIRATION_HOURS))
        )
    expire = datetime.now(timezone.utc) + expires_delta
    to_encode["exp"] = int(expire.timestamp())

    header_part = _base64url_encode(
        json.dumps({"alg": JWT_ALGORITHM, "typ": "JWT"}, separators=(",", ":")).encode("utf-8")
    )
    payload_part = _base64url_encode(
        json.dumps(to_encode, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    signature_part = _sign_jwt(header_part, payload_part)
    return f"{header_part}.{payload_part}.{signature_part}"


def verify_jwt_token(token: str) -> dict[str, Any] | None:
    """
    验证 JWT Token。

    返回:
        解码后的 payload 字典，验证失败返回 None。
    """
    try:
        header_part, payload_part, signature_part = token.split(".", 2)
        expected_signature = _sign_jwt(header_part, payload_part)
        if not hmac.compare_digest(signature_part, expected_signature):
            return None

        header = json.loads(_base64url_decode(header_part))
        if header.get("alg") != JWT_ALGORITHM:
            return None

        payload = json.loads(_base64url_decode(payload_part))
        exp = payload.get("exp")
        if exp is not None and datetime.now(timezone.utc).timestamp() > float(exp):
            logger.warning("JWT token 已过期")
            return None
        return payload
    except Exception as e:
        logger.warning("JWT 验证失败: %s", e)
        return None


# ---------------------------------------------------------------------------
# FastAPI 依赖
# ---------------------------------------------------------------------------
async def require_auth(
    request: Request,
    api_key: str | None = Depends(ADMIN_API_KEY_HEADER),
) -> dict[str, Any]:
    """
    强制认证依赖。

    - 未启用认证时返回 {"authenticated": False, "mode": "open"}
    - 支持 X-API-Key 头和 Authorization: Bearer <jwt> 两种方式
    - 认证失败抛出 UnauthorizedError
    """
    if not settings.PROTECT_ADMIN_API:
        return {"authenticated": False, "mode": "open"}

    if _candidate_matches_any(api_key, settings.admin_api_keys):
        return {"authenticated": True, "method": "api_key"}

    auth_header = request.headers.get("Authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() == "bearer" and verify_jwt_token(token.strip()):
        return {"authenticated": True, "method": "jwt"}

    raise UnauthorizedError(message="未提供有效的管理 API 凭据")


async def optional_auth(
    request: Request,
    api_key: str | None = Depends(ADMIN_API_KEY_HEADER),
) -> dict[str, Any]:
    """
    可选认证依赖。

    与 require_auth 相同的认证逻辑，但认证失败时返回匿名身份而非抛异常。
    """
    if not settings.PROTECT_ADMIN_API:
        return {"authenticated": False, "mode": "open"}

    if _candidate_matches_any(api_key, settings.admin_api_keys):
        return {"authenticated": True, "method": "api_key"}

    auth_header = request.headers.get("Authorization", "")
    scheme, _, token = auth_header.partition(" ")
    if scheme.lower() == "bearer":
        payload = verify_jwt_token(token.strip())
        if payload:
            return {"authenticated": True, "method": "jwt", "user": payload.get("sub")}

    return {"authenticated": False, "mode": "anonymous"}


# ---------------------------------------------------------------------------
# 向后兼容别名
# ---------------------------------------------------------------------------
# deps.py 中原名 require_production_auth，大量路由使用此名称
require_production_auth = require_auth


# ---------------------------------------------------------------------------
# 服务依赖辅助
# ---------------------------------------------------------------------------
def require_service(service, name: str):
    """确保服务已初始化，否则抛出 InvalidRequestError。"""
    if service is None:
        raise InvalidRequestError(message=f"{name} 当前不可用，请先启动相关服务后重启后端。")
    return service


__all__ = [
    "create_jwt_token",
    "verify_jwt_token",
    "require_auth",
    "require_production_auth",
    "optional_auth",
    "require_service",
]
