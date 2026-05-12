# OpenMelon 0.2.8.2 变更分批归档

## 归档目标

当前工作区变更较多，0.2.8.2 内部按功能域拆成可独立验收、可独立提交的批次，避免 API Flow、治理中心、统一日志、Reranker 和文档归档互相覆盖。

本文件只定义归档边界，不代表已经执行 git commit。

## Batch 1：基础设施与文档归档

目的：降低环境启动和文档导航成本。

建议包含：

- `.env.example`
- `README.md`
- `MANUAL.md`
- `docker-compose.yml`
- `backend/docker/Dockerfile`
- `backend/pyproject.toml`
- `backend/uv.lock`
- `backend/app/config.py`
- `backend/app/reranker_service.py`
- `backend/app/engine/reranker.py`
- `backend/app/engine/retrieval/multi_channel.py`
- `docs/Knowledge/FRONTEND_DEPLOYMENT.md`
- `docs/Knowledge/OPERATION_INTRO_GUIDE.md`
- `docs/Knowledge/PROMPT_HUB_GUIDE.md`
- `docs/planning/UI_EXECUTION_PLAN.md`
- 删除根目录旧文档：
  - `docs/FRONTEND_DEPLOYMENT.md`
  - `docs/OPERATION_INTRO_GUIDE.md`
  - `docs/PROMPT_HUB_GUIDE.md`
  - `docs/UI_EXECUTION_PLAN.md`

验收：

- 后端依赖锁文件一致。
- 文档链接不指向已删除根级文档。
- Reranker sidecar 可独立启动或被禁用降级。

## Batch 2：API 执行概览与流程编排 P0/P1

目的：把 API 自动化从“选接口执行”升级为可编排、可复用、可观察的流程工作台。

建议包含：

- `backend/app/api_execution/schemas.py`
- `backend/app/api_execution/routers.py`
- `backend/app/api_execution/utils.py`
- `backend/app/api_execution/diagnostics.py`
- `backend/tests/test_api_execution_dashboard.py`
- `backend/tests/test_api_execution_demo_assets.py`
- `frontend/src/features/APIExecutionDashboard/`
- `frontend/src/features/APIExecutionFlow/`
- `frontend/src/features/APIExecution/components/StepOrchestrate.jsx`
- `frontend/src/features/APIExecution/components/StepImport.jsx`
- `frontend/src/features/APIExecution/components/RunHistory.jsx`
- `frontend/src/features/APIExecution/context.jsx`
- `frontend/src/features/APIExecution/contexts/`
- `frontend/src/pages/DashboardPage.jsx`
- `frontend/src/api/execution.js`
- `frontend/src/constants/events.js`
- `docs/Knowledge/api-execution-dashboard-plan.md`
- `docs/Knowledge/api-flow-orchestration-mvp-plan.md`
- `docs/samples/api-flow-demo-openapi.json`

验收：

- `uv run pytest backend/tests/test_api_execution_dashboard.py backend/tests/test_api_execution_demo_assets.py backend/tests/test_api_execution_project_environment.py`
- `npm run lint`
- `npm run build`

## Batch 3：API Flow P2 AI 编排与失败修复闭环

目的：AI 草稿、修复建议分级、受控重跑和知识沉淀闭环。

建议包含：

- `backend/app/api_execution/ai_assistant.py`
- `backend/app/api_execution/knowledge.py`
- `backend/tests/test_api_execution_ai_assistant.py`
- `backend/tests/test_api_execution_diagnostics.py`
- `backend/tests/test_api_execution_flow_draft.py`
- `backend/tests/test_api_execution_knowledge.py`
- `frontend/src/features/APIExecution/components/AIFlowDraftDialog.jsx`
- `frontend/src/features/APIExecution/components/StepResult.jsx`
- `frontend/src/features/APIExecution/components/StepScope.jsx`
- `frontend/src/features/APIExecution/utils/repairPatch.js`
- `docs/Knowledge/api-flow-orchestration-p2-plan.md`
- `docs/Knowledge/api-flow-orchestration-acceptance.md`

验收：

- `uv run pytest backend/tests/test_api_execution_ai_assistant.py backend/tests/test_api_execution_diagnostics.py backend/tests/test_api_execution_flow_draft.py backend/tests/test_api_execution_knowledge.py`
- `npm run lint`
- `npm run build`

## Batch 4：治理中心与统一业务日志

目的：P1 可治理、可追踪收口。

建议包含：

- `backend/app/api/logging_service.py`
- `backend/app/api/routers/logs.py`
- `backend/app/api/routes.py`
- `backend/app/api/management_routes.py`
- `backend/app/api/routers/graph.py`
- `backend/app/api/routers/ingestion.py`
- `backend/app/api/routers/prompt_hub.py`
- `backend/app/api/routers/query.py`
- `backend/app/api/routers/webhooks.py`
- `backend/app/api_execution/sqlite_store.py`
- `backend/app/api_execution/storage.py`
- `backend/app/testcase_gen/routers.py`
- `backend/tests/test_event_logs.py`
- `backend/tests/test_prompt_hub_tracker.py`
- `backend/tests/test_graph_node_type_sqlite.py`
- `frontend/src/features/GovernanceCenter/`
- `frontend/src/features/LogCenter/`
- `frontend/src/pages/SettingsPage.jsx`
- `docs/Knowledge/openmelon-project-p1-governance-plan.md`
- `docs/Knowledge/unified-log-interface-plan.md`

验收：

- `uv run pytest backend/tests/test_event_logs.py backend/tests/test_api_execution_knowledge.py backend/tests/test_prompt_hub_tracker.py backend/tests/test_graph_node_type_sqlite.py`
- `npm run lint`
- `npm run build`

## Batch 5：P0/P1 收口、发版验收与变更日志

目的：把版本状态封口，明确 P2/P3 不在本批继续扩大。

建议包含：

- `CHANGELOG.md`
- `docs/Knowledge/openmelon-project-optimization-roadmap.md`
- `docs/Knowledge/openmelon-p0-p1-closeout.md`
- `docs/Knowledge/release-acceptance-smoke.md`
- `docs/Knowledge/openmelon-0.2.8.2-change-batches.md`
- `frontend/.eslintignore`

验收：

- Changelog 版本号为 `0.2.8.2 - 2026-05-12`。
- `0.2.8.1 - 2026-05-11` 不被移动或改写为当前版本。
- P0/P1 收口记录明确 P2 不继续扩大。
- 发版验收记录包含最近一次测试结果。

## 当前建议提交顺序

1. Batch 1：基础设施与文档归档。
2. Batch 2：API 执行概览与流程编排 P0/P1。
3. Batch 3：API Flow P2 AI 编排与失败修复闭环。
4. Batch 4：治理中心与统一业务日志。
5. Batch 5：P0/P1 收口、发版验收与变更日志。

## 风险提示

- `backend/app/api_execution/routers.py` 文件较大，Batch 2 和 Batch 3 都会触及，实际提交时要按 diff hunk 审核，避免把不同阶段混到同一个提交。
- `frontend/src/api/execution.js` 同时服务 API Flow、治理中心和日志中心，提交时需要确认导出 API 没有漏带。
- `CHANGELOG.md` 只放最终版本记录，避免每个中间批次重复改同一段造成冲突。
- 工作区存在较多新增目录，提交前建议按上述批次逐个 `git add`，不要一次性全量提交。
