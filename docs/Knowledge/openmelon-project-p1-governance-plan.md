# OpenMelon P1 治理与追踪计划

## 目标

把 P0 的“可演示、可回归”继续推进到“可治理、可追踪”。P1 聚焦 API 自动化相关的待处理任务、知识沉淀、知识失效治理、模板状态和历史表现，不引入新的底层存储表。

## 范围

- 统一任务中心页面：失败待诊断、知识待确认、策略阻断、写入失败、定时失败。
- 知识库审核能力：待确认、已沉淀、已失效、已撤回。
- 知识来源与修复效果追踪：展示来源 run、项目、知识类型、修复效果评分。
- 模板治理轻量增强：模板版本、废弃状态、适用范围和历史表现。

## 设计约束

- 复用现有 SQLite 表：`automation_tasks`、`knowledge_items`、`automation_definitions`、`runs`。
- 不新增迁移；新增状态字段写入现有 JSON data。
- 前端治理能力放入设置页「治理中心」，不新增顶栏 Tab。
- API 自动化页只保留执行历史和治理中心跳转入口。
- UI 采用当前 MUI 工具型风格，使用 `Paper/Table/Chip/Tabs/Button`，保持信息密度。
- Playwright/UI 自动化 smoke 仍后置，不纳入本阶段。

## 后端接口

### 任务中心

- 已有：`GET /api/api-execution/automation/task-center/summary`
- 已有：`GET /api/api-execution/automation/tasks`
- 已有：`POST /api/api-execution/automation/tasks/{task_id}/resolve`

P1 页面优先复用以上接口。

### 知识治理

新增：

- `GET /api/api-execution/knowledge/review?project_id=&status=&item_type=&limit=50`
- `PATCH /api/api-execution/knowledge/items/{knowledge_id}/status`

状态约定：

- `active`：已沉淀、可召回。
- `invalid`：已失效，不应作为优先推荐。
- `revoked`：已撤回，保留审计但不作为推荐。

### 模板治理

复用 `automation_definitions` 中的流程模板记录，新增 JSON 字段：

- `version`
- `deprecated`
- `scope`
- `performance_snapshot`

第一版先在模板列表/统计中展示，复杂版本回滚后置。

## 前端交互

在设置页新增「治理中心」：

- Tab 1：执行历史
- Tab 1：知识治理
  - 知识状态筛选：待确认、已沉淀、已失效、已撤回。
  - 待确认来自 `knowledge_ingest_candidate` 任务。
  - 已沉淀来自 `knowledge_items`。
  - 支持标记失效、撤回、恢复有效。
- Tab 2：任务中心
  - 顶部任务指标：待处理、失败、已完成、总数。
  - 处理队列：失败待诊断、知识待确认、策略阻断、写入失败、定时失败。
  - 最近任务表：按类型展示操作入口。
- Tab 3：模板治理
  - 展示模板版本、状态、适用范围和历史表现。
  - 第一版只读展示，编辑/回滚后置。
- Tab 4：数据资产
  - 汇总当前知识、模板、待处理和写入失败数量。
  - 写入失败时提示到任务中心处理。

在设置页新增「日志中心」：

- 聚合 API 执行记录、策略审计、自动化任务和知识项状态事件。
- 支持项目、模块、等级和关键词筛选。
- 支持右侧抽屉查看原始事件详情。
- 当前已从前端多接口聚合升级为优先调用统一业务事件接口 `/api/logs/events`、`/api/logs/summary`、`/api/logs/events/{event_id}/related`。
- OpenMelon 原有 `/api/logs` 和 `/api/logs/list` 继续作为系统日志文件读取接口保留。

## 验收清单

- [x] 任务中心 summary 能按项目过滤，并展示类型、风险和处理队列。
- [x] 知识治理能看到待确认候选和已沉淀知识。
- [x] 已沉淀知识支持标记失效、撤回、恢复有效。
- [x] 执行历史仍能载入、重跑、删除。
- [x] `npm run lint`、`npm run build` 通过。
- [x] 相关后端 pytest 通过。

## 完成记录

- 新增 `GET /api/api-execution/knowledge/review`。
- 新增 `PATCH /api/api-execution/knowledge/items/{knowledge_id}/status`。
- 设置页新增「治理中心」和「日志中心」。
- API 自动化页底部 `RunHistory` 收敛为执行历史，并提供治理中心跳转。
- 流程模板列表返回 `version`、`deprecated`、`scope`、`performance_snapshot`。
- 失效和撤回知识会从本地修复知识召回索引中过滤。
- 新增统一业务事件日志接口，日志中心优先使用后端分页、统计和关联事件查询。
- 原系统日志文件接口 `/api/logs`、`/api/logs/list` 未移除，后续可在日志中心增加“系统日志文件”子视图。
- 统一日志写入范围扩展到测试用例生成、测试用例向量入库、文档索引/上传、异步上传任务、RAG 查询、图谱节点类型治理、Prompt Hub 配置变更、文件管理删除/重建索引、企业 webhook 和 API 自动化 AI 助手。

## 后续增强

- 独立任务中心顶栏模块。
- 知识候选差异预览。
- 模板版本回滚和模板废弃影响分析。
- 失效知识从向量库/图谱召回中降权或过滤。
- 日志中心增加系统日志文件查看入口，与业务事件日志分栏展示。
- Reranker sidecar 和外部依赖健康事件继续接入统一日志。
