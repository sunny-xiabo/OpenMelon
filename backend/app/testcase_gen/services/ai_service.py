"""
AI服务 - 协调三个智能体的工作流程
需求分析 → 测试用例生成 → 测试用例评审
"""

import json
from typing import List, Dict, Any, AsyncGenerator, Optional

from app.testcase_gen.models.test_case import TestCase
from app.testcase_gen.utils.logger import logger
from app.testcase_gen.utils.performance_optimizer import (
    response_cache,
    FileProcessingOptimizer,
    Timer,
)

from app.testcase_gen.agents.requirement_analyzer import requirement_analyzer
from app.testcase_gen.agents.test_case_generator import test_case_generator
from app.testcase_gen.agents.test_case_reviewer import test_case_reviewer
from app.testcase_gen.services.neo4j_writer import neo4j_writer
from app.testcase_gen.services.graph_context_retriever import (
    get_graph_context_retriever,
)

FINAL_MARKER = "**===最终测试用例===**"


class AIService:
    """AI服务 - 协调三个智能体的工作流程"""

    def __init__(self):
        self.name = "AIService"

    async def generate_test_cases_stream(
        self,
        file_path: str,
        context: str,
        requirements: str,
        module: Optional[str] = None,
        vector_context: str = "",
    ) -> AsyncGenerator[str, None]:
        """
        三阶段流程：需求分析 → 测试用例生成 → 测试用例评审

        参数:
            file_path: 文件路径
            context: 用户上下文
            requirements: 用户需求

        产出:
            Markdown 格式的三阶段输出
        """
        with Timer("三阶段流程总耗时"):
            try:
                logger.info(f"开始三阶段流程 - 文件: {file_path}")

                cache_key = None
                try:
                    file_hash = FileProcessingOptimizer.calculate_file_hash(file_path)
                    cache_key = f"{file_hash}_{hash(context)}_{hash(requirements)}"
                except Exception as e:
                    logger.warning(f"计算文件哈希失败，跳过缓存: {str(e)}")

                # 检查缓存
                if cache_key:
                    cached_response = response_cache.get(cache_key)
                    if cached_response:
                        logger.info("使用缓存的响应")
                        yield cached_response
                        return

                # 收集各阶段结果
                analysis_result = ""
                test_cases_result = ""
                full_response = ""

                # 检索图谱知识
                graph_context = ""
                try:
                    retriever = get_graph_context_retriever()
                    if retriever:
                        graph_context = await retriever.retrieve(module=module)
                        if graph_context:
                            logger.info(f"图谱上下文已检索，长度: {len(graph_context)}")
                except Exception as e:
                    logger.warning(f"检索图谱上下文失败，将仅使用文件内容: {e}")

                enriched_context = context
                if graph_context:
                    enriched_context = f"{graph_context}\n\n用户上传的上下文: {enriched_context}"
                else:
                    enriched_context = f"用户上传的上下文: {enriched_context}"
                    
                if vector_context:
                    enriched_context = f"## 语义相似度参考知识\n{vector_context}\n\n{enriched_context}"

                # ==================== 阶段1：需求分析 ====================
                logger.info("阶段1/3: 需求分析")
                async for chunk in requirement_analyzer.analyze_requirements_stream(
                    file_path, enriched_context, requirements, graph_context=graph_context
                ):
                    yield chunk
                    analysis_result += chunk
                    full_response += chunk

                # ==================== 阶段2：测试用例生成 ====================
                logger.info("阶段2/3: 测试用例生成")
                async for chunk in test_case_generator.generate_test_cases_stream(
                    file_path,
                    enriched_context,
                    requirements,
                    analysis_result,
                    graph_context=graph_context,
                ):
                    yield chunk
                    test_cases_result += chunk
                    full_response += chunk

                # ==================== 阶段3：测试用例评审 ====================
                logger.info("阶段3/3: 测试用例评审")
                async for chunk in test_case_reviewer.review_test_cases_stream(
                    test_cases_result,
                    analysis_result,
                    requirements,
                    graph_context=graph_context,
                ):
                    yield chunk
                    full_response += chunk

                # 缓存完整响应
                if cache_key and full_response:
                    response_cache.set(cache_key, full_response, ttl=600)
                    logger.info("已缓存响应结果")

                # 后台写入 Neo4j
                if neo4j_writer:
                    import asyncio
                    import re

                    tc_pattern = r"###\s*(?:TC\d+[:\s]+)?(.+?)(?:\n|$)"
                    tc_names = re.findall(tc_pattern, full_response)
                    if tc_names:
                        asyncio.create_task(
                            neo4j_writer.write_test_cases(
                                [{"name": n.strip(), "description": ""} for n in tc_names],
                                module=module,
                            )
                        )

                # 确保最终标记存在
                if FINAL_MARKER not in full_response:
                    final_signal = f"\n\n{FINAL_MARKER}\n以上为生成的最终测试用例结果。"
                    yield final_signal
                    full_response += final_signal

                logger.info("三阶段流程完成，已发送最终标记")
            except Exception as e:
                logger.error(f"流式生成过程中发生错误: {str(e)}", exc_info=True)
                yield f"\n\n> [!ERROR]\n> 生成失败: {str(e)}"
            finally:
                logger.info("三阶段流式过程结束")

    def generate_mindmap_from_test_cases(
        self, test_cases: List[Dict[str, Any]]
    ) -> Dict[str, Any]:
        """从测试用例生成思维导图数据"""
        if not test_cases:
            return {"name": "测试用例", "children": []}

        mindmap = {"name": "测试用例总览", "children": []}
        priority_groups = {}
        for tc in test_cases:
            priority = tc.get("priority", "Medium")
            if priority not in priority_groups:
                priority_groups[priority] = []
            priority_groups[priority].append(tc)

        for priority, cases in priority_groups.items():
            priority_node = {
                "name": f"{priority} 优先级 ({len(cases)}个)",
                "children": [],
            }
            for tc in cases:
                test_case_node = {
                    "name": tc.get("title", tc.get("id", "未知测试用例")),
                    "children": [],
                }
                if tc.get("description"):
                    test_case_node["children"].append({"name": f"描述: {tc['description'][:50]}..."})
                if tc.get("preconditions"):
                    test_case_node["children"].append({"name": f"前置条件: {tc['preconditions'][:50]}..."})
                
                if tc.get("steps"):
                    steps_node = {"name": f"测试步骤 ({len(tc['steps'])}步)", "children": []}
                    for step in tc["steps"][:5]:
                        step_node = {
                            "name": f"步骤{step.get('step_number', '?')}: {step.get('description', '')[:30]}...",
                            "children": [{"name": f"预期: {step.get('expected_result', '')[:40]}..."}]
                        }
                        steps_node["children"].append(step_node)
                    test_case_node["children"].append(steps_node)
                priority_node["children"].append(test_case_node)
            mindmap["children"].append(priority_node)

        stats_node = {
            "name": "统计信息",
            "children": [
                {"name": f"总测试用例: {len(test_cases)}"},
                {"name": f"平均步骤数: {self._calculate_average_steps(test_cases):.1f}"},
            ],
        }
        mindmap["children"].append(stats_node)
        return mindmap

    def _calculate_average_steps(self, test_cases: List[Dict[str, Any]]) -> float:
        total_steps = 0
        valid_cases = 0
        for tc in test_cases:
            if tc.get("steps"):
                total_steps += len(tc["steps"])
                valid_cases += 1
        return total_steps / valid_cases if valid_cases > 0 else 0


ai_service = AIService()
