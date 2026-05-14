# OpenMelon 模块级领域边界

## 目标

让后端 package 和前端 feature 的归属更明确，新增能力优先落到对应领域目录，跨领域调用通过 service、router facade 或 API 层完成，避免页面、router、store 继续横向膨胀。

## 领域划分

| 领域 | 后端边界 | 前端边界 | 主要职责 |
| --- | --- | --- | --- |
| API 自动化 | `app.api_execution` | `features/APIExecution`, `features/APIExecutionFlow`, `features/APIExecutionDashboard` | OpenAPI 解析、流程 DSL、执行队列、执行历史、流程模板、受控修复 |
| 测试用例生成 | `app.testcase_gen` | `features/TestCase` | 需求解析、用例生成、用例导出、Prompt Hub 生成上下文 |
| 知识库/RAG | `app.knowledge_rag` | `features/QA`, `features/Graph`, `features/Manage`, `features/Coverage` | 文档索引、向量检索、图谱检索、RAG 回答、覆盖率 |
| 治理中心 | `app.governance_center` | `features/GovernanceCenter` | 待办队列、知识治理、模板治理、资产健康 |
| 日志中心 | `app.log_center`, `app.api.logging_service` | `features/LogCenter`, `features/AIObservability` | 审计事件、日志查询、日志清理、AI/RAG 调用观测 |

## 当前落地规则

- 后端新增路由优先放在领域 package 下；日志中心实现已迁入 `app.log_center.router`，旧 `app.api.routers.logs` 仅保留兼容 re-export。
- 治理中心后端入口已收敛到 `app.governance_center.services`；原 API 自动化路由路径保持不变，但任务队列、知识治理和模板治理操作统一经由治理中心 facade 调用。
- 知识库/RAG 后端入口已收敛到 `app.knowledge_rag`；`main.py` 通过 `build_knowledge_rag_components` 装配 Neo4j、图谱/向量操作、检索器、生成器、索引器和覆盖率服务。
- 前端 feature 对外暴露 `index.js`，页面层优先从 feature 根目录导入，内部组件路径保持 feature 私有。
- 跨领域共享能力优先放 service 或 API 客户端，不从页面直接导入另一个 feature 的内部组件。
- 领域边界清单由 `app.domain_boundaries.DOMAIN_BOUNDARIES` 维护，并通过测试检查后端 package 可导入、前端 feature 存在。

## 后续迁移顺序

1. 将治理中心后端内部实现继续从 `api_execution.services` 迁入 `app.governance_center`，保留旧 service import 兼容。
2. 将 `app.services.indexer/file_tracker/coverage` 的实现逐步迁入 `app.knowledge_rag`，保留旧 import 兼容。
3. 前端 `APIExecutionPage` 内部继续收敛到 feature 根导出，页面层只负责布局和 Provider 装配。
