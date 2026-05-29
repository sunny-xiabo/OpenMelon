"""
API认证中间件（向后兼容包装）

实际认证逻辑已统一到 app.auth 模块。
此文件保留原有导出接口，确保任何直接导入此模块的代码继续工作。
"""

from app.auth import (  # noqa: F401
    create_jwt_token,
    verify_jwt_token,
    require_auth,
    optional_auth,
)

from app.auth import ADMIN_API_KEY_HEADER as API_KEY_HEADER  # noqa: F401

from app.config import settings


def generate_api_key() -> str:
    """生成新的 API Key（用于管理接口）。"""
    import secrets
    return f"tcg_{secrets.token_urlsafe(32)}"


def verify_api_key(api_key: str) -> bool:
    """验证 API Key 是否有效。未启用认证时始终返回 True。"""
    if not settings.PROTECT_ADMIN_API:
        return True
    from app.auth import _candidate_matches_any
    return _candidate_matches_any(api_key, settings.admin_api_keys)


async def get_current_user(request, api_key=None):
    """获取当前用户信息，向后兼容旧接口。"""
    from app.auth import optional_auth as _optional_auth
    return await _optional_auth(request, api_key)


__all__ = [
    "generate_api_key",
    "create_jwt_token",
    "verify_jwt_token",
    "verify_api_key",
    "get_current_user",
    "optional_auth",
    "require_auth",
]
