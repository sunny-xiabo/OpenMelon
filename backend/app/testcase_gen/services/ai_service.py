"""
AI服务 - 协调三个智能体的工作流程
需求分析 → 测试用例生成 → 测试用例评审
"""

from typing import List, Dict, Any, AsyncGenerator, Optional
import time

from app.api.ai_observability_service import safe_record_ai_call
from app.testcase_gen.utils.llms import get_model_runtime_info, get_testcase_llm_summary, get_token_usage, reset_token_usage
from app.testcase_gen.utils.logger import logger
from app.testcase_gen.utils.performance_optimizer import (
    response_cache,
    Timer,
)

from app.testcase_gen.services.collaboration_controller import CollaborationController
from app.testcase_gen.services.neo4j_writer import neo4j_writer
from app.testcase_gen.services.graph_context_retriever import (
    get_graph_context_retriever,
)
from app.testcase_gen.services.prompt_assembler import build_prompt_cache_key, get_file_fingerprint

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
        use_vector: bool = False,
        prompt_config: Optional[Dict[str, Any]] = None,
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
        started_at = time.perf_counter()
        prompt_chars = len(context or "") + len(requirements or "") + len(vector_context or "")
        response_chars = 0
        failed_reason = ""
        degraded = False
        recorded = False
        file_extension = file_path.lower().split(".")[-1] if "." in file_path else ""
        uses_vision_model = file_extension in {"png", "jpg", "jpeg", "gif", "bmp", "webp"}
        runtime_model = get_model_runtime_info(use_vision=uses_vision_model)
        llm_summary = get_testcase_llm_summary()
        with Timer("三阶段流程总耗时"):
            try:
                logger.info(f"开始三阶段流程 - 文件: {file_path}")

                cache_key = None
                try:
                    file_fingerprint = get_file_fingerprint(file_path)
                    cache_key = build_prompt_cache_key(
                        file_fingerprint=file_fingerprint,
                        context=context,
                        requirements=requirements,
                        module=module,
                        use_vector=use_vector,
                        prompt_config=prompt_config,
                    )
                except Exception as e:
                    logger.warning(f"计算缓存键失败，跳过缓存: {str(e)}")

                # 检查缓存
                if cache_key:
                    cached_response = response_cache.get(cache_key)
                    if cached_response:
                        logger.info("使用缓存的响应")
                        response_chars = len(cached_response)
                        safe_record_ai_call(
                            feature="testcase_generation",
                            operation="generate_test_cases_stream",
                            provider=str(runtime_model["provider"]),
                            model=str(runtime_model["model_name"]),
                            status="success",
                            latency_ms=round((time.perf_counter() - started_at) * 1000),
                            prompt_chars=prompt_chars,
                            response_chars=response_chars,
                            debug_snapshot={
                                "user": requirements,
                                "context": context,
                                "response": cached_response,
                            },
                            data={
                                "cached": True,
                                "use_vector": use_vector,
                                "llm_source": runtime_model["source"],
                                "llm_source_label": runtime_model["source_label"],
                                "llm_summary": llm_summary,
                            },
                        )
                        recorded = True
                        yield cached_response
                        return

                # 收集各阶段结果
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

                # ==================== Phase 1-3: Delegate to CollaborationController ====================
                reset_token_usage()
                controller = CollaborationController()
                async for chunk in controller.run(
                    file_path=file_path,
                    context=context,
                    requirements=requirements,
                    module=module,
                    vector_context=vector_context,
                    use_vector=use_vector,
                    prompt_config=prompt_config,
                    graph_context=graph_context,
                    enriched_context=enriched_context,
                ):
                    yield chunk
                    full_response += chunk
                    response_chars += len(chunk)

                # 缓存完整响应
                if cache_key and full_response:
                    response_cache.set(cache_key, full_response, ttl=600)
                    logger.info("已缓存响应结果")

                # 后台写入 Neo4j
                if neo4j_writer:
                    import asyncio
                    import re

                    tc_pattern = r"###\s*(?:TC\d+[:\s]+)?(.+?)(?:\n|$)"
                    extract_from = (
                        full_response.split(FINAL_MARKER)[1]
                        if FINAL_MARKER in full_response
                        else full_response
                    )
                    tc_names = re.findall(tc_pattern, extract_from)
                    if tc_names:
                        async def _safe_write():
                            try:
                                await neo4j_writer.write_test_cases(
                                    [{"name": n.strip(), "description": ""} for n in tc_names],
                                    module=module,
                                )
                            except Exception as e:
                                logger.warning("Background Neo4j write failed: %s", e)

                        asyncio.create_task(_safe_write())

                # 确保最终标记存在
                if FINAL_MARKER not in full_response:
                    final_signal = f"\n\n{FINAL_MARKER}\n以上为生成的最终测试用例结果。"
                    yield final_signal
                    full_response += final_signal
                    response_chars += len(final_signal)

                logger.info("三阶段流程完成，已发送最终标记")
            except Exception as e:
                failed_reason = str(e)
                degraded = True
                logger.error(f"流式生成过程中发生错误: {str(e)}", exc_info=True)
                error_text = f"\n\n> [!ERROR]\n> 生成失败: {str(e)}"
                response_chars += len(error_text)
                yield error_text
            finally:
                if not recorded:
                    usage = get_token_usage()
                    safe_record_ai_call(
                        feature="testcase_generation",
                        operation="generate_test_cases_stream",
                        provider=str(runtime_model["provider"]),
                        model=str(runtime_model["model_name"]),
                        status="failed" if failed_reason else "success",
                        latency_ms=round((time.perf_counter() - started_at) * 1000),
                        prompt_chars=prompt_chars,
                        response_chars=response_chars,
                        input_tokens=usage["input_tokens"],
                        output_tokens=usage["output_tokens"],
                        total_tokens=usage["total_tokens"],
                        degraded=degraded,
                        failure_reason=failed_reason,
                        debug_snapshot={
                            "user": requirements,
                            "context": context,
                            "response": full_response if not failed_reason else failed_reason,
                        },
                        data={
                            "cached": False,
                            "use_vector": use_vector,
                            "module": module or "",
                            "llm_source": runtime_model["source"],
                            "llm_source_label": runtime_model["source_label"],
                            "llm_summary": llm_summary,
                        },
                    )
                    reset_token_usage()
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
