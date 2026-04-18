"""
智能体基类
提供所有智能体的公共功能
"""

import os
from typing import AsyncGenerator, Dict, Any, Optional
from abc import ABC, abstractmethod

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.base import TaskResult
from autogen_agentchat.messages import ModelClientStreamingChunkEvent

from app.testcase_gen.utils.llms import (
    model_client,
    deepseek_model_client,
    QWEN_MODEL_NAME,
    DEEPSEEK_MODEL_NAME,
    get_model_config,
)
from app.testcase_gen.utils.logger import logger
from app.testcase_gen.services.pdf_service import pdf_service
from app.testcase_gen.services.openapi_service import openapi_service


class BaseAgent(ABC):
    """智能体基类"""

    def __init__(self, name: str):
        self.name = name

    def get_model_client_for_file_type(self, file_path: str):
        """
        根据文件类型选择合适的模型客户端

        参数:
            file_path: 文件路径

        返回:
            模型客户端实例
        """
        file_extension = file_path.lower().split(".")[-1] if "." in file_path else ""

        # 图像文件使用支持视觉的模型客户端
        if file_extension in ["png", "jpg", "jpeg", "gif", "bmp", "webp"]:
            return model_client  # 支持视觉的模型
        else:
            return deepseek_model_client

    def get_file_extension(self, file_path: str) -> str:
        """获取文件扩展名"""
        return file_path.lower().split(".")[-1] if "." in file_path else ""

    def is_image_file(self, file_path: str) -> bool:
        """判断是否为图像文件"""
        ext = self.get_file_extension(file_path)
        return ext in ["png", "jpg", "jpeg", "gif", "bmp", "webp"]

    def is_pdf_file(self, file_path: str) -> bool:
        """判断是否为PDF文件"""
        return self.get_file_extension(file_path) == "pdf"

    def is_openapi_file(self, file_path: str) -> bool:
        """判断是否为OpenAPI文件"""
        return self.get_file_extension(file_path) in ["json", "yaml", "yml"]

    async def read_file_content(self, file_path: str) -> str:
        """
        根据文件类型读取文件内容

        参数:
            file_path: 文件路径

        返回:
            文件内容（文本格式）
        """
        file_extension = self.get_file_extension(file_path)

        if self.is_pdf_file(file_path):
            return pdf_service.extract_text_from_pdf(file_path)
        elif self.is_openapi_file(file_path):
            return openapi_service.parse_openapi_file(file_path)
        else:
            # 文本文件
            try:
                with open(file_path, "r", encoding="utf-8") as f:
                    return f.read()
            except UnicodeDecodeError:
                # 尝试其他编码
                with open(file_path, "r", encoding="gbk") as f:
                    return f.read()

    def create_agent(
        self, system_message: str, model_client_instance=None
    ) -> AssistantAgent:
        """
        创建AutoGen智能体

        参数:
            system_message: 系统消息
            model_client_instance: 模型客户端实例（可选）

        返回:
            AssistantAgent实例
        """
        client = model_client_instance or deepseek_model_client

        return AssistantAgent(
            name=self.name,
            model_client=client,
            system_message=system_message,
            model_client_stream=True,  # 启用流式输出
        )

    @abstractmethod
    async def process(
        self, file_path: str, context: str, requirements: str, **kwargs
    ) -> AsyncGenerator[str, None]:
        """
        处理请求（子类必须实现）

        参数:
            file_path: 文件路径
            context: 上下文信息
            requirements: 需求信息

        产出:
            流式输出结果
        """
        pass

    def log_start(self, file_path: str, **kwargs):
        """记录开始处理日志"""
        logger.info(f"[{self.name}] 开始处理 - 文件: {file_path}")
        for key, value in kwargs.items():
            logger.debug(f"[{self.name}] 参数 {key}: {value}")

    def log_complete(self, result_length: int):
        """记录完成处理日志"""
        logger.info(f"[{self.name}] 处理完成 - 结果长度: {result_length}")

    def log_error(self, error: Exception):
        """记录错误日志"""
        logger.error(f"[{self.name}] 处理失败: {str(error)}", exc_info=True)


class StreamingProcessor:
    """流式处理器 - 处理AutoGen的流式输出"""

    @staticmethod
    async def process_stream(stream) -> AsyncGenerator[str, None]:
        """
        处理AutoGen流式输出

        参数:
            stream: AutoGen流式迭代器

        产出:
            文本块
        """
        async for chunk in stream:
            if isinstance(chunk, ModelClientStreamingChunkEvent):
                yield chunk.content
            elif isinstance(chunk, TaskResult):
                # 最终结果，包含完整消息
                if chunk.messages:
                    last_message = chunk.messages[-1]
                    if hasattr(last_message, "content"):
                        # 如果还没有流式输出过内容，输出最终内容
                        pass  # 内容已经在流式chunks中输出了

    @staticmethod
    def get_fallback_content(agent_name: str, context: str = "") -> str:
        """
        获取降级内容（当AI服务失败时）

        参数:
            agent_name: 智能体名称
            context: 上下文信息

        返回:
            降级内容
        """
        fallback_messages = {
            "RequirementAnalyzer": f"""## 需求分析（降级模式）

由于AI服务暂时不可用，无法完成需求分析。

**基本信息：**
- 分析时间：当前
- 状态：等待AI服务恢复

**建议：**
1. 检查网络连接
2. 确认API配置正确
3. 稍后重试

**提供的上下文：**
{context[:500] if context else "无"}
""",
            "TestCaseGenerator": f"""## 测试用例（降级模式）

由于AI服务暂时不可用，无法生成详细测试用例。

**基本测试框架：**

### TC-001: 基础功能测试
- **优先级：** 高
- **描述：** 验证基本功能可用性
- **步骤：** 访问系统，执行基本操作
- **预期：** 系统正常响应

### TC-002: 边界条件测试
- **优先级：** 中
- **描述：** 测试边界输入
- **步骤：** 输入边界值
- **预期：** 系统正确处理

### TC-003: 错误处理测试
- **优先级：** 中
- **描述：** 验证错误处理机制
- **步骤：** 触发错误条件
- **预期：** 显示适当错误信息
""",
            "TestCaseReviewer": f"""## 评审报告（降级模式）

由于AI服务暂时不可用，无法完成详细评审。

**基本信息：**
- 评审时间：当前
- 状态：等待AI服务恢复

**建议：**
1. 手动检查测试用例完整性
2. 确认覆盖所有功能点
3. 稍后重新评审
""",
        }

        return fallback_messages.get(
            agent_name, f"AI服务暂时不可用，请稍后重试。智能体: {agent_name}"
        )


# 导出
__all__ = ["BaseAgent", "StreamingProcessor"]
