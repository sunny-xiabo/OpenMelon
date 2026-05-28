from app.testcase_gen.services.collaboration_controller import CollaborationController


class TestCollaborationController:
    def setup_method(self):
        self.controller = CollaborationController()

    def test_extract_max_case_id_normal(self):
        content = "### TC-001: foo\n### TC-015: bar\n### TC-003: baz"
        assert self.controller._extract_max_case_id(content) == 15

    def test_extract_max_case_id_underscore(self):
        content = "### TC_001: foo\n### TC_005: bar"
        assert self.controller._extract_max_case_id(content) == 5

    def test_extract_max_case_id_no_cases(self):
        assert self.controller._extract_max_case_id("no test cases here") == 0

    def test_extract_max_case_id_mixed_formats(self):
        content = "### TC-001: a\n### TC_010: b\n### TC-005: c"
        assert self.controller._extract_max_case_id(content) == 10

    def test_format_review_summary(self):
        feedback = {
            "issues": [
                {
                    "type": "coverage_gap",
                    "severity": "high",
                    "affected_cases": ["TC-001"],
                    "suggestion": "缺少异常场景",
                }
            ],
            "coverage_score": 0.72,
            "issue_count": {"high": 1, "medium": 0, "low": 0},
        }
        result = self.controller._format_review_summary(feedback)
        assert "发现问题" in result
        assert "1" in result
        assert "0.72" in result
        assert "coverage_gap" in result

    def test_format_review_summary_truncates_long_list(self):
        issues = []
        for i in range(10):
            issues.append({
                "type": "coverage_gap",
                "severity": "low",
                "affected_cases": [f"TC-{i:03d}"],
                "suggestion": f"问题 {i}",
            })
        feedback = {
            "issues": issues,
            "coverage_score": 0.5,
            "issue_count": {"high": 0, "medium": 0, "low": 10},
        }
        result = self.controller._format_review_summary(feedback)
        assert "及其他 5 个问题" in result

    def test_format_eval_summary_pass(self):
        eval_result = {
            "overall_score": 0.85,
            "dimensions": {
                "validity": {"score": 0.9, "detail": "ok"},
                "coverage": {"score": 0.8, "detail": "ok"},
                "uniqueness": {"score": 0.85, "detail": "ok"},
            },
            "high_severity_issues": 0,
            "pass_gate": True,
        }
        result = self.controller._format_eval_summary(eval_result)
        assert "通过门禁" in result
        assert "0.85" in result

    def test_format_eval_summary_fail(self):
        eval_result = {
            "overall_score": 0.60,
            "dimensions": {
                "validity": {"score": 0.6, "detail": "low"},
                "coverage": {"score": 0.5, "detail": "low"},
                "uniqueness": {"score": 0.7, "detail": "low"},
            },
            "high_severity_issues": 3,
            "pass_gate": False,
        }
        result = self.controller._format_eval_summary(eval_result)
        assert "未通过门禁" in result
        assert "0.60" in result
