import json
from pathlib import Path
import sys

import pytest

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.prompt_hub_tracker import PromptHubTracker
from app.testcase_gen.services.prompt_hub_defaults import DEFAULT_PROMPT_HUB_DATA


@pytest.fixture
def tracker(tmp_path: Path) -> PromptHubTracker:
    data_file = tmp_path / "prompt_hub.json"
    data_file.write_text(
        json.dumps(DEFAULT_PROMPT_HUB_DATA, ensure_ascii=False, indent=2),
        encoding="utf-8",
    )
    return PromptHubTracker(data_file=data_file)


def test_create_update_delete_template(tracker: PromptHubTracker):
    created = tracker.create_template(
        {
            "id": "custom-detailed",
            "name": "自定义详细版",
            "description": "强调结构完整和解释性。",
            "content": "请以详细、完整的方式输出测试用例。",
            "review_summary": "详细风格，强调完整性。",
            "enabled": True,
            "is_default": False,
            "sort_order": 250,
        }
    )

    assert created["record"]["id"] == "custom-detailed"

    updated = tracker.update_template(
        "custom-detailed",
        {
            "id": "custom-detailed",
            "name": "自定义详细版",
            "description": "强调结构完整和可读性。",
            "content": "请以详细、完整、可执行的方式输出测试用例。",
            "review_summary": "详细风格，强调完整性和可执行性。",
            "enabled": True,
            "is_default": False,
            "sort_order": 260,
        },
    )

    assert updated["record"]["description"] == "强调结构完整和可读性。"

    deleted = tracker.delete_template("custom-detailed")

    assert deleted["record"]["id"] == "custom-detailed"
    assert all(item["id"] != "custom-detailed" for item in tracker.list_templates())


def test_get_template_by_id_falls_back_to_default_when_template_missing(tracker: PromptHubTracker):
    fallback = tracker.get_template_by_id("missing-template")

    assert fallback["id"] == "default-detailed"
    assert fallback["is_default"] is True


def test_delete_default_template_is_rejected(tracker: PromptHubTracker):
    with pytest.raises(ValueError, match="默认模板"):
        tracker.delete_template("default-detailed")


def test_update_default_template_to_disabled_is_rejected(tracker: PromptHubTracker):
    with pytest.raises(ValueError, match="不能停用当前默认模板"):
        tracker.update_template(
            "default-detailed",
            {
                "id": "default-detailed",
                "name": "详细版",
                "description": "强调完整性、覆盖度和可执行性。",
                "content": "请以详细、完整、可执行的风格编写测试用例。",
                "review_summary": "详细风格，强调完整性、覆盖度和可执行性。",
                "enabled": False,
                "is_default": True,
                "sort_order": 100,
            },
        )


def test_duplicate_skill_name_is_rejected(tracker: PromptHubTracker):
    with pytest.raises(ValueError, match="duplicate skill name"):
        tracker.create_skill(
            {
                "id": "boundary-basic-v2",
                "name": "边界值测试",
                "description": "重复名称。",
                "content": "请额外补充边界值场景。",
                "review_summary": "边界值覆盖。",
                "enabled": True,
                "category": "coverage",
                "sort_order": 150,
            }
        )


def test_placeholder_content_is_rejected(tracker: PromptHubTracker):
    with pytest.raises(ValueError, match="非法占位符"):
        tracker.create_skill(
            {
                "id": "bad-skill",
                "name": "坏技能",
                "description": "包含非法占位符。",
                "content": "请补充 {{非法占位符}} 场景。",
                "review_summary": "非法占位符摘要。",
                "enabled": True,
                "category": "coverage",
                "sort_order": 150,
            }
        )


def test_get_skills_by_ids_filters_disabled_skills(tracker: PromptHubTracker):
    tracker.update_skill(
        "boundary-basic",
        {
            "id": "boundary-basic",
            "name": "边界值测试",
            "description": "增强上下限、临界值、空值、极端值覆盖。",
            "content": "请额外补充边界值和临界条件测试。",
            "review_summary": "补充边界值和临界值相关覆盖。",
            "enabled": False,
            "category": "coverage",
            "sort_order": 100,
        },
    )

    resolved = tracker.get_skills_by_ids(["boundary-basic", "security-auth"])

    assert [item["id"] for item in resolved] == ["security-auth"]


def test_create_and_delete_custom_skill_category(tracker: PromptHubTracker):
    created = tracker.create_skill_category(
        {
            "id": "performance",
            "name": "性能效率",
            "is_default": False,
            "sort_order": 600,
        }
    )

    assert created["record"]["name"] == "性能效率"

    deleted = tracker.delete_skill_category("performance")

    assert deleted["record"]["id"] == "performance"


def test_delete_default_skill_category_is_rejected(tracker: PromptHubTracker):
    with pytest.raises(ValueError, match="默认技能分类"):
        tracker.delete_skill_category("coverage")


def test_delete_used_skill_category_is_rejected(tracker: PromptHubTracker):
    tracker.create_skill_category(
        {
            "id": "performance",
            "name": "性能效率",
            "is_default": False,
            "sort_order": 600,
        }
    )
    tracker.create_skill(
        {
            "id": "perf-basic",
            "name": "性能基础覆盖",
            "description": "性能分类测试。",
            "content": "请补充性能与响应时间场景。",
            "review_summary": "补充性能基础覆盖。",
            "enabled": True,
            "category": "performance",
            "sort_order": 600,
        }
    )

    with pytest.raises(ValueError, match="已有技能使用该分类"):
        tracker.delete_skill_category("performance")
