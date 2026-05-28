"""
Quality Evaluator
Assesses test case quality using rule-based methods, no LLM calls.
"""

import re
import logging

from app.testcase_gen.utils.test_case_parser import test_case_parser

logger = logging.getLogger("testcase_gen.quality_evaluator")


class QualityEvaluator:

    def __init__(self):
        self._weights = {"validity": 0.4, "coverage": 0.4, "uniqueness": 0.2}

    def evaluate(
        self,
        test_cases_content: str,
        review_feedback: dict,
        quality_threshold: float = 0.75,
        max_high_issues: int = 1,
    ) -> dict:
        validity = self._calc_validity(test_cases_content)
        coverage = self._calc_coverage(review_feedback)
        uniqueness = self._calc_uniqueness(test_cases_content)

        overall = (
            validity["score"] * self._weights["validity"]
            + coverage["score"] * self._weights["coverage"]
            + uniqueness["score"] * self._weights["uniqueness"]
        )
        overall = round(min(overall, 1.0), 2)

        high_severity = review_feedback.get("issue_count", {}).get("high", 0)

        pass_gate = (
            overall >= quality_threshold and high_severity <= max_high_issues
        )

        return {
            "overall_score": overall,
            "dimensions": {
                "validity": validity,
                "coverage": coverage,
                "uniqueness": uniqueness,
            },
            "high_severity_issues": high_severity,
            "pass_gate": pass_gate,
        }

    def _calc_validity(self, test_cases_content: str) -> dict:
        parsed = test_case_parser.parse_from_markdown(test_cases_content)
        cases = parsed.get("test_cases", [])
        if not cases:
            return {"score": 0.0, "detail": "未解析到有效测试用例"}

        total_checks = len(cases) * 5
        passed = 0
        for tc in cases:
            if tc.get("id"):
                passed += 1
            if tc.get("priority"):
                passed += 1
            if tc.get("description"):
                passed += 1
            steps = tc.get("steps", [])
            if steps:
                passed += 1
            if steps and all(s.get("expected_result", "").strip() for s in steps):
                passed += 1

        score = round(passed / total_checks, 2) if total_checks > 0 else 0.0
        return {"score": score, "detail": f"{passed}/{total_checks} 字段完整"}

    def _calc_coverage(self, review_feedback: dict) -> dict:
        score = review_feedback.get("coverage_score", 0.0)
        try:
            score = round(float(score), 2)
        except (TypeError, ValueError):
            score = 0.0
        score = max(0.0, min(score, 1.0))
        return {"score": score, "detail": "来自交叉评审 coverage_score"}

    def _calc_uniqueness(self, test_cases_content: str) -> dict:
        parsed = test_case_parser.parse_from_markdown(test_cases_content)
        cases = parsed.get("test_cases", [])
        if len(cases) <= 1:
            return {"score": 1.0, "detail": "用例数不足以计算重复度"}

        titles = [tc.get("title", "").strip() for tc in cases]
        max_sim = 0.0
        for i in range(len(titles)):
            for j in range(i + 1, len(titles)):
                sim = self._char_jaccard(titles[i], titles[j])
                if sim > max_sim:
                    max_sim = sim

        uniqueness = round(1.0 - max_sim, 2)
        if max_sim > 0.8:
            detail = f"存在高度重复标题(相似度 {max_sim:.2f})"
        elif max_sim > 0.5:
            detail = f"存在中度重复标题(相似度 {max_sim:.2f})"
        else:
            detail = "本次生成内无高度重复"

        return {"score": uniqueness, "detail": detail}

    @staticmethod
    def _char_jaccard(a: str, b: str) -> float:
        if not a and not b:
            return 1.0
        if not a or not b:
            return 0.0
        # Tokenize Chinese by character, English by whitespace
        tokens_a = set(a)
        tokens_b = set(b)
        # Also include bigram overlap for better accuracy
        bigrams_a = {a[i:i+2] for i in range(len(a)-1)} if len(a) >= 2 else set()
        bigrams_b = {b[i:i+2] for i in range(len(b)-1)} if len(b) >= 2 else set()
        all_a = tokens_a | bigrams_a
        all_b = tokens_b | bigrams_b
        if not all_a and not all_b:
            return 1.0
        intersection = all_a & all_b
        union = all_a | all_b
        return len(intersection) / len(union) if union else 0.0


quality_evaluator = QualityEvaluator()
