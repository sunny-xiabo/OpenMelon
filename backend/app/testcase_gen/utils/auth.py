"""
API认证中间件
支持API Key认证和可选的JWT Token认证
"""

import secrets
import os
import base64
import hashlib
import hmac
import json
from typing import Optional, Dict, Any, Callable
from functools import wraps
from datetime import datetime, timedelta, timezone

from fastapi import Request, HTTPException, Depends
from fastapi.security import APIKeyHeader

from app.api.errors import InternalError, UnauthorizedError
from app.testcase_gen.utils.logger import logger


# 配置
API_KEY_HEADER = APIKeyHeader(name="X-API-Key", auto_error=False)
JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY", secrets.token_urlsafe(32))
JWT_ALGORITHM = "HS256"
JWT_EXPIRATION_HOURS = int(os.getenv("JWT_EXPIRATION_HOURS", "24"))

# 从环境变量读取有效的API Keys
_valid_api_keys_str = os.getenv("VALID_API_KEYS", "")
VALID_API_KEYS: Dict[str, Dict[str, Any]] = {}

if _valid_api_keys_str:
    for key_pair in _valid_api_keys_str.split(","):
        if ":" in key_pair:
            key, name = key_pair.strip().split(":", 1)
            VALID_API_KEYS[key.strip()] = {
                "name": name.strip(),
                "created_at": datetime.now(),
            }


def generate_api_key() -> str:
    """生成新的API Key"""
    return f"tcg_{secrets.token_urlsafe(32)}"


def _base64url_encode(data: bytes) -> str:
    return base64.urlsafe_b64encode(data).rstrip(b"=").decode("ascii")


def _base64url_decode(data: str) -> bytes:
    padding = "=" * (-len(data) % 4)
    return base64.urlsafe_b64decode(f"{data}{padding}")


def _json_default(value: Any) -> Any:
    if isinstance(value, datetime):
        return int(value.timestamp())
    raise TypeError(f"Object of type {type(value).__name__} is not JSON serializable")


def _sign_jwt_part(header_part: str, payload_part: str) -> str:
    signing_input = f"{header_part}.{payload_part}".encode("ascii")
    digest = hmac.new(JWT_SECRET_KEY.encode("utf-8"), signing_input, hashlib.sha256).digest()
    return _base64url_encode(digest)


def create_jwt_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """
    创建JWT Token

    参数:
        data: 要编码的数据
        expires_delta: 过期时间增量

    返回:
        JWT Token字符串
    """
    to_encode = data.copy()
    if expires_delta:
        expire = datetime.now(timezone.utc) + expires_delta
    else:
        expire = datetime.now(timezone.utc) + timedelta(hours=JWT_EXPIRATION_HOURS)

    to_encode.update({"exp": int(expire.timestamp())})
    header = {"alg": JWT_ALGORITHM, "typ": "JWT"}
    header_part = _base64url_encode(
        json.dumps(header, separators=(",", ":"), sort_keys=True).encode("utf-8")
    )
    payload_part = _base64url_encode(
        json.dumps(
            to_encode,
            default=_json_default,
            separators=(",", ":"),
            sort_keys=True,
        ).encode("utf-8")
    )
    signature_part = _sign_jwt_part(header_part, payload_part)
    return f"{header_part}.{payload_part}.{signature_part}"


def verify_jwt_token(token: str) -> Optional[Dict[str, Any]]:
    """
    验证JWT Token

    参数:
        token: JWT Token字符串

    返回:
        解码后的数据，验证失败返回None
    """
    try:
        header_part, payload_part, signature_part = token.split(".", 2)
        expected_signature = _sign_jwt_part(header_part, payload_part)
        if not hmac.compare_digest(signature_part, expected_signature):
            raise ValueError("invalid signature")

        header = json.loads(_base64url_decode(header_part))
        if header.get("alg") != JWT_ALGORITHM:
            raise ValueError("unsupported algorithm")

        payload = json.loads(_base64url_decode(payload_part))
        exp = payload.get("exp")
        if exp is not None and datetime.now(timezone.utc).timestamp() > float(exp):
            raise ValueError("token expired")
        return payload
    except Exception as e:
        logger.warning(f"JWT验证失败: {str(e)}")
        return None


def verify_api_key(api_key: str) -> bool:
    """
    验证API Key

    参数:
        api_key: API Key字符串

    返回:
        是否有效
    """
    if not VALID_API_KEYS:
        # 如果没有配置API Keys，则禁用认证（开发模式）
        return True

    return api_key in VALID_API_KEYS


async def get_current_user(
    request: Request, api_key: Optional[str] = Depends(API_KEY_HEADER)
) -> Dict[str, Any]:
    """
    获取当前用户（通过API Key或JWT Token）

    参数:
        request: FastAPI请求对象
        api_key: 从请求头获取的API Key

    返回:
        用户信息字典

    异常:
        HTTPException: 认证失败
    """
    # 检查是否禁用认证（开发模式）
    if not VALID_API_KEYS:
        return {"authenticated": False, "mode": "development"}

    # 1. 尝试从请求头获取API Key
    if api_key and verify_api_key(api_key):
        user_info = VALID_API_KEYS.get(api_key, {})
        logger.info(f"API Key认证成功: {user_info.get('name', 'unknown')}")
        return {
            "authenticated": True,
            "method": "api_key",
            "name": user_info.get("name", "unknown"),
        }

    # 2. 尝试从Authorization头获取JWT Token
    auth_header = request.headers.get("Authorization")
    if auth_header and auth_header.startswith("Bearer "):
        token = auth_header.split(" ", 1)[1]
        payload = verify_jwt_token(token)
        if payload:
            logger.info(f"JWT认证成功: {payload.get('sub', 'unknown')}")
            return {"authenticated": True, "method": "jwt", "user": payload.get("sub")}

    # 3. 认证失败
    raise UnauthorizedError(message="未提供有效的认证凭据")


async def optional_auth(
    request: Request, api_key: Optional[str] = Depends(API_KEY_HEADER)
) -> Dict[str, Any]:
    """
    可选认证（不强制要求认证）

    参数:
        request: FastAPI请求对象
        api_key: 从请求头获取的API Key

    返回:
        用户信息字典，未认证返回匿名信息
    """
    # 检查是否禁用认证
    if not VALID_API_KEYS:
        return {"authenticated": False, "mode": "development"}

    # 尝试认证
    try:
        return await get_current_user(request, api_key)
    except (HTTPException, UnauthorizedError):
        return {"authenticated": False, "mode": "anonymous"}


def require_auth(func: Callable) -> Callable:
    """
    装饰器：要求认证

    用法:
        @require_auth
        async def protected_endpoint():
            pass

    参数:
        func: 要保护的函数

    返回:
        包装后的函数
    """

    @wraps(func)
    async def wrapper(*args, **kwargs) -> Any:
        request: Optional[Request] = kwargs.get("request")
        if not request:
            for arg in args:
                if isinstance(arg, Request):
                    request = arg
                    break

        if not request:
            raise InternalError(details="无法获取请求对象")

        # 检查是否禁用认证
        if not VALID_API_KEYS:
            return await func(*args, **kwargs)

        api_key: Optional[str] = request.headers.get("X-API-Key")
        await get_current_user(request, api_key)
        return await func(*args, **kwargs)

    return wrapper


# 导出
__all__ = [
    "generate_api_key",
    "create_jwt_token",
    "verify_jwt_token",
    "verify_api_key",
    "get_current_user",
    "optional_auth",
    "require_auth",
    "VALID_API_KEYS",
]
