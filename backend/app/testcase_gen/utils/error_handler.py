"""
错误处理和重试机制
提供智能体执行的超时、重试和降级策略
"""

import asyncio
from functools import wraps
from typing import AsyncGenerator, Callable, Any, Optional
from app.testcase_gen.utils.logger import logger


class AgentExecutionError(Exception):
    """智能体执行错误"""
    def __init__(self, message: str, agent_name: str, original_error: Optional[Exception] = None):
        self.message = message
        self.agent_name = agent_name
        self.original_error = original_error
        super().__init__(self.message)


class TimeoutError(Exception):
    """执行超时错误"""
    pass


def with_retry(max_retries: int = 3, delay: float = 1.0) -> Callable:
    """
    重试装饰器

    参数:
        max_retries: 最大重试次数
        delay: 重试延迟（秒）

    返回:
        装饰器函数
    """
    def decorator(func: Callable) -> Callable:
        @wraps(func)
        async def wrapper(*args, **kwargs) -> Any:
            last_error = None

            for attempt in range(max_retries):
                try:
                    return await func(*args, **kwargs)
                except Exception as e:
                    last_error = e
                    logger.warning(
                        f"执行失败 (尝试 {attempt + 1}/{max_retries}): {func.__name__}, "
                        f"错误: {str(e)}"
                    )

                    if attempt < max_retries - 1:
                        await asyncio.sleep(delay * (attempt + 1))  # 指数退避

            # 所有重试都失败
            logger.error(f"所有重试失败: {func.__name__}, 最终错误: {str(last_error)}")
            raise AgentExecutionError(
                f"执行失败，已重试{max_retries}次",
                agent_name=func.__name__,
                original_error=last_error
            )

        return wrapper
    return decorator


async def execute_with_timeout(
    coro: AsyncGenerator,
    timeout: float = 300.0,
    agent_name: str = "unknown"
) -> AsyncGenerator[str, None]:
    """
    带超时的执行器

    参数:
        coro: 异步生成器
        timeout: 超时时间（秒），默认5分钟
        agent_name: 智能体名称

    产出:
        流式输出内容
    """
    try:
        async for chunk in asyncio.wait_for(coro, timeout=timeout):
            yield chunk
    except asyncio.TimeoutError:
        error_msg = f"智能体 {agent_name} 执行超时（{timeout}秒）"
        logger.error(error_msg)
        raise TimeoutError(error_msg)


async def safe_stream_generator(
    stream_generator: AsyncGenerator[str, None],
    fallback_content: Optional[str] = None,
    agent_name: str = "unknown"
) -> AsyncGenerator[str, None]:
    """
    安全的流式生成器包装器

    参数:
        stream_generator: 原始流式生成器
        fallback_content: 降级内容（如果失败）
        agent_name: 智能体名称

    产出:
        流式输出内容，失败时输出降级内容
    """
    content = ""
    has_error = False

    try:
        async for chunk in stream_generator:
            content += chunk
            yield chunk
    except Exception as e:
        has_error = True
        error_msg = f"智能体 {agent_name} 执行失败: {str(e)}"
        logger.error(error_msg, exc_info=True)

        # 如果有降级内容，输出降级内容
        if fallback_content:
            logger.info(f"使用降级内容: {agent_name}")
            yield f"\n\n**注意**: 智能体执行遇到问题，使用备用内容\n\n"
            yield fallback_content
        else:
            # 没有降级内容，输出错误信息
            yield f"\n\n**错误**: {error_msg}\n\n"

    if not has_error:
        logger.info(f"智能体 {agent_name} 执行成功，内容长度: {len(content)}")


class FallbackStrategy:
    """降级策略管理器"""

    @staticmethod
    def get_fallback_for_reviewer(test_cases_content: str) -> str:
        """评审智能体的降级策略：直接返回原始测试用例"""
        return f"""
**===最终测试用例===**

{test_cases_content}

---

**注意**: 评审阶段遇到问题，已直接输出生成的测试用例。建议人工检查测试用例质量。
"""

    @staticmethod
    def get_fallback_for_generator(analysis_result: str) -> str:
        """生成智能体的降级策略：基于需求分析生成简化测试用例"""
        return """
## TC-001: 基本功能测试

**优先级:** 高

**描述:** 测试基本功能是否正常工作

**前置条件:** 系统正常运行

### 测试步骤

| # | 步骤描述 | 预期结果 |
| --- | --- | --- |
| 1 | 验证基本功能 | 功能正常工作 |

---

**注意**: 测试用例生成阶段遇到问题，已生成基础测试用例。建议根据需求分析手动补充。
"""

    @staticmethod
    def get_fallback_for_analyzer(user_requirements: str) -> str:
        """分析智能体的降级策略：输出简化的需求分析"""
        return f"""
# 需求分析阶段

**分析文件**: 未知
**文件类型**: 未知
**使用模型**: 默认模型

---

## 1. 功能概述

基于用户需求进行分析。

## 用户需求

{user_requirements}

## 7. 测试重点建议

- 验证核心功能
- 检查边界条件
- 测试异常场景

---

**注意**: 需求分析阶段遇到问题，已生成简化分析。建议人工详细分析需求。
"""
