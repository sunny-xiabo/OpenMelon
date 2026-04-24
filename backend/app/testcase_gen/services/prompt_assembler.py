import hashlib
import json
import os
from typing import Any, Optional

PROMPT_CONFIG_VERSION = "phase1-v1"
DEFAULT_TEMPLATE_ID = "default-detailed"
MAX_SELECTED_SKILLS = 5

BUILTIN_TEMPLATES = [
    {
        "id": "default-detailed",
        "name": "详细版",
        "description": "强调完整性、覆盖度和可执行性。",
        "content": "请以详细、完整、可执行的风格编写测试用例。优先保证覆盖全面，充分展开正常流程、异常流程、边界条件和关键状态变化。对于存在多个分支、状态或角色差异的场景，应拆分为多个独立测试用例，不要混写在同一条用例中。",
        "review_summary": "详细风格，强调完整性、覆盖度和可执行性，不改变标准输出协议。",
        "enabled": True,
        "is_default": True,
        "sort_order": 100,
    },
    {
        "id": "default-compact",
        "name": "精简版",
        "description": "强调去冗余和高信息密度。",
        "content": "请以精简、直接、高信息密度的风格编写测试用例。在保证结构完整和场景覆盖充分的前提下，避免重复表述和无意义铺垫。步骤聚焦关键操作，预期结果只保留最核心、最可验证的断言。",
        "review_summary": "精简风格，强调高信息密度和去冗余，但不改变标准输出协议。",
        "enabled": True,
        "is_default": False,
        "sort_order": 200,
    },
    {
        "id": "default-bdd-enhanced",
        "name": "BDD增强版",
        "description": "用 Given/When/Then 思维强化场景表达。",
        "content": "请使用接近 Given/When/Then 的思维方式组织测试场景，但不要输出纯 Gherkin 格式。描述、前置条件、步骤和预期结果应体现前置状态、触发动作和结果验证之间的因果关系。请保持系统要求的标准测试用例结构。",
        "review_summary": "BDD增强风格，强调场景因果关系和 Given/When/Then 思维，但保持标准测试用例协议。",
        "enabled": True,
        "is_default": False,
        "sort_order": 300,
    },
]

BUILTIN_SKILLS = [
    {
        "id": "boundary-basic",
        "name": "边界值测试",
        "description": "增强上下限、临界值、空值、极端值覆盖。",
        "content": "请额外补充边界值和临界条件测试，重点关注最小值、最大值、刚好超过上限、刚好低于下限、空值、空字符串、超长输入、特殊字符、非法格式、列表为空、集合仅一项和多项切换等场景。",
        "review_summary": "补充边界值、临界值、空值、超长和格式边界相关测试覆盖。",
        "enabled": True,
        "category": "coverage",
        "sort_order": 100,
    },
    {
        "id": "security-auth",
        "name": "认证与权限",
        "description": "增强登录态、鉴权、越权和权限边界覆盖。",
        "content": "请额外补充认证与权限相关测试，重点关注未登录访问、登录态失效、角色差异、权限不足、越权操作、资源归属不匹配和敏感操作保护等场景。若需求涉及管理员、普通用户、审核人或创建人等角色，必须覆盖角色差异测试。",
        "review_summary": "补充登录态、鉴权、越权、角色差异和资源访问限制相关测试覆盖。",
        "enabled": True,
        "category": "security",
        "sort_order": 200,
    },
    {
        "id": "exception-handling",
        "name": "异常与错误处理",
        "description": "增强失败分支、错误提示和恢复流程覆盖。",
        "content": "请额外补充异常与错误处理测试，重点关注必填项缺失、非法输入、服务异常、接口超时、重复提交失败、资源不存在、状态不合法、依赖数据缺失以及失败后的恢复路径。",
        "review_summary": "补充失败分支、错误提示、异常返回和恢复路径相关测试覆盖。",
        "enabled": True,
        "category": "robustness",
        "sort_order": 300,
    },
    {
        "id": "compatibility-basic",
        "name": "兼容性基础覆盖",
        "description": "增强不同环境、浏览器、设备或格式兼容覆盖。",
        "content": "请额外补充兼容性相关测试，重点关注不同浏览器、不同分辨率、移动端与桌面端、文件格式差异、页面渲染一致性、控件可用性、布局溢出和导入导出格式兼容性。",
        "review_summary": "补充浏览器、分辨率、设备、文件格式和界面兼容性相关测试覆盖。",
        "enabled": True,
        "category": "compatibility",
        "sort_order": 400,
    },
    {
        "id": "concurrency-idempotency",
        "name": "并发与幂等",
        "description": "增强重复提交、并发竞争和状态一致性覆盖。",
        "content": "请额外补充并发与幂等相关测试，重点关注重复点击、多次提交、并发更新、并发审批、同一资源被多人同时操作、接口重试、网络抖动导致重复请求、操作幂等性、状态竞争和最终一致性。",
        "review_summary": "补充重复提交、并发竞争、幂等性和状态一致性相关测试覆盖。",
        "enabled": True,
        "category": "consistency",
        "sort_order": 500,
    },
]

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

_TEMPLATE_BY_ID = {item["id"]: item for item in BUILTIN_TEMPLATES}
_SKILL_BY_ID = {item["id"]: item for item in BUILTIN_SKILLS}


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
    if style_id:
        template = _TEMPLATE_BY_ID.get(style_id)
        if template and template.get("enabled"):
            return template

    default_template = _TEMPLATE_BY_ID[DEFAULT_TEMPLATE_ID]
    return default_template


def resolve_skills(skill_ids: list[str]) -> list[dict[str, Any]]:
    resolved = []
    for skill_id in skill_ids:
        skill = _SKILL_BY_ID.get(skill_id)
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
