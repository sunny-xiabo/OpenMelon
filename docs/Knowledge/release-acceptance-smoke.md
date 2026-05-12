# OpenMelon 发版验收 Smoke 脚本

## 目标

每次发版前用同一套步骤确认 API 自动化主链路、执行概览、任务中心聚合和知识沉淀能力仍然可用。

本脚本不包含 Playwright/UI 自动化；UI 自动化 smoke 后置到 UI 验收阶段。

## 前置条件

- 后端服务已启动，默认地址：`http://localhost:8000`
- 前端依赖已安装，工作目录：`frontend`
- Demo 资产存在：`docs/samples/api-flow-demo-openapi.json`

可按需覆盖地址：

```bash
export OPENMELON_API_BASE=http://localhost:8000/api
```

## 1. 后端接口 Smoke

初始化 Demo 项目：

```bash
curl -sS -X POST "${OPENMELON_API_BASE:-http://localhost:8000/api}/api-execution/demo/bootstrap"
```

检查 Demo OpenAPI 资产可读取：

```bash
curl -sS "${OPENMELON_API_BASE:-http://localhost:8000/api}/api-execution/demo/openapi"
```

检查 API 执行概览：

```bash
curl -sS "${OPENMELON_API_BASE:-http://localhost:8000/api}/api-execution/dashboard/summary?project_id=demo-api-flow&limit=50"
```

检查任务中心聚合：

```bash
curl -sS "${OPENMELON_API_BASE:-http://localhost:8000/api}/api-execution/automation/task-center/summary?project_id=demo-api-flow&limit=50"
```

检查待处理任务列表：

```bash
curl -sS "${OPENMELON_API_BASE:-http://localhost:8000/api}/api-execution/automation/tasks?project_id=demo-api-flow&status=pending&limit=20"
```

通过标准：

- `demo/bootstrap` 返回 `project.project_id=demo-api-flow`
- `dashboard/summary` 返回非空 `recent_runs`
- `task-center/summary` 返回 `status_counts`、`type_counts`、`action_buckets`
- 待处理任务列表至少能看到知识候选或失败诊断类任务

## 2. 自动化测试

后端回归：

```bash
uv run pytest \
  backend/tests/test_api_execution_demo_assets.py \
  backend/tests/test_api_execution_dashboard.py \
  backend/tests/test_api_execution_project_environment.py \
  backend/tests/test_api_execution_knowledge.py \
  backend/tests/test_api_execution_ai_assistant.py \
  backend/tests/test_api_execution_flow_draft.py \
  backend/tests/test_api_execution_runner.py
```

前端静态检查与构建：

```bash
cd frontend
npm run lint
npm run build
```

通过标准：

- pytest 全部通过
- `npm run lint` 通过
- `npm run build` 通过

## 3. 人工页面验收

API 自动化页：

1. 点击“初始化 Demo 项目”。
2. 确认项目切换到 `OpenMelon Demo API Flow`，环境切换到 `Demo 本地环境`。
3. 输入业务目标：`登录后创建订单并查询订单详情`。
4. 生成 AI 草稿，确认预览中包含登录、创建订单、查询订单。
5. 应用草稿到工作台，确认列表和流程图能展示编排关系。
6. 打开模板弹窗，确认模板可搜索、复制、另存和覆盖保存。
7. 载入 Demo 失败记录，确认失败诊断和修复建议分级可见。

数据仪表盘页：

1. 打开 API 执行概览。
2. 选择 Demo 项目。
3. 确认总执行、通过率、失败数、待处理数、平均耗时有真实值。
4. 点击失败记录，确认右侧抽屉能展示失败步骤、断言详情和诊断入口。
5. 如存在修复建议，确认可跳转 API 自动化并打开修复诊断台。

通过标准：

- 页面不出现空白或构建错误。
- Demo 项目能支撑“概览 -> 诊断 -> API 自动化修复入口”的闭环。
- 任何失败项都记录到本文件下方“发版验收记录”或对应版本 changelog。

## 4. 发版验收记录

| 日期 | 版本 | 执行人 | 后端 Smoke | 后端测试 | 前端 lint/build | 人工页面验收 | 备注 |
| --- | --- | --- | --- | --- | --- | --- | --- |
| 2026-05-12 | 0.2.8.2 | Codex | 未执行 | 通过 | 通过 | 后置 | 沉淀发版验收脚本，UI 自动化 smoke 后续执行 |
| 2026-05-12 | 0.2.8.2 | Codex | 未执行 | 46 passed | 通过 | 后置 | P0/P1 收口；统一日志、治理中心和 API Flow 变更已按批次归档，详见 `openmelon-0.2.8.2-change-batches.md` |
