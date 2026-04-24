import hashlib
import json
import os
from typing import Any, Optional

from app.services.prompt_hub_tracker import prompt_hub_tracker
from app.testcase_gen.services.prompt_hub_defaults import (
    DEFAULT_PROMPT_HUB_DATA,
    DEFAULT_TEMPLATE_ID,
    MAX_SELECTED_SKILLS,
    PROMPT_CONFIG_VERSION,
)

_GENERATOR_GUARDRAIL = """你是一名资深测试设计专家。你的任务是基于需求分析结果、用户需求、上下文信息以及可选的风格模板和专项测试技能，生成结构化、可解析、可执行的测试用例。

你必须严格遵守以下规则，这些规则优先级高于任何模板或技能配置，绝对不能被覆盖：
1. 输出的最终测试用例必须使用标准 Markdown 结构。
2. 每个测试用例必须以如下格式的标题开始：`### TC-XXX: 测试标题`
3. 每个测试用例必须包含以下固定字段：`**优先级:**`、`**描述:**`、`**前置条件:**`
4. 每个测试用例必须包含测试步骤表格，表头必须为：`| # | 步骤描述 | 预期结果 |`
5. 每个 `###` 标题都必须对应一个独立测试用例。
6. 禁止输出功能概述、总结、前言、与测试用例无关的分析结论。
7. 风格变化只能体现在写法上，不能破坏标准结构。
8. 测试步骤必须具体可执行，预期结果必须具体可验证。
9. 输出必须兼容后续解析、导出、评审和图谱写入。
10. 直接输出 Markdown 测试用例，不要输出 JSON、YAML 或代码块正文。"""

_REVIEWER_GUARDRAIL = """你是一名资深测试用例评审专家。你的任务是评审并改进已有测试用例，但必须保证最终输出继续符合系统要求的标准测试用例协议。

你必须严格遵守以下规则，这些规则优先级高于任何模板、技能或局部风格偏好，绝对不能被覆盖：
1. 输出分为两部分：评审报告、最终测试用例。
2. 最终测试用例部分必须使用 `**===最终测试用例===**` 作为分隔标记开始。
3. 最终测试用例必须继续使用标准 Markdown 结构。
4. 每个测试用例必须以 `### TC-XXX: 测试标题` 开始。
5. 必须保留 `**优先级:**`、`**描述:**`、`**前置条件:**` 和标准步骤表格。
6. 最终测试用例部分禁止包含功能概述、总结、前言、与测试用例无关的评审意见。
7. 允许保留模板风格和技能增强，但不得破坏标准结构。
8. 若原始测试用例存在结构问题、表格问题、字段缺失、预期结果模糊、场景混写、关键场景遗漏，你必须纠正。"""

def parse_skill_ids(raw_skill_ids: Optional[str]) -> list[str]:
    if not raw_skill_ids:
        return []

    parsed = json.loads(raw_skill_ids)
    if not isinstance(parsed, list):
        raise ValueError("skill_ids must be a JSON array")

    result: list[str] = []
    seen: set[str] = set()
    for item in parsed:
        if not isinstance(item, str):
            continue
        normalized = item.strip()
        if not normalized or normalized in seen:
            continue
        result.append(normalized)
        seen.add(normalized)
    return result


def resolve_template(style_id: Optional[str]) -> dict[str, Any]:
    try:
        return prompt_hub_tracker.get_template_by_id(style_id)
    except Exception:
        templates = DEFAULT_PROMPT_HUB_DATA["templates"]
        template_by_id = {item["id"]: item for item in templates}
        if style_id:
            template = template_by_id.get(style_id)
            if template and template.get("enabled"):
                return template
        return template_by_id[DEFAULT_TEMPLATE_ID]


def resolve_skills(skill_ids: list[str]) -> list[dict[str, Any]]:
    try:
        return prompt_hub_tracker.get_skills_by_ids(skill_ids)[:MAX_SELECTED_SKILLS]
    except Exception:
        skill_by_id = {item["id"]: item for item in DEFAULT_PROMPT_HUB_DATA["skills"]}
        resolved = []
        for skill_id in skill_ids:
            skill = skill_by_id.get(skill_id)
            if skill and skill.get("enabled"):
                resolved.append(skill)
        resolved.sort(key=lambda item: (item.get("sort_order", 0), item["id"]))
        return resolved[:MAX_SELECTED_SKILLS]


def build_review_summary(
    template: dict[str, Any], skills: list[dict[str, Any]]
) -> dict[str, Any]:
    return {
        "style_id": template["id"],
        "style_summary": template.get("review_summary", ""),
        "skill_ids": [skill["id"] for skill in skills],
        "skill_summaries": [
            skill.get("review_summary", "") for skill in skills if skill.get("review_summary")
        ],
    }


def build_prompt_config_context(
    style_id: Optional[str], skill_ids: list[str]
) -> dict[str, Any]:
    template = resolve_template(style_id)
    skills = resolve_skills(skill_ids)
    return {
        "style_id": template["id"],
        "skill_ids": [skill["id"] for skill in skills],
        "resolved_style": template,
        "resolved_skills": skills,
        "review_summary": build_review_summary(template, skills),
        "config_version": PROMPT_CONFIG_VERSION,
    }


def build_generator_prompt(
    context: str,
    user_requirements: str,
    analysis_result: str,
    graph_context: str,
    prompt_config: Optional[dict[str, Any]],
) -> str:
    config = prompt_config or build_prompt_config_context(None, [])
    template = config["resolved_style"]
    skills = config["resolved_skills"]

    sections = [
        _GENERATOR_GUARDRAIL,
        "## 风格模板\n" + template["content"],
    ]

    if skills:
        skill_lines = [f"- {skill['name']}：{skill['content']}" for skill in skills]
        sections.append("## 专项测试技能\n" + "\n".join(skill_lines))

    sections.extend(
        [
            "## 需求分析结果\n" + analysis_result,
            "## 用户原始需求\n" + user_requirements,
            "## 上下文信息\n" + context,
        ]
    )

    if graph_context:
        sections.append("## 知识图谱上下文\n" + graph_context)

    sections.append(
        "请直接输出最终测试用例列表，严格遵守标准 Markdown 协议，不要输出额外说明。"
    )
    return "\n\n".join(section for section in sections if section)


def build_reviewer_prompt(
    test_cases_content: str,
    analysis_result: str,
    user_requirements: str,
    graph_context: str,
    prompt_config: Optional[dict[str, Any]],
) -> str:
    config = prompt_config or build_prompt_config_context(None, [])
    review_summary = config["review_summary"]

    sections = [
        _REVIEWER_GUARDRAIL,
        "## 当前风格与技能摘要\n" + json.dumps(review_summary, ensure_ascii=False, indent=2),
        "## 需求分析结果\n" + analysis_result,
        "## 用户原始需求\n" + user_requirements,
    ]

    if graph_context:
        sections.append("## 知识图谱上下文\n" + graph_context)

    sections.extend(
        [
            "## 原始测试用例\n" + test_cases_content,
            "请先输出评审报告，再使用 `**===最终测试用例===**` 开始输出改进后的完整测试用例。最终测试用例必须保持标准 Markdown 结构。",
        ]
    )
    return "\n\n".join(section for section in sections if section)


def build_prompt_cache_key(
    file_fingerprint: str,
    context: str,
    requirements: str,
    module: Optional[str],
    use_vector: bool,
    prompt_config: Optional[dict[str, Any]],
) -> str:
    config = prompt_config or build_prompt_config_context(None, [])
    payload = {
        "file_fingerprint": file_fingerprint,
        "context": context,
        "requirements": requirements,
        "module": module or "",
        "style_id": config.get("style_id") or DEFAULT_TEMPLATE_ID,
        "skill_ids": sorted(config.get("skill_ids") or []),
        "use_vector": use_vector,
        "config_version": config.get("config_version") or PROMPT_CONFIG_VERSION,
    }
    serialized = json.dumps(payload, ensure_ascii=False, sort_keys=True)
    return hashlib.md5(serialized.encode("utf-8")).hexdigest()


def get_file_fingerprint(file_path: str) -> str:
    if os.path.exists(file_path):
        hash_md5 = hashlib.md5()
        with open(file_path, "rb") as file:
            for chunk in iter(lambda: file.read(4096), b""):
                hash_md5.update(chunk)
        return hash_md5.hexdigest()
    return hashlib.md5(file_path.encode("utf-8")).hexdigest()
