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

const emptyList = { items: [], total: 0, limit: 50, offset: 0 };

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

  if (path === '/api/api-execution/projects') return { projects: [] };
  if (path === '/api/api-execution/runs') return { ...emptyList, runs: [] };
  if (path === '/api/api-execution/flow-templates') return { ...emptyList, templates: [] };
  if (path === '/api/api-execution/automation/tasks') return { ...emptyList, tasks: [] };
  if (path === '/api/api-execution/automation/task-center/summary') return { total: 0, pending: 0, running: 0, failed: 0 };
  if (path === '/api/api-execution/dashboard/summary') return { projects: [], recent_runs: [], totals: {} };
  if (path.endsWith('/environments')) return { environments: [] };
  if (path.endsWith('/assets')) return { modules: [], interfaces: [], specs: [] };
  if (path.endsWith('/assets/preview')) return { modules: [], interfaces: [], changes: [] };
  if (path.endsWith('/modules')) return { modules: [] };
  if (path.endsWith('/interfaces')) return { interfaces: [], items: [] };

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
        sqlite: { status: 'ok', message: 'SQLite 可用' },
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
  for (const target of [
    { tab: '接口资产', expectedText: '请先在项目配置中选择或创建项目' },
    { tab: 'Agent 测试', expectedText: '高级：按 OpenAPI 规范挑选接口' },
    { tab: '编排执行', expectedText: '流程编排工作台' },
    { tab: '结果报告', expectedText: '执行结果与诊断' },
    { tab: '执行历史', expectedText: '执行历史' },
  ]) {
    const tab = page.getByRole('tab', { name: target.tab });
    await tab.click();
    await expect(tab).toHaveAttribute('aria-selected', 'true');
    await expectReady(page, target.expectedText);
  }

  expect(runtimeErrors).toEqual([]);
});
