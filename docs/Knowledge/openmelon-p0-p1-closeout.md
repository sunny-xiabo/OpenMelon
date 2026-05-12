# OpenMelon P0/P1 收口记录

## 收口结论

截至 2026-05-12，OpenMelon 当前优化路线的 P0「可演示、可回归」和 P1「可治理、可追踪」已完成主体收口。

本轮不继续扩大 P2 范围，P2「可观察、可趋势化」作为下一阶段独立启动。

当前工作区变更较多，已按 0.2.8.2 内部功能域拆分归档边界，详见 `docs/Knowledge/openmelon-0.2.8.2-change-batches.md`。

## 已收口范围

### P0：可演示、可回归

- [x] Demo OpenAPI 资产一键加载。
- [x] Demo Project 一键初始化项目、环境、执行样例、失败诊断样例和知识样本。
- [x] 发版验收 Smoke 脚本沉淀到 `docs/Knowledge/release-acceptance-smoke.md`。
- [x] 任务中心轻量聚合接口完成，可展示待处理任务、风险、类型和处理队列。
- [x] API 执行概览、失败诊断入口、API 自动化修复入口连通。

### P1：可治理、可追踪

- [x] 设置页新增治理中心。
- [x] 知识治理支持待确认、已沉淀、失效、撤回和恢复有效。
- [x] 任务中心、模板治理、数据资产状态完成第一版。
- [x] 设置页新增日志中心。
- [x] 业务事件日志统一到 `/api/logs/events`、`/api/logs/summary`、`/api/logs/events/{event_id}/related`。
- [x] 原系统日志文件接口 `/api/logs`、`/api/logs/list` 保留。
- [x] 核心业务模块写入统一业务事件日志：
  - API 自动化执行、策略、任务、知识、AI 助手。
  - 测试用例生成与向量入库。
  - 文档索引、上传、异步上传任务。
  - RAG 查询。
  - 图谱节点类型治理。
  - Prompt Hub 配置变更。
  - 文件管理删除与重建索引。
  - 企业微信、钉钉、飞书 webhook。

## 明确不纳入本次收口

- Playwright 级 UI 自动化 smoke：后置到 UI 验收阶段。
- P2 趋势化能力：执行趋势图、flaky 排行、失败原因趋势、知识命中率趋势。
- P3 结构治理：`api_execution/routers.py` 领域拆分、前端 API 自动化进一步拆分、契约测试体系。
- 系统日志文件子视图：原 `/api/logs` 可继续使用，日志中心内的系统日志文件查看入口后续再做。
- Reranker sidecar 调用成功率和耗时日志：后续纳入运行态观测。

## 验收命令

后端回归：

```bash
uv run pytest backend/tests/test_event_logs.py backend/tests/test_api_execution_project_environment.py backend/tests/test_api_execution_knowledge.py backend/tests/test_api_execution_dashboard.py backend/tests/test_prompt_hub_tracker.py backend/tests/test_graph_node_type_sqlite.py backend/tests/test_api_execution_ai_assistant.py backend/tests/test_api_execution_flow_draft.py
```

前端回归：

```bash
cd frontend
npm run lint
npm run build
```

## 最近一次验证结果

- 后端 pytest：46 passed。
- 前端 lint：通过。
- 前端 build：通过。

## P2 启动条件

进入 P2 前建议确认：

- P0/P1 不再追加大功能，只接受缺陷修复和小幅文案/交互修补。
- 日志中心能稳定展示业务事件，且 fallback 仍可工作。
- Demo Project 能支撑人工演示主链路。
- Changelog 已按 `0.2.8.2 - 2026-05-12` 同步。
- 当前脏工作区按批次归档清楚，提交或交接时不再混合新增功能。

## 下一阶段建议

P2 推荐从「API 执行趋势接口 + 执行概览趋势图」开始，仍复用现有 `runs`、`event_logs` 和 `automation_tasks`，不新增表。
