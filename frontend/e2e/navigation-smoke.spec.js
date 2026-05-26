import { expect, test } from '@playwright/test';

const LOADING_TEXT = '正在加载页面...';
const MODULE_LOADING_TEXT = '正在加载模块...';

const NO_LOADING_TOP_LEVEL_TARGETS = [
  { tab: '导入管理', expectedText: '资产清单' },
  { tab: '图谱总览', expectedText: '暂无图谱数据' },
  { tab: '问答', expectedText: '智能问答' },
  { tab: '测试用例生成', expectedText: '测试用例生成' },
  { tab: 'API 自动化', expectedText: 'API 自动化工作台' },
  { tab: '数据仪表盘', expectedText: '数据仪表盘' },
  { tab: '索引治理', expectedText: '统一协同业务源' },
  { tab: '设置', expectedText: '设置中心' },
];

test.setTimeout(90_000);

const emptyList = { items: [], total: 0, limit: 50, offset: 0 };
const smokeProject = {
  project_id: 'project-smoke',
  name: 'Smoke API',
  default_environment_id: 'env-smoke',
  enabled: true,
  spec_id: 'spec-smoke',
};
const smokeModules = [
  {
    module_id: 'module-user',
    project_id: 'project-smoke',
    module_key: 'user',
    name: 'User',
    description: '用户接口',
    status: 'active',
    sort_order: 100,
    source: 'auto',
    interface_count: 1,
  },
  {
    module_id: 'module-manual',
    project_id: 'project-smoke',
    module_key: 'manual',
    name: '手工模块',
    description: '补录接口',
    status: 'active',
    sort_order: 110,
    source: 'manual',
    interface_count: 1,
  },
];
const smokeInterfaces = [
  {
    interface_id: 'interface-openapi',
    project_id: 'project-smoke',
    module_id: 'module-user',
    module_key: 'user',
    module_name: 'User',
    interface_key: 'GET /users',
    method: 'GET',
    path: '/users',
    operation_id: 'listUsers',
    summary: 'List users',
    description: '',
    tags: ['User'],
    risk_level: 'low',
    status: 'active',
    source: 'openapi',
    change_state: 'unchanged',
  },
  {
    interface_id: 'interface-manual',
    project_id: 'project-smoke',
    module_id: 'module-manual',
    module_key: 'manual',
    module_name: '手工模块',
    interface_key: 'POST /manual/orders',
    method: 'POST',
    path: '/manual/orders',
    operation_id: 'createManualOrder',
    summary: '手工创建订单',
    description: '',
    tags: [],
    risk_level: 'medium',
    status: 'active',
    source: 'manual',
    change_state: 'added',
  },
];
const smokeAgentContext = {
  project_id: 'project-smoke',
  project_name: 'Smoke API',
  readiness: {
    project_ready: true,
    environment_ready: true,
    base_url_ready: true,
    assets_ready: true,
    has_changed_interfaces: false,
    has_failed_recent_run: false,
  },
  asset_summary: {
    module_count: 2,
    interface_count: 2,
    active_interface_count: 2,
    changed_interface_count: 0,
    excluded_interface_count: 0,
    status_counts: { active: 2 },
  },
  risk_summary: { low: 1, medium: 1, high: 0, blocked: 0 },
  skipped_reason_groups: [],
  recent_run: null,
  pending_task_count: 0,
  recommendation: {
    action: 'generate_test_plan',
    label: '测试模块：User',
    description: '该模块有 1 个有效接口，适合作为默认冒烟范围。',
    section: 'agent',
    scope_strategy: 'module',
    module_id: 'module-user',
    interface_ids: [],
    intent: 'smoke',
  },
  quick_actions: [
    { action: 'open_config', label: '准备配置', section: 'config' },
    { action: 'generate_test_plan', label: '测试模块：User', section: 'agent', scope_strategy: 'module', module_id: 'module-user', interface_ids: [], intent: 'smoke' },
    { action: 'open_assets', label: '查看接口资产', section: 'assets' },
  ],
  summary: '该模块有 1 个有效接口，适合作为默认冒烟范围。',
};
const smokeAgentPlan = {
  project_id: 'project-smoke',
  module_id: 'module-user',
  test_intent: 'smoke',
  script: {
    case_id: 'ASSET_smoke_001',
    name: 'Smoke API 模块接口冒烟测试',
    target_project: 'Smoke API',
    environment: '本地测试',
    base_url: 'http://127.0.0.1:8000',
    agent_source: 'api_asset_catalog',
    agent_test_intent: 'smoke',
    agent_high_risk_approved: false,
    agent_setup_applied: false,
    agent_cleanup_applied: false,
    auth_applied: false,
    variables: {},
    steps: [{
      id: 's1',
      name: 'List users',
      method: 'GET',
      path: '/users',
      operation_id: 'listUsers',
      module_id: 'module-user',
      interface_id: 'interface-openapi',
      interface_key: 'GET /users',
      headers: {},
      query: {},
      path_params: {},
      assertions: [{ type: 'status_code', expected: 200 }],
      extractions: [],
      depends_on: [],
      parallel_group: '',
    }],
    cleanup_steps: [],
    setup_variables: [],
  },
  included_interfaces: [smokeInterfaces[0]],
  skipped_interfaces: [],
  risk_summary: { low: 1, medium: 0, high: 0, blocked: 0, included: 1, skipped: 0 },
  recommendations: [],
  dependency_graph: [],
  orchestration_summary: '未发现明确前后置依赖，已按接口风险和方法顺序生成可独立执行的测试步骤。',
  requires_high_risk_confirmation: false,
  summary: '计划纳入 1 个接口，跳过 0 个接口。',
  agent_summary: 'Agent 已选择 1 个接口，跳过 0 个接口。',
  next_action: { action: 'go_orchestrate', label: '去编排执行', description: '测试计划已生成，下一步检查 DSL 并执行。', section: 'orchestrate' },
  skipped_reason_groups: [],
};

const mockApiPayload = (url) => {
  const path = url.pathname;

  if (path === '/api/manage/files') return { files: [] };
  if (path === '/api/graph/filters') return { doc_types: [], modules: [] };
  if (path === '/api/graph/status') return { has_data: false, node_count: 0, relationship_count: 0 };
  if (path === '/api/graph/node-types') return { node_types: [] };
  if (path === '/api/graph/full') return { nodes: [], relationships: [] };
  if (path === '/api/graph/coverage') return { modules: [] };

  if (path === '/api/sessions') return { sessions: [] };
  if (path.startsWith('/api/history/')) return { history: [], messages: [] };

  if (path === '/api/index-governance/summary') return { status: 'healthy', total_assets: 0, issue_count: 0, running_tasks: 0 };
  if (path === '/api/index-governance/assets') return { items: [] };
  if (path === '/api/index-governance/diagnostics') return { items: [] };
  if (path === '/api/index-governance/tasks') return { items: [] };

  if (path === '/api/api-execution/projects') return { projects: [smokeProject] };
  if (path === '/api/api-execution/projects/project-smoke') return smokeProject;
  if (path === '/api/api-execution/projects/project-smoke/agent/context') return smokeAgentContext;
  if (path === '/api/api-execution/projects/project-smoke/agent/test-plan') return smokeAgentPlan;
  if (path === '/api/api-execution/runs') return { ...emptyList, runs: [] };
  if (path === '/api/api-execution/flow-templates') return { ...emptyList, templates: [] };
  if (path === '/api/api-execution/automation/tasks') return { ...emptyList, tasks: [] };
  if (path === '/api/api-execution/automation/task-center/summary') return { total: 0, pending: 0, running: 0, failed: 0 };
  if (path === '/api/api-execution/dashboard/summary') return { projects: [], recent_runs: [], totals: {} };
  if (path.endsWith('/environments')) {
    return {
      environments: [{
        environment_id: 'env-smoke',
        project_id: 'project-smoke',
        name: '本地测试',
        environment_type: 'test',
        base_url: 'http://127.0.0.1:8000',
        headers: {},
        variables: {},
      }],
    };
  }
  if (path.endsWith('/assets')) return { project: smokeProject, modules: smokeModules, interfaces: smokeInterfaces, specs: [] };
  if (path.endsWith('/assets/preview')) return { modules: [], interfaces: [], changes: [] };
  if (path.endsWith('/modules')) return { modules: smokeModules };
  if (path.endsWith('/interfaces')) return { interfaces: smokeInterfaces, items: smokeInterfaces, total: smokeInterfaces.length };

  if (path === '/api/config-center/schema') return { groups: [], status: { env_exists: false } };
  if (path === '/api/config-center/values') return { values: {}, effective: {} };
  if (path === '/api/config-center/providers') return { providers: [] };
  if (path === '/api/config-center/preview') return { values: {}, effective: {}, restart_required: false };

  if (path === '/api/logs/events') return { ...emptyList, events: [] };
  if (path === '/api/logs/summary') return { total: 0, error_count: 0, warning_count: 0, module_counts: [], event_type_counts: [] };
  if (path === '/api/logs/ai-calls') return { ...emptyList, calls: [] };
  if (path === '/api/logs/ai-calls/summary') return { total: 0, success: 0, failed: 0, degraded: 0, avg_latency_ms: 0, total_tokens: 0 };
  if (path === '/api/logs/ai-debug/settings') return { enabled: false, sample_rate: 0 };
  if (path === '/api/logs/list') return { files: [] };
  if (path === '/api/logs') return { lines: [] };
  if (path === '/api/system/health') {
    return {
      status: 'degraded',
      version: 'test',
      checked_at: '2026-05-19T00:00:00Z',
      runtime: {},
      components: {
        api: { status: 'ok', message: 'API 服务可用' },
        postgres: { status: 'ok', message: 'PostgreSQL 可用' },
        llm: { status: 'missing_config', message: '未配置 API_KEY' },
        neo4j: { status: 'degraded', message: 'Neo4j 客户端未初始化' },
        qdrant: { status: 'disabled', message: '外部向量库未启用' },
        reranker: { status: 'disabled', message: 'Reranker 未启用' },
      },
    };
  }

  if (path === '/api/prompt-hub/options') return { templates: [], skills: [], skill_categories: [] };
  if (path === '/api/prompt-hub/templates') return { templates: [] };
  if (path === '/api/prompt-hub/skills') return { skills: [] };
  if (path === '/api/prompt-hub/skill-categories') return { skill_categories: [] };

  return {};
};

async function expectReady(page, expectedText) {
  await expect(page.getByText(expectedText).first()).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText(LOADING_TEXT)).toHaveCount(0);
  await expect(page.getByText(MODULE_LOADING_TEXT)).toHaveCount(0);
  await expect.poll(async () => (await page.locator('body').innerText()).trim().length).toBeGreaterThan(80);
}

async function installLoadingObserver(page) {
  await page.evaluate(({ loadingText, moduleLoadingText }) => {
    window.__openmelonLoadingHits = [];
    const scan = () => {
      const text = document.body?.innerText || '';
      if (text.includes(loadingText) || text.includes(moduleLoadingText)) {
        window.__openmelonLoadingHits.push(text);
      }
    };
    window.__openmelonLoadingObserver?.disconnect?.();
    window.__openmelonLoadingObserver = new MutationObserver(scan);
    window.__openmelonLoadingObserver.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
    });
  }, { loadingText: LOADING_TEXT, moduleLoadingText: MODULE_LOADING_TEXT });
}

async function resetLoadingHits(page) {
  await page.evaluate(() => {
    window.__openmelonLoadingHits = [];
  });
}

async function expectNoLoadingHits(page) {
  await expect.poll(
    () => page.evaluate(() => window.__openmelonLoadingHits || []),
    { timeout: 1_000 },
  ).toEqual([]);
}

test('top-level navigation smoke stays ready without loading flashes', async ({ page }) => {
  const runtimeErrors = [];

  page.on('pageerror', (error) => {
    runtimeErrors.push(error.message);
  });
  page.on('console', (message) => {
    if (message.type() === 'error') runtimeErrors.push(message.text());
  });

  await page.route((url) => url.pathname.startsWith('/api/'), async (route) => {
    const url = new URL(route.request().url());
    await route.fulfill({
      status: 200,
      contentType: 'application/json',
      body: JSON.stringify(mockApiPayload(url)),
    });
  });

  await page.goto('/');

  await expectReady(page, '资产清单');
  await installLoadingObserver(page);

  for (const target of NO_LOADING_TOP_LEVEL_TARGETS) {
    await resetLoadingHits(page);
    const tab = page.getByRole('tab', { name: target.tab });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectReady(page, target.expectedText);
    await expectNoLoadingHits(page);
  }

  await page.getByRole('tab', { name: '设置' }).click();
  await expectReady(page, '设置中心');
  for (const target of [
    { button: /Prompt Hub/, expectedText: 'Prompt & Skill Hub' },
    { button: /项目与环境/, expectedText: '项目与环境配置' },
    { button: /运行配置/, expectedText: '运行配置' },
    { button: /健康检查/, expectedText: '运行态健康检查' },
  ]) {
    await page.getByRole('button', { name: target.button }).click();
    await expectReady(page, target.expectedText);
  }

  await page.getByRole('tab', { name: 'API 自动化' }).click();
  await expectReady(page, 'API 自动化工作台');
  await expectReady(page, 'Agent 下一步推荐');
  await expect(page.getByRole('button', { name: '简洁模式' })).toBeVisible();
  await expect(page.getByRole('tab', { name: '选择范围' })).toHaveAttribute('aria-selected', 'true');
  await page.getByRole('button', { name: '按推荐生成计划' }).click();
  await expect(page.getByRole('tab', { name: '执行' })).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByRole('heading', { name: '编排与执行' })).toBeVisible({ timeout: 30_000 });
  await expectReady(page, '编排与执行');

  for (const target of [
    { tab: '准备', expectedText: '项目配置' },
    { tab: '选择范围', expectedText: 'Agent 测试范围' },
    { tab: '执行', expectedText: '编排与执行' },
    { tab: '结果', expectedText: '执行结果与诊断' },
  ]) {
    const tab = page.getByRole('tab', { name: target.tab });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectReady(page, target.expectedText);
  }

  await page.getByRole('button', { name: '高级模式' }).click();
  await expect(page.getByRole('tab', { name: '接口资产' })).toBeVisible();
  for (const target of [
    { tab: '接口资产', expectedText: '接口资产台账' },
    { tab: 'Agent 测试', expectedText: '高级：按 OpenAPI 规范挑选接口' },
    { tab: '编排执行', expectedText: '编排与执行' },
    { tab: '结果报告', expectedText: '执行结果与诊断' },
    { tab: '执行历史', expectedText: '执行历史' },
  ]) {
    const tab = page.getByRole('tab', { name: target.tab });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectReady(page, target.expectedText);
  }

  await page.getByRole('tab', { name: '接口资产' }).click();
  await expectReady(page, '接口资产台账');
  await page.getByLabel('User 模块操作').click();
  await expect(page.getByRole('menuitem', { name: /编辑模块/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /移除模块/ })).toBeVisible();
  await expect(page.getByRole('menuitem', { name: /合并到/ })).toBeVisible();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: '查看', exact: true }).first().click();
  await expect(page.getByRole('button', { name: '移除接口' })).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.getByRole('button', { name: '查看', exact: true }).nth(1).click();
  await expect(page.getByRole('button', { name: '永久删除' })).toBeVisible();
  await page.getByRole('button', { name: '关闭' }).click();
  await expect(page.getByRole('dialog')).toHaveCount(0);
  await page.locator('[role="combobox"]:visible').nth(2).click();
  await expect(page.getByRole('option', { name: '已排除' })).toBeVisible();
  await page.keyboard.press('Escape');

  expect(runtimeErrors).toEqual([]);
});
