from app.testcase_gen.agents.cross_review_agent import cross_review_agent


class TestCrossReviewAgent:
    def test_parse_valid_json(self):
        parsed = cross_review_agent._parse_response(
            '{"issues": [], "coverage_score": 0.8, "issue_count": {"high": 0, "medium": 1, "low": 0}}'
        )
        assert parsed["coverage_score"] == 0.8
        assert parsed["issues"] == []
        assert parsed["issue_count"]["medium"] == 1

    def test_parse_json_with_code_fence(self):
        parsed = cross_review_agent._parse_response(
            '```json\n{"issues": [], "coverage_score": 0.7, "issue_count": {"high": 0, "medium": 0, "low": 0}}\n```'
        )
        assert parsed["coverage_score"] == 0.7

    def test_parse_json_without_code_fence(self):
        parsed = cross_review_agent._parse_response(
            '```\n{"issues": [], "coverage_score": 0.6, "issue_count": {"high": 0, "medium": 0, "low": 0}}\n```'
        )
        assert parsed["coverage_score"] == 0.6

    def test_parse_invalid_json_fallback(self):
        parsed = cross_review_agent._parse_response("this is not json at all")
        assert parsed["issues"] == []
        assert parsed["coverage_score"] == 0.5

    def test_parse_partial_with_embedded_json(self):
        parsed = cross_review_agent._parse_response(
            'some prefix text {"issues": [], "coverage_score": 0.9, "issue_count": {"high": 0, "medium": 0, "low": 0}} trailing text'
        )
        assert parsed["coverage_score"] == 0.9

    def test_normalize_issues_with_affected_cases(self):
        raw = {
            "issues": [
                {
                    "type": "coverage_gap",
                    "severity": "high",
                    "affected_cases": ["TC-001", "TC-002"],
                    "suggestion": "需要补充异常场景",
                }
            ],
            "coverage_score": 0.5,
            "issue_count": {"high": 1, "medium": 0, "low": 0},
        }
        result = cross_review_agent._normalize_feedback(raw)
        assert result["issue_count"]["high"] == 1
        assert result["issues"][0]["affected_cases"] == ["TC-001", "TC-002"]

    def test_normalize_affected_cases_string_to_list(self):
        raw = {
            "issues": [
                {
                    "type": "duplicate",
                    "severity": "medium",
                    "affected_cases": "TC-003",
                    "suggestion": "与TC-001重复",
                }
            ],
            "coverage_score": 0.5,
            "issue_count": {"high": 0, "medium": 1, "low": 0},
        }
        result = cross_review_agent._normalize_feedback(raw)
        assert result["issues"][0]["affected_cases"] == ["TC-003"]

    def test_normalize_invalid_type_falls_back(self):
        raw = {
            "issues": [
                {
                    "type": "invalid_type",
                    "severity": "high",
                    "affected_cases": [],
                    "suggestion": "test",
                }
            ],
            "coverage_score": 0.5,
            "issue_count": {"high": 1, "medium": 0, "low": 0},
        }
        result = cross_review_agent._normalize_feedback(raw)
        assert result["issues"][0]["type"] == "coverage_gap"

    def test_normalize_invalid_severity_falls_back(self):
        raw = {
            "issues": [
                {
                    "type": "boundary_missing",
                    "severity": "critical",
                    "affected_cases": [],
                    "suggestion": "test",
                }
            ],
            "coverage_score": 0.5,
            "issue_count": {"high": 0, "medium": 1, "low": 0},
        }
        result = cross_review_agent._normalize_feedback(raw)
        assert result["issues"][0]["severity"] == "medium"

    def test_normalize_coverage_score_clamped(self):
        raw = {
            "issues": [],
            "coverage_score": 2.5,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = cross_review_agent._normalize_feedback(raw)
        assert result["coverage_score"] == 1.0

    def test_normalize_coverage_score_negative(self):
        raw = {
            "issues": [],
            "coverage_score": -0.5,
            "issue_count": {"high": 0, "medium": 0, "low": 0},
        }
        result = cross_review_agent._normalize_feedback(raw)
        assert result["coverage_score"] == 0.0

    def test_empty_feedback(self):
        result = cross_review_agent._empty_feedback()
        assert result["issues"] == []
        assert result["coverage_score"] == 0.5
        assert result["issue_count"] == {"high": 0, "medium": 0, "low": 0}

    def test_issue_count_recomputed_when_missing(self):
        raw = {
            "issues": [
                {
                    "type": "coverage_gap",
                    "severity": "high",
                    "affected_cases": ["TC-001"],
                    "suggestion": "test",
                },
                {
                    "type": "boundary_missing",
                    "severity": "low",
                    "affected_cases": ["TC-002"],
                    "suggestion": "test",
                },
            ],
            "coverage_score": 0.6,
            # no issue_count key
        }
        result = cross_review_agent._normalize_feedback(raw)
        assert result["issue_count"]["high"] == 1
        assert result["issue_count"]["low"] == 1
        assert result["issue_count"]["medium"] == 0
