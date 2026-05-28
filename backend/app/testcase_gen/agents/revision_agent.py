"""
Revision Agent
Targeted revision of test cases - only fixes issues identified by cross review.
Can add new test cases with continued TC-ID numbering.
"""

import logging
from typing import AsyncGenerator

from autogen_agentchat.agents import AssistantAgent
from autogen_agentchat.base import TaskResult
from autogen_agentchat.messages import ModelClientStreamingChunkEvent

from app.testcase_gen.utils.llms import get_model_client, get_model_display_name
from app.testcase_gen.services.prompt_assembler import build_revision_prompt
from app.testcase_gen.utils.logger import logger


_REVISION_SYSTEM = """你是一位资深测试工程师，正在对初稿进行靶向修订。

修订规则：
1. 只修改交叉评审反馈中 affected_cases 列出的用例
2. 未被指出问题的用例必须原样保留，不得修改
3. 对于 coverage_gap/boundary_missing/exception_missing：补充新用例，编号从初稿最大编号续排
4. 对于 duplicate：合并或删除重复项
5. 对于 unexecutable：重写步骤使其可执行
6. 对于 logic_conflict：修正矛盾的预期结果
7. 输出必须符合标准 Markdown 协议：### TC-XXX: 标题，包含优先级/描述/前置条件/步骤表格
8. 不得输出评审报告、功能概述、总结等非用例内容

请以专业的态度进行修订，仅输出修订后的完整测试用例，不要输出任何分析或说明。"""


class RevisionAgent:

    __test__ = False

    def __init__(self):
        self.name = "RevisionAgent"

    async def revise_test_cases(
        self,
        initial_cases: str,
        review_feedback: dict,
        analysis_result: str,
        user_requirements: str,
        max_case_id: int,
        graph_context: str = "",
    ) -> AsyncGenerator[str, None]:
        logger.info("开始靶向修订, max_case_id=%d", max_case_id)
        model_name = get_model_display_name(use_vision=False)

        import json
        review_feedback_json = json.dumps(review_feedback, ensure_ascii=False, indent=2)

        prompt = build_revision_prompt(
            initial_cases=initial_cases,
            review_feedback_json=review_feedback_json,
            analysis_result=analysis_result,
            user_requirements=user_requirements,
            graph_context=graph_context,
            max_case_id=max_case_id,
        )

        agent = AssistantAgent(
            name="revision_agent",
            model_client=get_model_client(use_vision=False),
            system_message=_REVISION_SYSTEM,
            model_client_stream=True,
        )

        revision_content = ""
        try:
            async for event in agent.run_stream(task=prompt):
                if isinstance(event, ModelClientStreamingChunkEvent):
                    chunk = event.content
                    revision_content += chunk
                    yield chunk
                elif isinstance(event, TaskResult):
                    break
        except (GeneratorExit, ValueError):
            pass

        logger.info(
            "靶向修订完成, 内容长度: %d, 模型: %s",
            len(revision_content),
            model_name,
        )


revision_agent = RevisionAgent()
