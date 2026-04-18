"""
速率限制中间件
基于IP地址和用户的请求频率限制
"""

import time
import os
from typing import Dict, Tuple, Optional
from collections import defaultdict
from dataclasses import dataclass, field
from functools import wraps

from fastapi import Request, HTTPException
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.testcase_gen.utils.logger import logger


@dataclass
class RateLimitConfig:
    """速率限制配置"""

    requests_per_minute: int = int(os.getenv("RATE_LIMIT_RPM", "30"))
    requests_per_hour: int = int(os.getenv("RATE_LIMIT_RPH", "100"))
    burst_size: int = int(os.getenv("RATE_LIMIT_BURST", "5"))
    enabled: bool = os.getenv("RATE_LIMIT_ENABLED", "true").lower() == "true"


@dataclass
class TokenBucket:
    """令牌桶算法实现"""

    capacity: int
    tokens: float
    last_refill: float = field(default_factory=time.time)

    def consume(self, tokens: int = 1) -> bool:
        """尝试消费令牌"""
        self._refill()
        if self.tokens >= tokens:
            self.tokens -= tokens
            return True
        return False

    def _refill(self) -> None:
        """补充令牌"""
        now = time.time()
        elapsed = now - self.last_refill
        # 每分钟补充
        new_tokens = elapsed * (self.capacity / 60.0)
        self.tokens = min(self.capacity, self.tokens + new_tokens)
        self.last_refill = now


class RateLimiter:
    """速率限制器"""

    def __init__(self, config: Optional[RateLimitConfig] = None):
        self.config = config or RateLimitConfig()
        # IP地址 -> 令牌桶
        self._buckets: Dict[str, TokenBucket] = {}
        # IP地址 -> (请求数, 窗口开始时间)
        self._request_counts: Dict[str, Tuple[int, float]] = defaultdict(
            lambda: (0, time.time())
        )
        # 清理间隔
        self._last_cleanup = time.time()
        self._cleanup_interval = 300  # 5分钟

    def _get_client_ip(self, request: Request) -> str:
        """获取客户端IP地址"""
        # 检查代理头
        forwarded_for: Optional[str] = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()

        real_ip: Optional[str] = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        return request.client.host if request.client else "unknown"

    def _get_bucket(self, client_ip: str) -> TokenBucket:
        """获取或创建令牌桶"""
        if client_ip not in self._buckets:
            self._buckets[client_ip] = TokenBucket(
                capacity=self.config.burst_size, tokens=self.config.burst_size
            )
        return self._buckets[client_ip]

    def _check_minute_limit(self, client_ip: str) -> bool:
        """检查每分钟限制"""
        count, window_start = self._request_counts[client_ip]
        now = time.time()

        # 窗口已过期，重置
        if now - window_start >= 60:
            self._request_counts[client_ip] = (1, now)
            return True

        # 检查是否超过限制
        if count >= self.config.requests_per_minute:
            return False

        # 增加计数
        self._request_counts[client_ip] = (count + 1, window_start)
        return True

    def _check_hourly_limit(self, client_ip: str) -> bool:
        """检查每小时限制（简化实现）"""
        # 使用令牌桶模拟
        bucket = self._get_bucket(client_ip)
        return bucket.consume()

    def _cleanup_old_entries(self):
        """清理过期的条目"""
        now = time.time()
        if now - self._last_cleanup < self._cleanup_interval:
            return

        # 清理10分钟前的条目
        cutoff = now - 600
        ips_to_remove = []

        for ip, (_, window_start) in self._request_counts.items():
            if window_start < cutoff:
                ips_to_remove.append(ip)

        for ip in ips_to_remove:
            del self._request_counts[ip]
            if ip in self._buckets:
                del self._buckets[ip]

        self._last_cleanup = now
        if ips_to_remove:
            logger.debug(f"清理了 {len(ips_to_remove)} 个过期的速率限制条目")

    def check_rate_limit(self, request: Request) -> Tuple[bool, Dict[str, any]]:
        """
        检查请求是否超过速率限制

        参数:
            request: FastAPI请求对象

        返回:
            (是否允许, 限制信息)
        """
        if not self.config.enabled:
            return True, {"enabled": False}

        client_ip = self._get_client_ip(request)

        # 定期清理
        self._cleanup_old_entries()

        # 检查每分钟限制
        if not self._check_minute_limit(client_ip):
            logger.warning(f"速率限制触发: IP {client_ip} 超过每分钟限制")
            return False, {
                "limit": self.config.requests_per_minute,
                "window": "minute",
                "retry_after": 60,
            }

        # 检查突发限制
        if not self._check_hourly_limit(client_ip):
            logger.warning(f"速率限制触发: IP {client_ip} 超过突发限制")
            return False, {
                "limit": self.config.burst_size,
                "window": "burst",
                "retry_after": 1,
            }

        return True, {
            "enabled": True,
            "remaining_minute": self.config.requests_per_minute
            - self._request_counts[client_ip][0],
            "remaining_burst": int(self._get_bucket(client_ip).tokens),
        }


# 全局速率限制器实例
rate_limiter = RateLimiter()


class RateLimitMiddleware(BaseHTTPMiddleware):
    """速率限制中间件"""

    async def dispatch(self, request: Request, call_next):
        # 跳过健康检查端点
        if request.url.path in ["/", "/api/ping"]:
            return await call_next(request)

        allowed, info = rate_limiter.check_rate_limit(request)

        if not allowed:
            return JSONResponse(
                status_code=429,
                content={
                    "error": "Too Many Requests",
                    "detail": f"请求频率超过限制，请稍后再试",
                    "retry_after": info.get("retry_after", 60),
                },
                headers={
                    "Retry-After": str(info.get("retry_after", 60)),
                    "X-RateLimit-Limit": str(info.get("limit", 0)),
                    "X-RateLimit-Remaining": "0",
                },
            )

        # 添加速率限制响应头
        response = await call_next(request)

        if info.get("enabled"):
            response.headers["X-RateLimit-Remaining-Minute"] = str(
                info.get("remaining_minute", 0)
            )
            response.headers["X-RateLimit-Remaining-Burst"] = str(
                info.get("remaining_burst", 0)
            )

        return response


def rate_limit(requests_per_minute: int = 30):
    """
    装饰器：为特定端点设置速率限制

    用法:
        @rate_limit(requests_per_minute=10)
        async def sensitive_endpoint():
            pass
    """

    def decorator(func):
        @wraps(func)
        async def wrapper(request: Request, *args, **kwargs):
            # 这里可以实现针对特定端点的限制
            # 目前使用全局限制
            allowed, info = rate_limiter.check_rate_limit(request)
            if not allowed:
                raise HTTPException(
                    status_code=429,
                    detail=f"请求频率超过限制，请在 {info.get('retry_after', 60)} 秒后重试",
                )
            return await func(request, *args, **kwargs)

        return wrapper

    return decorator


# 导出
__all__ = [
    "RateLimiter",
    "RateLimitMiddleware",
    "RateLimitConfig",
    "rate_limiter",
    "rate_limit",
]
