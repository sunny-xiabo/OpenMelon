export const FILE_CATEGORIES = [
  { label: '图像', exts: ['.png', '.jpg', '.jpeg', '.gif', '.bmp', '.webp'], icon: 'IMG' },
  { label: 'PDF', exts: ['.pdf'], icon: 'PDF' },
  { label: 'OpenAPI', exts: ['.json', '.yaml', '.yml'], icon: 'API' },
];

export const ALL_EXTS = FILE_CATEGORIES.flatMap((category) => category.exts);
export const ACCEPT_STR = ALL_EXTS.join(',');

export const FALLBACK_TEMPLATE_OPTIONS = [
  { id: 'default-detailed', name: '详细版', description: '强调完整性、覆盖度和可执行性。' },
  { id: 'default-compact', name: '精简版', description: '强调去冗余和高信息密度。' },
  { id: 'default-bdd-enhanced', name: 'BDD增强版', description: '用 Given/When/Then 思维强化场景表达。' },
];

export const FALLBACK_SKILL_OPTIONS = [
  { id: 'boundary-basic', name: '边界值测试', description: '补充边界值、临界值、空值和格式边界覆盖。' },
  { id: 'security-auth', name: '认证与权限', description: '补充登录态、鉴权、越权和角色差异覆盖。' },
  { id: 'exception-handling', name: '异常与错误处理', description: '补充失败分支、报错和恢复路径覆盖。' },
  { id: 'compatibility-basic', name: '兼容性基础覆盖', description: '补充浏览器、设备和格式兼容覆盖。' },
  { id: 'concurrency-idempotency', name: '并发与幂等', description: '补充重复提交、并发竞争和状态一致性覆盖。' },
];

export const DEFAULT_TEMPLATE_ID = FALLBACK_TEMPLATE_OPTIONS[0].id;
