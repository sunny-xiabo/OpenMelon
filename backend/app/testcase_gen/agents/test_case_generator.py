"""
测试用例生成智能体
负责基于需求分析结果生成详细的测试用例
"""

import json
import sys
import os
from typing import List, Dict, Any, AsyncGenerator

# 添加父目录到路径
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.base import TaskResult
from autogen_agentchat.messages import ModelClientStreamingChunkEvent

from app.testcase_gen.utils.llms import (
    model_client,
    deepseek_model_client,
    QWEN_MODEL_NAME,
    DEEPSEEK_MODEL_NAME,
)
from app.testcase_gen.utils.logger import logger


class TestCaseGenerator:
    """测试用例生成智能体 - 负责生成详细的测试用例"""

    def __init__(self):
        self.name = "TestCaseGenerator"

    def _get_model_client_for_file_type(self, file_path: str):
        """根据文件类型选择合适的模型客户端"""
        file_extension = file_path.lower().split(".")[-1] if "." in file_path else ""

        # 图像文件使用支持视觉的模型
        if file_extension in ["png", "jpg", "jpeg", "gif", "bmp", "webp"]:
            return model_client
        else:
            return deepseek_model_client

    async def generate_test_cases_stream(
        self,
        file_path: str,
        context: str,
        user_requirements: str,
        analysis_result: str,
        graph_context: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        基于需求分析结果生成测试用例

        参数:
            file_path: 文件路径
            context: 用户上下文
            user_requirements: 用户需求
            analysis_result: 需求分析结果

        产出:
            测试用例（Markdown格式）
        """
        selected_model_client = self._get_model_client_for_file_type(file_path)
        file_extension = file_path.lower().split(".")[-1] if "." in file_path else ""

        logger.info(
            f"测试用例生成 - 文件类型: {file_extension}, 模型: {DEEPSEEK_MODEL_NAME if selected_model_client == deepseek_model_client else QWEN_MODEL_NAME}"
        )

        graph_prefix = (
            f"## 知识图谱上下文\n\n{graph_context}\n\n" if graph_context else ""
        )

        prompt = f"""{graph_prefix}基于需求分析结果，生成详细的测试用例。

## 需求分析结果
{analysis_result}

## 用户原始需求
{user_requirements}

## 上下文信息
{context}

**要求**：
1. 每个用例以 "### TC-XXX: 标题" 格式开始（**注意：必须是三个 # 号**）
2. 必须包含：优先级(高/中/低)、描述、前置条件
3. 测试步骤用表格：| # | 步骤描述 | 预期结果 |
4. 覆盖正向、负向、边界场景
5. 根据需求分析结果尽可能全面地生成测试用例，勿遗漏任何重要场景
6. 直接开始输出测试用例列表，**不要**包含任何“功能概述”、“总结”、“前言”或“评价”部分。每一个 ### 标题都必须是一个独立的测试用例。"""

        system_message = "你是一位资深的测试工程师，擅长设计全面的测试用例。"

        agent = AssistantAgent(
            name="test_case_generator",
            model_client=selected_model_client,
            system_message=system_message,
            model_client_stream=True,
        )

        yield "# 测试用例生成阶段\n\n"
        yield f"**文件类型**: {file_extension.upper()}\n"
        yield f"**使用模型**: {DEEPSEEK_MODEL_NAME if selected_model_client == deepseek_model_client else QWEN_MODEL_NAME}\n"
        yield "\n---\n\n"

        test_cases_content = ""
        try:
            async for event in agent.run_stream(task=prompt):
                if isinstance(event, ModelClientStreamingChunkEvent):
                    chunk = event.content
                    test_cases_content += chunk
                    yield chunk
                elif isinstance(event, TaskResult):
                    break
        except (GeneratorExit, ValueError):
            pass

        logger.info(f"测试用例生成完成，内容长度: {len(test_cases_content)}")


# 创建全局实例
test_case_generator = TestCaseGenerator()
