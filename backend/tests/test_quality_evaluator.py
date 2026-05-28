from app.testcase_gen.services.quality_evaluator import quality_evaluator

SAMPLE_VALID_CASE = """
### TC-001: 登录功能测试
**优先级:** 高
**描述:** 测试正常登录流程
**前置条件:** 用户已注册且账号状态正常
| # | 步骤描述 | 预期结果 |
|---|---------|---------|
| 1 | 打开登录页面 | 页面正常显示 |
| 2 | 输入正确的用户名和密码 | 输入框接受输入 |
| 3 | 点击登录按钮 | 跳转到首页 |
"""

SAMPLE_PARTIAL_CASE = """
### TC-001: 简单测试

This case has no structured fields at all.
"""

SAMPLE_NO_STEPS_CASE = """
### TC-001: 无步骤测试
**优先级:** 低
**描述:** 没有测试步骤
**前置条件:** 无
"""

SAMPLE_TWO_SIMILAR = (
    SAMPLE_VALID_CASE
    + "\n\n"
    + """### TC-002: 登录功能验证
**优先级:** 高
**描述:** 验证登录流程
**前置条件:** 用户已存在
| # | 步骤描述 | 预期结果 |
|---|---------|---------|
| 1 | 输入凭证 | 登录成功 |
"""
)


class TestQualityEvaluator:
    def test_validity_full_fields(self):
        feedback = {
            "issues": [],
            "coverage_score": 0.8,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(SAMPLE_VALID_CASE, feedback)
        assert result["dimensions"]["validity"]["score"] == 1.0

    def test_validity_partial_fields(self):
        # The parser auto-fills all fields with fallbacks (priority->Medium,
        # description->title, steps->synthetic, expected->默认文本).
        # Only way to get < 1.0 is empty/unparseable content.
        feedback = {
            "issues": [],
            "coverage_score": 0.8,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(SAMPLE_PARTIAL_CASE, feedback)
        # Parser fills everything: 5/5 = 1.0
        assert result["dimensions"]["validity"]["score"] == 1.0

    def test_validity_two_cases_different_completeness(self):
        # Two cases: one with steps, one without structured table
        md = SAMPLE_VALID_CASE + "\n\n" + SAMPLE_NO_STEPS_CASE
        feedback = {
            "issues": [],
            "coverage_score": 0.8,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(md, feedback)
        # Both cases parse fine: parser auto-fills missing fields
        assert result["dimensions"]["validity"]["score"] == 1.0

    def test_coverage_passthrough(self):
        feedback = {
            "issues": [],
            "coverage_score": 0.72,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(SAMPLE_VALID_CASE, feedback)
        assert result["dimensions"]["coverage"]["score"] == 0.72

    def test_coverage_clamped(self):
        feedback = {
            "issues": [],
            "coverage_score": 1.5,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(SAMPLE_VALID_CASE, feedback)
        assert result["dimensions"]["coverage"]["score"] == 1.0

    def test_uniqueness_different_titles(self):
        feedback = {
            "issues": [],
            "coverage_score": 0.8,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(SAMPLE_VALID_CASE, feedback)
        # Single case, uniqueness = 1.0
        assert result["dimensions"]["uniqueness"]["score"] == 1.0

    def test_uniqueness_similar_titles(self):
        feedback = {
            "issues": [],
            "coverage_score": 0.8,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(SAMPLE_TWO_SIMILAR, feedback)
        # Two similar titles should result in score < 1.0
        assert result["dimensions"]["uniqueness"]["score"] < 1.0

    def test_pass_gate_high_score_low_issues(self):
        feedback = {
            "issues": [],
            "coverage_score": 0.8,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(SAMPLE_VALID_CASE, feedback,
                                            quality_threshold=0.75, max_high_issues=1)
        assert result["pass_gate"] is True

    def test_fail_gate_low_score(self):
        feedback = {
            "issues": [],
            "coverage_score": 0.3,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(SAMPLE_PARTIAL_CASE, feedback,
                                            quality_threshold=0.75, max_high_issues=1)
        assert result["pass_gate"] is False

    def test_fail_gate_many_high_issues(self):
        feedback = {
            "issues": [],
            "coverage_score": 0.9,
            "issue_count": {"high": 3, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate(SAMPLE_VALID_CASE, feedback,
                                            quality_threshold=0.75, max_high_issues=1)
        assert result["pass_gate"] is False

    def test_emtpy_content(self):
        feedback = {
            "issues": [],
            "coverage_score": 0.5,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = quality_evaluator.evaluate("", feedback)
        assert result["dimensions"]["validity"]["score"] == 0.0
        assert "未解析到有效测试用例" in result["dimensions"]["validity"]["detail"]

    def test_char_jaccard_identical(self):
        from app.testcase_gen.services.quality_evaluator import QualityEvaluator
        sim = QualityEvaluator._char_jaccard("登录功能测试", "登录功能测试")
        assert sim == 1.0

    def test_char_jaccard_different(self):
        from app.testcase_gen.services.quality_evaluator import QualityEvaluator
        sim = QualityEvaluator._char_jaccard("登录", "用户注册密码修改")
        assert sim < 0.5

    def test_char_jaccard_empty_both(self):
        from app.testcase_gen.services.quality_evaluator import QualityEvaluator
        sim = QualityEvaluator._char_jaccard("", "")
        assert sim == 1.0

    def test_char_jaccard_empty_one(self):
        from app.testcase_gen.services.quality_evaluator import QualityEvaluator
        sim = QualityEvaluator._char_jaccard("test", "")
        assert sim == 0.0
