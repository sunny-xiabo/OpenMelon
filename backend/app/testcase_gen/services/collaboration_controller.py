"""
Collaboration Controller
Orchestrates the enhanced test case generation pipeline:
Phase 1 (analysis) -> Phase 2 (generation) -> Cross Review -> Quality Eval -> Revision (<=2 rounds) -> Phase 3 (review)
"""

import logging
import re
from typing import AsyncGenerator, Optional

from app.config import settings
from app.testcase_gen.agents.requirement_analyzer import requirement_analyzer
from app.testcase_gen.agents.test_case_generator import test_case_generator
from app.testcase_gen.agents.test_case_reviewer import test_case_reviewer
from app.testcase_gen.agents.cross_review_agent import cross_review_agent
from app.testcase_gen.agents.revision_agent import revision_agent
from app.testcase_gen.services.quality_evaluator import quality_evaluator

logger = logging.getLogger("testcase_gen.collaboration")


class CollaborationController:

    def __init__(self):
        self.name = "CollaborationController"

    async def run(
        self,
        file_path: str,
        context: str,
        requirements: str,
        module: Optional[str] = None,
        vector_context: str = "",
        use_vector: bool = False,
        prompt_config: Optional[dict] = None,
        graph_context: str = "",
        enriched_context: str = "",
    ) -> AsyncGenerator[str, None]:

        max_rounds = getattr(settings, "REVIEW_MAX_REVISION_ROUNDS", 2)
        quality_threshold = getattr(settings, "REVIEW_QUALITY_THRESHOLD", 0.75)
        max_high_issues = getattr(settings, "REVIEW_MAX_HIGH_ISSUES", 1)

        # ==================== Phase 1: Requirement Analysis ====================
        logger.info("阶段1: 需求分析")
        analysis_result = ""
        async for chunk in requirement_analyzer.analyze_requirements_stream(
            file_path, enriched_context, requirements, graph_context=graph_context
        ):
            yield chunk
            analysis_result += chunk

        if prompt_config:
            logger.info(
                "阶段一配置 - style_id=%s, skill_ids=%s, use_vector=%s",
                prompt_config.get("style_id"),
                ",".join(prompt_config.get("skill_ids", [])) or "<none>",
                use_vector,
            )

        # ==================== Phase 2: Test Case Generation ====================
        logger.info("阶段2: 测试用例生成")
        test_cases_result = ""
        async for chunk in test_case_generator.generate_test_cases_stream(
            file_path,
            enriched_context,
            requirements,
            analysis_result,
            graph_context=graph_context,
            prompt_config=prompt_config,
        ):
            yield chunk
            test_cases_result += chunk

        # ==================== Phase 2.5: Cross Review ====================
        logger.info("阶段2.5: 交叉评审")
        yield "\n\n# 交叉评审阶段\n\n"

        feedback = None
        try:
            feedback = await cross_review_agent.review_for_issues(
                test_cases_content=test_cases_result,
                analysis_result=analysis_result,
                user_requirements=requirements,
                graph_context=graph_context,
            )
            yield self._format_review_summary(feedback)
        except Exception as e:
            logger.warning("交叉评审失败，跳过修订轮次: %s", e)
            yield "\n> 交叉评审服务异常，已跳过修订轮次\n\n"
            feedback = None

        # ==================== Phase 2.6-2.N: Quality Eval + Revision Loop ====================
        if feedback:
            max_case_id = self._extract_max_case_id(test_cases_result)

            for round_num in range(1, max_rounds + 1):
                eval_result = quality_evaluator.evaluate(
                    test_cases_content=test_cases_result,
                    review_feedback=feedback,
                    quality_threshold=quality_threshold,
                    max_high_issues=max_high_issues,
                )
                yield self._format_eval_summary(eval_result)

                if eval_result["pass_gate"]:
                    yield "质量门禁通过，跳过修订\n\n"
                    break

                yield f"**开始第 {round_num} 轮修订...**\n\n"

                revised = ""
                try:
                    async for chunk in revision_agent.revise_test_cases(
                        initial_cases=test_cases_result,
                        review_feedback=feedback,
                        analysis_result=analysis_result,
                        user_requirements=requirements,
                        max_case_id=max_case_id,
                        graph_context=graph_context,
                    ):
                        yield chunk
                        revised += chunk
                except Exception as e:
                    logger.warning("修订阶段失败: %s", e)
                    yield f"\n> 修订服务异常: {e}\n\n"
                    break

                if revised.strip():
                    test_cases_result = revised
                    # Update max_case_id for next round
                    new_max = self._extract_max_case_id(test_cases_result)
                    if new_max > max_case_id:
                        max_case_id = new_max

                if round_num >= max_rounds:
                    yield f"已达到最大修订轮次 ({max_rounds})，修订完成\n\n"
                    break

                # Re-fetch cross review for next round
                try:
                    feedback = await cross_review_agent.review_for_issues(
                        test_cases_content=test_cases_result,
                        analysis_result=analysis_result,
                        user_requirements=requirements,
                        graph_context=graph_context,
                    )
                    yield self._format_review_summary(feedback)
                except Exception as e:
                    logger.warning("第%d轮交叉评审失败: %s", round_num + 1, e)
                    break

        # ==================== Phase 3: Test Case Review ====================
        logger.info("阶段3: 测试用例评审")
        yield "\n\n"
        yield "---\n\n"
        async for chunk in test_case_reviewer.review_test_cases_stream(
            test_cases_result,
            analysis_result,
            requirements,
            graph_context=graph_context,
            prompt_config=prompt_config,
        ):
            yield chunk

    # ------------------------------------------------------------------
    # Helpers
    # ------------------------------------------------------------------

    @staticmethod
    def _format_review_summary(feedback: dict) -> str:
        issues = feedback.get("issues", [])
        counts = feedback.get("issue_count", {})
        coverage = feedback.get("coverage_score", 0.0)
        total = len(issues)
        high = counts.get("high", 0)
        medium = counts.get("medium", 0)
        low = counts.get("low", 0)
        lines = [
            f"**发现问题**: {total} 个（高: {high}, 中: {medium}, 低: {low}）",
            f"**覆盖分**: {coverage:.2f}",
        ]
        if issues:
            lines.append("")
            for issue in issues[:5]:
                lines.append(
                    f"- [{issue.get('severity', '?')}] {issue.get('type', '?')}: "
                    f"{issue.get('suggestion', '')}"
                )
            if len(issues) > 5:
                lines.append(f"- ... 及其他 {len(issues) - 5} 个问题")
        return "\n".join(lines) + "\n\n"

    @staticmethod
    def _format_eval_summary(eval_result: dict) -> str:
        overall = eval_result.get("overall_score", 0.0)
        dims = eval_result.get("dimensions", {})
        high_issues = eval_result.get("high_severity_issues", 0)
        pass_gate = eval_result.get("pass_gate", False)
        gate_status = "通过门禁" if pass_gate else "未通过门禁"

        validity = dims.get("validity", {}).get("score", 0.0)
        coverage = dims.get("coverage", {}).get("score", 0.0)
        uniqueness = dims.get("uniqueness", {}).get("score", 0.0)

        return "\n".join([
            "\n# 质量评估\n",
            f"**综合分**: {overall:.2f}（{gate_status}）",
            f"**有效性**: {validity:.2f} | **覆盖度**: {coverage:.2f} | **独特性**: {uniqueness:.2f}",
            f"**高严重度问题数**: {high_issues}",
            "",
        ])

    @staticmethod
    def _extract_max_case_id(test_cases_content: str) -> int:
        pattern = r"###\s*TC[-_]?(\d+)"
        matches = re.findall(pattern, test_cases_content, re.IGNORECASE)
        if not matches:
            return 0
        return max(int(m) for m in matches)
