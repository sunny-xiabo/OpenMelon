"""
LLM 调用重试与熔断机制

提供 call_llm_with_retry() 函数，封装 OpenAI chat.completions.create 调用，
内置指数退避重试和熔断器保护。
"""

import asyncio
import time
import logging
from typing import Any

from openai import (
    APIStatusError,
    APITimeoutError,
    APIConnectionError,
    RateLimitError,
)

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# 配置常量（可通过 settings 覆盖，这里提供合理默认值）
# ---------------------------------------------------------------------------
_DEFAULT_MAX_ATTEMPTS = 3
_DEFAULT_BASE_DELAY = 1.0       # 秒
_DEFAULT_MAX_DELAY = 30.0       # 秒
_DEFAULT_BACKOFF_FACTOR = 2.0

_CIRCUIT_BREAKER_THRESHOLD = 5  # 连续失败多少次触发熔断
_CIRCUIT_BREAKER_COOLDOWN = 60  # 熔断冷却时间（秒）


# ---------------------------------------------------------------------------
# 熔断器
# ---------------------------------------------------------------------------
class CircuitBreaker:
    """简单的熔断器：连续失败超过阈值后拒绝调用，冷却后自动恢复。"""

    def __init__(
        self,
        threshold: int = _CIRCUIT_BREAKER_THRESHOLD,
        cooldown: float = _CIRCUIT_BREAKER_COOLDOWN,
    ) -> None:
        self._threshold = threshold
        self._cooldown = cooldown
        self._consecutive_failures = 0
        self._last_failure_ts: float = 0.0
        self._tripped = False

    @property
    def is_open(self) -> bool:
        """熔断器是否处于打开状态（拒绝调用）。"""
        if not self._tripped:
            return False
        # 冷却时间过后自动恢复
        if time.monotonic() - self._last_failure_ts >= self._cooldown:
            logger.info("熔断器冷却结束，恢复正常调用")
            self._tripped = False
            self._consecutive_failures = 0
            return False
        return True

    def record_success(self) -> None:
        self._consecutive_failures = 0
        if self._tripped:
            logger.info("熔断器恢复：调用成功")
            self._tripped = False

    def record_failure(self) -> None:
        self._consecutive_failures += 1
        self._last_failure_ts = time.monotonic()
        if self._consecutive_failures >= self._threshold:
            if not self._tripped:
                logger.warning(
                    "熔断器触发：连续失败 %d 次，暂停调用 %d 秒",
                    self._consecutive_failures,
                    self._cooldown,
                )
            self._tripped = True


# 全局熔断器实例（按 provider 隔离可后续扩展，当前共享一个）
_global_breaker = CircuitBreaker()


def get_circuit_breaker() -> CircuitBreaker:
    return _global_breaker


# ---------------------------------------------------------------------------
# 重试调用
# ---------------------------------------------------------------------------
def _is_retryable(exc: Exception) -> bool:
    """判断异常是否值得重试。"""
    if isinstance(exc, RateLimitError):
        return True
    if isinstance(exc, APITimeoutError):
        return True
    if isinstance(exc, APIConnectionError):
        return True
    if isinstance(exc, APIStatusError) and exc.status_code >= 500:
        return True
    return False


def _get_retry_after(exc: Exception) -> float | None:
    """从异常中提取 Retry-After 头（秒）。"""
    if isinstance(exc, APIStatusError) and hasattr(exc, "response"):
        retry_after = exc.response.headers.get("retry-after")
        if retry_after:
            try:
                return float(retry_after)
            except (ValueError, TypeError):
                pass
    return None


async def call_llm_with_retry(
    client: Any,
    *,
    model: str,
    messages: list,
    max_attempts: int = _DEFAULT_MAX_ATTEMPTS,
    base_delay: float = _DEFAULT_BASE_DELAY,
    max_delay: float = _DEFAULT_MAX_DELAY,
    backoff_factor: float = _DEFAULT_BACKOFF_FACTOR,
    breaker: CircuitBreaker | None = None,
    **kwargs: Any,
) -> Any:
    """
    封装 OpenAI chat.completions.create 调用，带指数退避重试和熔断保护。

    参数:
        client: AsyncOpenAI 或兼容客户端实例
        model: 模型名称
        messages: 消息列表
        max_attempts: 最大尝试次数（含首次）
        base_delay: 基础重试延迟（秒）
        max_delay: 最大重试延迟（秒）
        backoff_factor: 退避因子
        breaker: 熔断器实例，默认使用全局熔断器
        **kwargs: 传递给 chat.completions.create 的额外参数

    返回:
        OpenAI ChatCompletion 响应对象

    异常:
        最后一次重试仍失败时抛出原始异常
    """
    if breaker is None:
        breaker = _global_breaker

    if breaker.is_open:
        raise RuntimeError(
            "LLM 调用已被熔断器暂停，请稍后重试"
        )

    last_exc: Exception | None = None

    for attempt in range(1, max_attempts + 1):
        try:
            response = await client.chat.completions.create(
                model=model,
                messages=messages,
                **kwargs,
            )
            breaker.record_success()
            return response

        except Exception as exc:
            last_exc = exc

            if not _is_retryable(exc) or attempt == max_attempts:
                breaker.record_failure()
                raise

            # 计算延迟：优先使用服务端 Retry-After，否则指数退避
            retry_after = _get_retry_after(exc)
            if retry_after is not None:
                delay = retry_after
            else:
                delay = min(base_delay * (backoff_factor ** (attempt - 1)), max_delay)

            logger.warning(
                "LLM 调用失败 (尝试 %d/%d)，%0.1f 秒后重试: %s",
                attempt,
                max_attempts,
                delay,
                exc,
            )
            await asyncio.sleep(delay)

    # 理论上不会到这里，但防御性抛出
    if last_exc is not None:
        raise last_exc
    raise RuntimeError("LLM 调用失败，未知错误")
