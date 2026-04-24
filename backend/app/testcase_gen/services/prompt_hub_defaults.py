PROMPT_CONFIG_VERSION = "phase1-v1"
DEFAULT_TEMPLATE_ID = "default-detailed"
MAX_SELECTED_SKILLS = 5
DEFAULT_SKILL_CATEGORY_ID = "coverage"

DEFAULT_SKILL_CATEGORIES = [
    {
        "id": "coverage",
        "name": "覆盖增强",
        "is_default": True,
        "sort_order": 100,
    },
    {
        "id": "security",
        "name": "安全与权限",
        "is_default": True,
        "sort_order": 200,
    },
    {
        "id": "robustness",
        "name": "异常稳定性",
        "is_default": True,
        "sort_order": 300,
    },
    {
        "id": "compatibility",
        "name": "兼容性",
        "is_default": True,
        "sort_order": 400,
    },
    {
        "id": "consistency",
        "name": "并发一致性",
        "is_default": True,
        "sort_order": 500,
    },
]

DEFAULT_PROMPT_HUB_DATA = {
    "version": 1,
    "updated_at": "2026-04-24T00:00:00Z",
    "templates": [
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
    ],
    "skill_categories": DEFAULT_SKILL_CATEGORIES,
    "skills": [
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
    ],
}
