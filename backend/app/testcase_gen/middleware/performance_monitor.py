"""
性能监控中间件
记录API响应时间，识别慢请求，提供性能统计
"""

import time
from typing import Callable, Optional
from fastapi import Request, Response
from starlette.middleware.base import BaseHTTPMiddleware
from starlette.responses import JSONResponse

from app.testcase_gen.utils.logger import logger


class PerformanceMonitorMiddleware(BaseHTTPMiddleware):
    """
    性能监控中间件

    功能：
    - 记录每个请求的处理时间
    - 识别慢请求（超过阈值）
    - 添加处理时间响应头
    """

    def __init__(self, app, slow_request_threshold: float = 1.0):
        """
        初始化性能监控中间件

        参数:
            app: FastAPI应用实例
            slow_request_threshold: 慢请求阈值（秒）
        """
        super().__init__(app)
        self.slow_request_threshold = slow_request_threshold

    async def dispatch(self, request: Request, call_next: Callable) -> Response:
        """
        处理请求并监控性能

        参数:
            request: FastAPI请求对象
            call_next: 下一个中间件或路由处理函数

        返回:
            FastAPI响应对象
        """
        # 记录开始时间
        start_time = time.time()

        # 调用下一个处理器
        response = await call_next(request)

        # 计算处理时间
        process_time = time.time() - start_time

        # 添加处理时间到响应头
        response.headers["X-Process-Time"] = f"{process_time:.4f}"
        response.headers["X-Process-Time-Ms"] = f"{process_time * 1000:.2f}"

        # 记录请求信息
        method = request.method
        path = request.url.path
        client_ip = self._get_client_ip(request)

        # 记录慢请求
        if process_time > self.slow_request_threshold:
            logger.warning(
                f"慢请求 [{client_ip}] {method} {path} - "
                f"耗时: {process_time:.2f}s, "
                f"状态码: {response.status_code}"
            )
        else:
            # 记录普通请求（DEBUG级别）
            logger.debug(
                f"请求 [{client_ip}] {method} {path} - "
                f"耗时: {process_time:.4f}s, "
                f"状态码: {response.status_code}"
            )

        return response

    def _get_client_ip(self, request: Request) -> str:
        """
        获取客户端IP地址

        参数:
            request: FastAPI请求对象

        返回:
            客户端IP地址
        """
        # 检查代理头
        forwarded_for = request.headers.get("X-Forwarded-For")
        if forwarded_for:
            return forwarded_for.split(",")[0].strip()

        real_ip = request.headers.get("X-Real-IP")
        if real_ip:
            return real_ip

        return request.client.host if request.client else "unknown"


class PerformanceStats:
    """
    性能统计类

    收集和分析API性能数据
    """

    def __init__(self):
        self._stats = {}
        self._total_requests = 0
        self._total_time = 0.0

    def record(self, path: str, method: str, process_time: float, status_code: int):
        """
        记录请求性能数据

        参数:
            path: 请求路径
            method: 请求方法
            process_time: 处理时间
            status_code: 状态码
        """
        key = f"{method} {path}"

        if key not in self._stats:
            self._stats[key] = {
                "count": 0,
                "total_time": 0.0,
                "min_time": float("inf"),
                "max_time": 0.0,
                "avg_time": 0.0,
                "status_codes": {},
            }

        stat = self._stats[key]
        stat["count"] += 1
        stat["total_time"] += process_time
        stat["min_time"] = min(stat["min_time"], process_time)
        stat["max_time"] = max(stat["max_time"], process_time)
        stat["avg_time"] = stat["total_time"] / stat["count"]

        # 记录状态码分布
        status_str = str(status_code)
        if status_str not in stat["status_codes"]:
            stat["status_codes"][status_str] = 0
        stat["status_codes"][status_str] += 1

        # 更新全局统计
        self._total_requests += 1
        self._total_time += process_time

    def get_stats(self) -> dict:
        """
        获取性能统计信息

        返回:
            统计信息字典
        """
        return {
            "total_requests": self._total_requests,
            "total_time": self._total_time,
            "avg_time": (
                self._total_time / self._total_requests if self._total_requests > 0 else 0
            ),
            "endpoints": self._stats,
        }

    def get_slow_endpoints(self, threshold: float = 1.0) -> list:
        """
        获取慢端点列表

        参数:
            threshold: 平均响应时间阈值（秒）

        返回:
            慢端点列表
        """
        slow_endpoints = []

        for endpoint, stat in self._stats.items():
            if stat["avg_time"] > threshold:
                slow_endpoints.append(
                    {
                        "endpoint": endpoint,
                        "avg_time": stat["avg_time"],
                        "max_time": stat["max_time"],
                        "count": stat["count"],
                    }
                )

        # 按平均时间降序排序
        slow_endpoints.sort(key=lambda x: x["avg_time"], reverse=True)
        return slow_endpoints

    def reset(self):
        """重置统计信息"""
        self._stats = {}
        self._total_requests = 0
        self._total_time = 0.0


# 全局性能统计实例
performance_stats = PerformanceStats()
performance_monitor = performance_stats  # 别名，便于使用


# 导出
__all__ = ["PerformanceMonitorMiddleware", "PerformanceStats", "performance_stats", "performance_monitor"]
