# 变更日志 (Changelog)

本项目的所有重要更改都将统一记录在此文件中。

格式编写基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 的指导规范，
同时本项目的版本号遵循 [语义化版本管理 (Semantic Versioning)](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

## [0.2.8.9] - 2026-05-28

### 修复 (Fixed)
- **日志中心视察抽屉可读性**：日志详情视察抽屉由深色主题（`#090d16` 背景、低透明度白字）改为浅色主题（`#f8fafc` 背景、MUI 文本 token），提升文字对比度和可读性。
- **索引治理任务监控进度异常**：修复后台治理任务完成后进度条显示 0% 的问题。根因是任务成功时后端未同步 `total` 字段，且 Neo4j 记录缺少 embedding 导致 `processed` 远小于 `total`。后端成功路径强制 `total = processed`，前端对终态（`succeeded`/`cancelled`）直接显示 100%。
- **索引治理重建后一致性问题未根治**：修复三个根因——(1) 重建仅 UPSERT 不清除孤儿向量，现在重建成功后自动执行 `cleanup-orphans`；(2) 所有 Neo4j 查询缺少 `ORDER BY`，`LIMIT 5000` 下重建和扫描看到不同数据切片，统一加上 `ORDER BY chunk_id` / `ORDER BY vector_id`；(3) 扫描和计数查询未过滤 `embedding IS NULL` 的节点，导致无 embedding 的 chunk 永远被标记为缺失（重建无法为其创建向量），所有扫描和计数查询统一加上 `WHERE c.embedding IS NOT NULL`。
- **索引治理重建后资产健康数据不刷新**：修复重建任务完成后资产健康百分比仍显示旧值的问题。根因是 `rebuildQdrantMutation.onSuccess` 在任务创建时（非完成时）触发刷新，任务完成后无人通知资产查询重新获取。现在加入 `useEffect` 监听任务从运行中变为全部终态时自动刷新 `assetsQuery` / `summaryQuery` / `diagnosticsQuery`。
- **testcase_gen AI 调用消耗数据丢失**：修复三个问题——(1) `safe_record_ai_call` 静默吞异常，写入失败毫无痕迹，现改为记录 warning 日志；(2) `testcase_gen` 未传递 `input_tokens` / `output_tokens` / `total_tokens`，导致消耗显示全为 0；(3) autogen 流式调用内部丢弃了 `CreateResult.usage`。通过 monkey-patch `OpenAIChatCompletionClient.create_stream` 启用 `include_usage` 并累积 token 用量，上层 `ai_service` 读取后传入观测服务。
- **测试用例步骤换行显示**：修复生成用例中编号步骤挤在同一行的问题。提示词要求 LLM 步骤间用 `<br>` 换行，前端 `ReactMarkdown` 加 `rehype-raw` 渲染，`formatSteps()` 兜底自动补 `<br>`；解析器 `_split_merged_steps` 将合并步骤拆为独立条目，保证列表页表格和 Excel 导出逐行显示。
- **testcase_gen 推理引擎预设动态化**：模型预设从硬编码改为 API 驱动。新增 `GET/PUT /api/model-presets` 端点，预设和弃用标识存 JSON 文件，前端从 API 拉取，加/弃/删模型无需改代码部署。新增 `deepseek-v4-pro`、`deepseek-v4-flash` 预设，`deepseek-chat` 和 `deepseek-reasoner` 标记弃用标识。

## [0.2.8.8] - 2026-05-26

### 变更 (Changed)
- **API 自动化执行边界收口**：页面手动单步执行和全量链路执行改为直接执行，并通过 `execution_id` 支持强制结束；后台异步队列保留给定时任务、CI、批量回归和自动触发。
- **后台异步队列可靠性增强**：`/runs/async` 创建后立即保存 queued，worker 写入 running，执行进度持续落库；取消会同时标记 cancelled 和取消内存 task，晚到结果不会覆盖 cancelled，整体 run timeout 会稳定收尾为 failed。
- **API 自动化前端体验优化**：编排执行、结果诊断、历史记录、简洁工作台和工作流进度展示更新；单步执行 loading 时可直接点击「强制结束单步」，全量执行 loading 时可点击「强制结束执行」。
- **配置、治理和观测页面优化**：配置中心、项目与环境、Prompt Hub、节点类型、治理中心、日志中心、系统健康、AI/RAG 观测和索引治理页面完成布局与交互优化，并补充关键页面回归测试。
- **本机开发文档代理**：Vite dev server 新增 `/docs`、`/openapi.json`、`/redoc` 到后端 `8000` 的代理，支持通过 `http://localhost:3000/docs` 查看 FastAPI 文档。
- **演示项目改为当前服务只读冒烟**：内置 API 自动化演示项目改为调用当前 OpenMelon 服务的只读运行接口，避免依赖外部订单示例服务；执行经验默认进入待确认候选，不自动沉淀。

### 验证 (Verified)
- **API 执行回归**：`pytest backend/tests/test_api_execution_runner.py backend/tests/test_api_execution_run_queue.py` 通过，合计 21 个用例。
- **前端执行回归**：`vitest run src/features/APIExecution/components/StepOrchestrate.test.jsx src/features/APIExecution/components/StepResult.test.jsx src/features/APIExecution/components/APIExecutionPage.test.jsx` 通过，合计 6 个用例。
- **前端构建**：`vite build` 通过。

## [0.2.8.7] - 2026-05-20

### PostgreSQL 运行时迁移与观察期

#### 新增 (Added)
- **可选 PostgreSQL 运行时**：新增 `STORAGE_BACKEND=sqlite|postgres` 运行时开关，默认仍保留 SQLite；显式设置 `STORAGE_BACKEND=postgres` 与 `DATABASE_URL` 后，API execution、FileTracker、Prompt Hub 和 NodeTypeStore 可使用 PostgreSQL 作为共享元数据库。
- **PostgreSQL 迁移演练工具**：固化 SQLite 到 PostgreSQL 的 `plan`、`schema`、`copy`、`verify`、`compare` 流程，支持迁移前规划、JSONB schema 生成、数据复制、一致性校验和只读双跑对比。
- **PostgreSQL 健康检查卡片**：系统健康接口和设置页健康面板新增 PostgreSQL 组件；默认不启用 PG healthcheck，显式配置后展示 PG 连接状态。
- **PG 运行时 smoke 脚本**：新增 `backend/scripts/postgres_runtime_smoke.py`，覆盖系统健康、API execution、FileTracker、Prompt Hub、NodeTypeStore、事件日志和 AI 调用日志的真实运行路径。
- **PG 观察期 runbook**：新增 `docs/Knowledge/postgres-runtime-observation-smoke.md`，记录 smoke 顺序、只读 verify/compare 原则、观察清单、回滚原则和暂不重构表结构的判断标准。

#### 变更 (Changed)
- **SQLite 进入 legacy 角色**：在 `STORAGE_BACKEND=postgres` 模式下，SQLite 健康状态标记为 `legacy`，作为回滚备份和历史参考，不再作为主运行库。
- **PG schema 延续迁移期模型**：继续采用普通索引列 + `data JSONB` 的结构，不在迁移阶段拆分业务表；后续仅在观察到明确慢查询、增长压力或 JSONB 兼容问题后再做针对性优化。
- **PostgreSQL 连接改为 autocommit**：共享 PG 连接使用 autocommit，贴合当前 store 的单语句同步写入模式，降低开发期中断进程留下 idle transaction 后影响 schema 初始化和索引创建的风险。

#### 验证 (Verified)
- **PG runtime smoke**：`uv run --extra postgres python scripts/postgres_runtime_smoke.py --pretty` 通过，输出 `ok: true`，并确认临时 smoke 数据已清理。
- **后端回归**：`uv run --group dev pytest tests/test_system_health.py tests/test_postgres_store.py tests/test_postgres_migration.py tests/test_file_tracker_sqlite.py tests/test_prompt_hub_tracker.py tests/test_graph_node_type_sqlite.py tests/test_event_logs.py tests/test_api_execution_dashboard.py tests/test_api_execution_run_queue.py` 通过，合计 48 个用例。
- **迁移一致性**：`sqlite_to_postgres.py verify` 与 `sqlite_to_postgres.py compare --sample-size 5` 均返回 `ok: true`。
- **前端构建**：`npm --prefix frontend run build` 通过。

## [0.2.8.6] - 2026-05-18

### API 自动化资产化与 Agent MVP

#### 新增 (Added)
- **项目接口资产台账**：API 自动化新增项目-模块-接口资产模型，支持将 OpenAPI 规范拆解为可长期维护的项目资产，而不是每次执行前重复导入一次性接口列表。
- **OpenAPI 差异预览与确认同步**：新增规范版本记录、资产预览和确认同步流程，可在写入前查看新增、变更、移除接口，降低接口文档变化带来的误同步风险。
- **API Agent 冒烟测试 MVP**：新增基于模块或选中接口生成 smoke DSL 的 Agent 工作台，生成步骤携带 `module_id`、`interface_id` 和 `interface_key`，便于执行后关联回接口资产。
- **接口执行结果回写**：API 执行完成后回写接口资产的最近测试时间、通过/失败状态、状态码和失败摘要，接口台账可直接反映最近自动化健康状态。
- **接口资产维护首批能力**：支持编辑接口摘要、描述、模块归属、风险等级、状态和隐藏标记；支持隐藏、标记废弃和恢复 active。
- **手工资产维护**：支持在项目接口资产台账中新增手工模块和手工接口，手工接口允许编辑 method/path/operationId/tags，并支持物理删除。
- **项目级认证配置**：项目配置新增 `auth_config`，支持 bearer、api_key、basic 等认证方式，Agent 生成 DSL 时可自动注入 Header 或 Query。
- **项目级前置依赖配置**：项目配置新增 `setup_steps`，支持登录、初始化数据、变量提取等前置步骤；Agent 冒烟 DSL 会先执行前置步骤，再执行业务接口。
- **项目级清理流程配置**：项目配置新增 `cleanup_steps`，支持测试后删除数据、回滚状态或调用 cleanup 接口；主流程失败中断后仍会尽量执行清理步骤。
- **项目级配置向导**：API 自动化项目配置页新增认证向导、登录前置模板、清理步骤模板和变量引用检查，减少手写 JSON 配置成本。
- **Agent 失败诊断摘要**：执行结果页新增 Agent 诊断摘要，按失败类别、风险等级、影响步骤和修复建议聚合展示，并可直接生成 AI 修复草稿或返回编排定位。
- **参数负向测试生成**：API Agent 支持根据 OpenAPI 参数和 JSON Body schema 生成 negative DSL，覆盖缺少必填参数、非法枚举、错误类型和缺少必填 Body 字段等代表性校验场景。
- **变更影响测试推荐**：新增项目资产影响分析接口，基于 OpenAPI diff 和接口 `change_state` 推荐新增/变更后需要重测的接口，并在工作台提供一键生成变更影响测试计划入口。
- **项目测试任务沉淀**：Agent 生成或编排后的 DSL 可保存为项目级测试任务，后续在同项目中直接载入、复用或删除，减少重复选择模块/接口和重复生成脚本。
- **项目测试任务治理**：项目测试任务面板支持名称/说明/步骤/标签搜索、标签筛选、任务复制、版本说明和最近执行摘要展示。
- **Agent 工作台推荐**：Agent 测试页新增推荐解释区，展示当前测试范围、风险提示、缺失配置、认证提醒和可串联依赖候选。
- **业务链路自动编排**：Agent 冒烟 DSL 按登录/鉴权、创建、详情/更新、查询、删除的启发式顺序组织步骤，降低手工调整顺序成本。
- **依赖发现**：Agent 生成 DSL 时会识别登录 token、创建资源 ID 和路径参数引用，自动补充变量提取、`depends_on` 和必要的认证 Header 占位。
- **画布式依赖图确认**：编排执行页新增轻量 SVG 依赖图画布，展示步骤节点、依赖箭头、起点、后续步骤和禁用/缺失依赖风险，运行前可快速确认链路。
- **调度 / CI 入口**：执行历史区新增手动触发定时执行、规格同步 DSL 生成和 CI `curl` 命令入口，便于外部流水线或调度系统调用。
- **SQLite / PG 迁移准备检查**：新增 `GET /api/api-execution/storage/migration-readiness`，返回 SQLite 表规模、JSON 字段风险、PG JSONB 映射建议和执行历史归档策略。
- **资产相关后端接口**：新增项目资产列表、资产同步预览、确认同步、Agent 测试计划生成和接口资产更新接口。

#### 变更 (Changed)
- **Agent 执行边界收口**：Agent 默认跳过 `hidden`、`deprecated`、`removed`、`blocked` 接口，并继续遵守项目级 allowlist、blocklist、最大请求数和高风险人工确认策略。
- **OpenAPI 资产编辑边界明确**：OpenAPI 同步接口可维护摘要、描述、模块、风险等级、状态和隐藏标记，但不允许直接编辑 method/path，避免和规范源冲突；手工接口预留 method/path/operationId/tags 编辑能力。
- **API 自动化前端流程调整**：在导入与编排之间加入项目资产视角，支持按模块/接口筛选、查看资产摘要、预览同步差异、生成 Agent 冒烟 DSL 并进入现有编排执行链路。
- **编排模板语义统一**：原编排页“流程模板”文案收敛为“测试任务”，与 Agent 测试页的项目任务复用入口保持一致。
- **测试任务性能快照增强**：模板/任务性能快照补充最近一次执行状态、run id、用例名和耗时，方便前端判断任务可复用性。
- **Agent 计划响应增强**：资产测试计划响应新增推荐说明、依赖图和编排摘要字段，前端可直接展示计划依据。
- **执行快照补齐**：前端执行请求补齐项目策略快照和环境快照，后端执行服务也会合并环境变量，运行报告可追踪项目认证、前置依赖和环境配置来源。
- **策略边界覆盖 cleanup**：清理步骤纳入项目白名单/黑名单、请求数上限和高风险判断，避免清理接口绕过项目安全边界。
- **文档同步更新**：README 与 MANUAL 已补齐 API Agent v1 MVP、接口资产台账、项目测试任务复用与治理、差异同步、接口维护、执行回写、当前边界和后续 TODO。
- **P4 收口与 P5 顺延**：P4 范围收口为配置体验、依赖图确认、失败诊断、调度/CI 入口和迁移准备；React Flow / vis-network 可视化编排、语义依赖学习和跨系统链路编排顺延到 P5。

#### 当前边界 / TODO
- **OpenAPI 资产删除边界**：OpenAPI 同步接口仍不支持物理删除，删除类需求优先通过隐藏、废弃、阻断或规范同步移除处理。
- **项目级测试配置待继续增强**：OAuth 细分向导、复杂依赖编排和更深的跨环境配置治理仍需继续推进。
- **Agent 深度能力待推进**：React Flow / vis-network 可视化编排、语义级依赖学习、跨系统链路编排和更系统的参数组合策略仍在 P5 计划中。

### 验证 (Verified)
- **API 自动化回归**：`uv run pytest tests/test_api_execution_*.py` 通过，合计 136 个用例。
- **API Agent P3 回归**：`uv run pytest backend/tests/test_api_execution_project_environment.py backend/tests/test_api_execution_dashboard.py -q` 通过，合计 33 个用例。
- **API Agent P4 完整回归**：`uv run pytest backend/tests/test_api_execution_automation_triggers.py backend/tests/test_api_execution_diagnostics.py backend/tests/test_api_execution_project_environment.py -q` 通过，合计 34 个用例；项目配置、依赖图、诊断摘要、调度/CI 入口和迁移检查完成浏览器验证。
- **迁移准备接口验证**：`curl http://127.0.0.1:8000/api/api-execution/storage/migration-readiness` 返回 SQLite 表规模、JSONB 映射状态、JSON 风险和归档建议。
- **后端编译检查**：`uv run python -m compileall -q app/api_execution` 通过。
- **前端检查**：API Execution 相关 ESLint 检查通过，`vite build` 通过。
- **浏览器验证**：API 自动化「Agent 测试」页已显示项目测试任务面板和 Agent 推荐解释区，空态、搜索、标签筛选、复制按钮、未生成 DSL 时的保存禁用状态正常。
- **文档检查**：README、MANUAL 和 CHANGELOG 已同步当前 API Agent / 接口资产 / 项目测试任务范围。

## [0.2.8.5] - 2026-05-14

### 全系统架构现代化重构 (Full-stack Modernization)

#### 1. TanStack Query 深度集成
- **全局状态治理**：在全项目引入 `@tanstack/react-query`，取代了传统组件内手动维护的 `useState` 和 `useEffect` 数据流。
- **数据一致性**：通过 `queryClient` 实现了配置保存、日志清理、任务审批等操作后的自动缓存失效与视图刷新。
- **性能飞跃**：利用 `staleTime` 和 `keepPreviousData` 特性，消灭了翻页闪烁，实现了页面间的零延迟数据恢复。

#### 2. 核心模块重构成果
- **日志中心 (LogCenter)**：封装了 `useEventLogs`，支持统一日志与聚合日志的自动 Fallback 机制。
- **治理中心 (GovernanceCenter)**：拆分了 6 个原子化 Query，实现了任务队列、知识库、模板库的按需加载。
- **测试用例生成 (TestCase)**：实现了向量库状态的后台自动轮询，优化了流式生成过程中的状态同步。
- **API 自动化 (APIExecution)**：重构了 `ProjectEnv` 和 `RunHistory` Context，实现了配置持久化逻辑的标准化。
- **系统设置 (Settings)**：全量改造了 AI 观测看板、Prompt Hub、节点类型及项目环境配置页，消灭了散落在各处的冗余 `useEffect`。

#### 3. 后端驱动 UI 增强
- **配置同步**：将技术配置项的显示逻辑（Display Titles）与排序权重彻底移交给后端 `service.py` 处理。
- **契约对齐**：统一了前端组件与后端 Pydantic 模型的数据字段定义，减少了前端的逻辑映射成本。
- **多级编号智能识别**: 增强后端正则逻辑，支持自动识别并剥离 `.env.example` 中任何层级的数字编号（如 `9. 1.`），确保核心语义匹配的准确度。
- **专业命名全量覆盖**: 补齐了鉴权认证、意图识别、Rerank 引擎、异步消息回调等所有边缘配置模块的专业术语转换。

#### 4. 索引治理中心
- **独立模块入口**：在数据仪表盘后新增“索引治理”一级模块，统一呈现文档知识、测试用例、API 自动化知识的业务源、Neo4j 与 Qdrant 三边状态。
- **一致性扫描与明细对账**：新增 summary、assets、diagnostics 与单资产明细接口，识别 Neo4j 缺失 Qdrant 向量、Qdrant 孤儿向量和 API 知识业务源缺失索引。
- **向量库治理动作**：支持 API 知识状态同步到检索索引、孤儿向量清理、业务源缺失索引清理，并将失效/撤回/删除状态排除在 RAG 检索召回之外。
- **异步重建与操作护栏**：Qdrant 回填改为后台任务，前端展示进度、取消和失败重试；清理、重建、取消、重试均要求显式确认并写入日志中心“索引治理”审计分类。
- **日志中心映射**：日志中心模块枚举补齐 `index_governance`，索引扫描、同步、清理、重建任务生命周期均可按“索引治理”筛选。
- **治理台视觉优化**：索引治理页面升级为控制台式布局，优化顶部状态、指标卡、异步任务、资产表格、治理动作和明细弹窗的视觉层级与扫描效率。

### 验证 (Verified)
- **索引治理回归**：`python -m py_compile backend/app/index_governance/router.py backend/app/index_governance/tasks.py backend/app/storage/vector_ops.py backend/app/api/logging_service.py`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过；浏览器验证索引治理页面、异步任务区、资产表格和明细弹窗可正常显示。

## [0.2.8.4] - 2026-05-14

### 变更 (Changed)
- **运行配置中心架构迁移 (前端 ➔ 后端)**: 将配置分组的专业命名、排序权重和标题清洗逻辑从前端 React 代码下沉到后端 Python service，实现真正的数据驱动 UI。
- **配置数据契约升级**: 后端 `ConfigGroup` 模型新增 `display_title` 字段，实现 UI 展示名与技术标识名的解耦，提升跨客户端一致性。
- **前端轻量化重构**: 移除前端冗余的正则清洗、硬编码映射字典与复杂排序函数，`ConfigCenter.jsx` 逻辑缩减约 30%，显著提升维护效率。
- **多级编号智能识别**: 增强后端正则逻辑，支持自动识别并剥离 `.env.example` 中任何层级的数字编号（如 `9. 1.`），确保核心语义匹配的准确度。
- **专业命名全量覆盖**: 补齐了鉴权认证、意图识别、Rerank 引擎、异步消息回调等所有边缘配置模块的专业术语转换。

## [0.2.8.3] - 2026-05-13

### 变更 (Changed)
- **API Execution 路由 service 化**: API 执行、项目环境、OpenAPI 解析、模板、任务中心、AI 草稿/修复和知识沉淀路由改为薄路由，聚合、写库、诊断、AI 上下文拼装和知识治理逻辑下沉到 service 层。
- **列表分页协议统一**: 日志中心、任务中心、执行历史、知识治理和模板治理的列表接口统一暴露 `limit`、`offset`、`total`、`items` 字段，并保留旧字段兼容现有页面。
- **治理中心筛选与操作增强**: 治理中心补充任务状态/类型/风险/关键词、知识状态/类型/关键词、模板状态/关键词筛选，并新增复制 ID、模板删除和清空筛选操作。
- **治理中心流转收口**: 治理中心默认入口调整为待办队列，按“待办队列 -> 知识库 -> 模板库 -> 资产健康”组织功能；知识候选确认回到任务入口，知识库只管理已沉淀知识状态和危险删除。
- **待办队列展示优化**: 待办队列任务标题改为按状态展示，知识候选已完成后显示“知识已沉淀”，并用中文业务分类替代 `knowledge_ingest_candidate` 等技术枚举；“关联对象”列调整为“来源”，明确标记执行记录、项目或环境；任务 ID 和执行 ID 复制收敛为带提示的图标按钮。
- **日志中心生命周期治理**: 日志中心默认查看最近 7 天，新增历史日志清理入口；后端事件日志增加自动裁剪策略，默认保留 Error 并清理过期非 Error 日志，避免 SQLite 日志表无限增长。
- **日志清理接口兼容**: 日志清理前端优先使用专用 `POST /logs/events/cleanup` 接口，并在运行后端尚未加载新路由时回退旧 `DELETE /logs/events` 清理接口；补充“全部等级”清理回归。
- **日志清理反馈优化**: 日志清理范围新增“全部已记录”，支持清理当前项目/模块范围内全部已落库日志；当历史范围没有命中记录时提示“未删除记录”，避免误以为功能失效。
- **统一审计事件模型**: `event_logs` 写入统一约束模块枚举、事件类型枚举/前缀规则、非空 `trace_id` 生成和 `refs` 自动关联规则，并新增 `GET /api/logs/schema` 暴露当前审计事件契约。
- **日志关键词查询收口**: 日志关键词筛选限定为标题、说明、事件类型和关键关联标识，不再扫描完整 JSON 载荷，避免审计元数据导致误命中。
- **前端 API 层增强**: `fetchJSON`、`fetchStream` 和 `fetchBlob` 统一补齐超时、`AbortController`、请求 ID、标准 `APIError`、401/5xx 友好错误信息和全局 API 错误事件。
- **知识治理状态语义收口**: 知识治理明确“标记失效/撤回使用”不做物理删除，知识类型筛选改为按后端真实 `item_type` 动态生成并保留中文映射。
- **知识治理永久删除**: 新增知识项永久删除危险操作，仅允许对已标记失效或已撤回使用的知识执行，并通过确认弹窗提示不可恢复和外部索引残留风险。
- **前端治理/日志中心组件拆分**: 治理中心按模型、待办队列、知识库、模板库和资产健康拆分组件，日志中心按筛选、清理、统计、分页、表格和详情抽屉拆分视图，主组件收敛为数据加载和动作编排。
- **API 自动化状态边界整理**: 明确 API 自动化 `ui/spec/project/dsl/execution/history` 六类状态归属，新增跨域状态协调工具，统一处理文档切换重置、历史执行载入和策略快照注入，减少 context 间直接依赖。
- **空状态/错误态标准化**: 扩展统一 `EmptyState` 组件支持 loading、error、empty 和 retry，用于 API 执行概览、日志中心、治理中心、图谱和测试用例生成的加载失败、无数据和重试场景。
- **AI/RAG 调用可观测**: 新增 AI 调用元数据记录表和设置页“AI/RAG 观测”面板，记录模型、耗时、字符/token 量、降级状态和失败原因；RAG 回答、Embedding 和测试用例生成已接入，且不保存 prompt 原文。
- **AI/RAG 调试快照**: AI/RAG 观测新增默认关闭的调试快照开关，开启前需二次确认；仅短期保存脱敏后的 prompt/响应片段，并提供快照查看弹窗用于本机排障。
- **前端测试基线**: 引入 Vitest 与 React Testing Library，补充 API 客户端 mock、API Execution 核心工具函数、统一空状态组件和 AI/RAG 观测关键状态测试。
- **配置版本治理**: 后端 `pyproject.toml`、`uv.lock`、前端 `package.json/package-lock.json` 统一到 `0.2.8.3`，FastAPI 应用版本改为读取统一版本 helper，并新增版本契约测试防止版本漂移。
- **版本同步脚本**: 新增 `scripts/sync_version.py`，支持一条命令同步 changelog、后端包版本、锁文件和前端包版本，并提供 `--check` 模式用于发版前检查。
- **性能边界优化**: 设置页内部重面板继续按需加载；后端列表/聚合接口增加 `limit/offset` 参数约束，SQLite 补充 runs、任务、日志、AI 调用和知识治理复合索引，并收窄执行历史关键词查询，避免全表 JSON 扫描。
- **模块级领域边界**: 新增 `app.domain_boundaries` 领域清单和领域边界文档，明确 API 自动化、测试用例生成、知识库/RAG、治理中心、日志中心的后端 package 与前端 feature 归属；日志中心新增 `app.log_center` facade，前端治理/日志/AI 观测/执行仪表盘补齐 feature 根入口。
- **日志中心领域迁包**: 日志中心路由实现迁入 `app.log_center.router`，响应模型拆入 `app.log_center.schemas`，旧 `app.api.routers.logs` 保留兼容 re-export，后续日志中心新增能力统一落到领域包。
- **治理中心 service facade**: 新增 `app.governance_center.services`，统一承接待办队列、知识治理和模板治理服务入口；原 API 自动化路由路径保持不变，内部调用改走治理中心领域 facade。
- **知识库/RAG facade**: 新增 `app.knowledge_rag` 领域入口，集中暴露图谱/向量操作、检索器、RAG 生成器、索引器、覆盖率和文件追踪，并将后端启动装配收敛到 `build_knowledge_rag_components`。
- **环境配置模板补齐**: `.env.example` 补充运行时数据目录、节点类型配置路径、上传大小和事件日志生命周期配置，并新增契约测试防止后续配置项遗漏模板说明。
- **运行配置中心初版**: 设置页新增“运行配置”模块，按 `.env.example` 分组展示当前 `.env` 状态，支持缺失 `.env` 时最小初始化/从模板初始化、敏感值遮蔽、可编辑项保存前校验和自动备份；配置来源区分“已生效 .env / 程序默认 / 模板示例 / 未设置”，避免把注释配置误判为已打开。
- **testcase_gen LLM 生效关系收口**: testcase_gen 统一按 `CUSTOM > QWEN/DEEPSEEK > 主模块` 判定实际调用模型，生成/分析/评审展示真实模型名，AI/RAG 观测记录真实 provider、model 和来源，并在运行配置中心展示视觉模型与文本模型当前来源。
- **LLM Provider Registry 阶段一**: 新增统一 Provider Registry，集中维护 `openai_compat/openai/qwen/deepseek/mimo` 默认值、别名和运行配置下拉选项；`Settings.apply_provider_defaults` 与运行配置中心统一读取 registry，保持 unknown provider 兼容回退，不改变当前 `.env` 运行语义。
- **运行配置 LLM 展示优化**: testcase_gen LLM 摘要改为展示最终生效模型、Base URL 和来源说明；独立 LLM 配置区改为“统一自定义模型 / 视觉分析模型 / 文本生成评审模型”三张用途卡片，Base URL 支持复用主模块、官方默认或自定义，模型名支持推荐选项和手动输入。
- **运行配置卡片化**: 运行配置左侧目录统一为卡片按钮，普通配置项改为两列卡片网格，状态、说明和输入区分层展示，和 testcase_gen LLM 用途卡片保持一致。
- **LLM Provider Registry 2A**: Provider Registry 补充 provider 能力、默认地址标签、推荐聊天模型和推荐 Embedding 模型；运行配置中心主模块 LLM 分组展示当前 provider 能力与推荐模型快捷选择，不改变当前启动和 `.env` 语义。
- **LLM Provider Registry 2B**: 运行配置校验新增非阻断 warning，提示未知 provider 兼容回退、无默认 Embedding、主模块 Key 缺失和 testcase_gen 独立 LLM 复用默认模型/Base URL 等风险；保存流程会展示提示但不改变 `.env` 格式和现有运行语义。
- **LLM Provider Registry 2C-3B**: 运行配置新增重启后生效预览、Provider 配置模板快捷应用、provider/settings/config preview/testcase_gen 一致性验证，并为 Registry 增加模板导出和 future provider 注册入口，便于后续扩展大模型厂商。
- **运行配置 Provider 管理初版**: 运行配置新增 `Provider 管理` 子分组，支持在设置页创建、编辑和删除自定义 LLM Provider，并单独持久化到 runtime 配置文件；主模块 LLM 分组可直接消费这些自定义 Provider 模板，不改变 `.env` 结构。
- **运行配置热更新阶段一收尾**: 主模块 LLM 热更新进一步覆盖 testcase_gen 主模块回退链路、API 修复入口以及 embedding 相关检索/索引公共路径；运行配置卡片补充 `热更新/需重启` 标识，减少配置生效范围误判。
- **文档同步更新**: README、操作说明和 MANUAL 已补齐运行配置中心、Provider 管理、自定义 Provider 持久化位置和热更新/需重启边界说明，避免页面能力上线后文档仍停留在旧配置方式。

### 修复 (Fixed)
- **日志中心运行时崩溃**: 修复设置页日志中心直接调用 `formatRunTime` 但未导入导致 `ReferenceError: formatRunTime is not defined` 的问题，日志中心统计卡片、表格时间和详情抽屉可正常渲染。
- **治理中心知识库加载失败**: 修复治理中心为生成知识类型筛选项请求 `GET /api/api-execution/knowledge/review?limit=500&offset=0` 时，后端路由仍限制 `limit <= 200` 导致 FastAPI 参数校验失败的问题；知识治理 review 接口与 service 安全上限统一调整为 500。

### 验证 (Verified)
- **日志中心崩溃修复回归**: `npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **治理中心知识库加载回归**: `conda activate openmlon && python -m pytest backend/tests/test_api_execution_knowledge.py -q` 与 `npm --prefix frontend run lint` 通过。
- **API Execution service 化回归**: `python -m compileall backend/app/api_execution`、`uv run pytest backend/tests`、`npm --prefix frontend run lint`、`npm --prefix frontend run build` 与 `bash scripts/release_acceptance_smoke.sh` 通过。
- **列表分页协议统一回归**: `python -m compileall backend/app/api_execution backend/app/api/routers/logs.py`、API Execution 相关 pytest 与 `npm --prefix frontend run lint` 通过。
- **治理中心筛选与操作回归**: `npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **治理中心流转收口回归**: `npm --prefix frontend run lint` 通过。
- **待办队列任务命名回归**: `npm --prefix frontend run lint` 通过。
- **日志中心生命周期回归**: `uv run pytest backend/tests/test_event_logs.py`、`uv run pytest backend/tests`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **统一审计事件模型回归**: `conda activate openmlon && python -m pytest backend/tests/test_event_logs.py` 通过。
- **前端 API 层回归**: `npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **知识治理状态语义回归**: `npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **知识治理永久删除回归**: `uv run pytest backend/tests/test_api_execution_knowledge.py`、`uv run pytest backend/tests`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **前端治理/日志中心拆分回归**: `npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **API 自动化状态边界回归**: `npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **空状态/错误态标准化回归**: `npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **AI/RAG 调用观测回归**: `conda activate openmlon && python -m compileall backend/app/api/ai_observability_service.py backend/app/api/routers/logs.py backend/app/api_execution/sqlite_store.py backend/app/engine/rag/generator.py backend/app/main.py backend/app/services/indexer.py backend/app/testcase_gen/services/ai_service.py`、`conda activate openmlon && python -m pytest backend/tests/test_event_logs.py`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **AI/RAG 调试快照回归**: 调试快照设置接口开启/关闭验证通过，`conda activate openmlon && python -m pytest backend/tests/test_event_logs.py`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **前端测试基线回归**: `npm --prefix frontend run test`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **配置版本治理回归**: `conda activate openmlon && python -m pytest backend/tests/test_version_contract.py`、`npm --prefix frontend run test`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **版本同步脚本回归**: `python scripts/sync_version.py 0.2.8.3 --date 2026-05-13 --check` 与 `conda activate openmlon && python -m pytest backend/tests/test_version_contract.py` 通过。
- **性能边界回归**: `conda activate openmlon && python -m pytest backend/tests/test_api_execution_optimizations.py backend/tests/test_event_logs.py backend/tests/test_api_execution_dashboard.py`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **模块级领域边界回归**: `conda activate openmlon && python -m pytest backend/tests/test_domain_boundaries.py backend/tests/test_event_logs.py`、`npm --prefix frontend run lint` 与 `npm --prefix frontend run build` 通过。
- **日志中心领域迁包回归**: `conda activate openmlon && python -m pytest backend/tests/test_domain_boundaries.py backend/tests/test_event_logs.py` 通过。
- **治理中心 service facade 回归**: `conda activate openmlon && python -m pytest backend/tests/test_domain_boundaries.py backend/tests/test_api_execution_dashboard.py backend/tests/test_api_execution_knowledge.py` 通过。
- **知识库/RAG facade 回归**: `conda activate openmlon && python -m pytest backend/tests/test_domain_boundaries.py backend/tests/test_coverage_service.py backend/tests/test_file_tracker_sqlite.py`、`conda activate openmlon && python -m compileall backend/app/knowledge_rag backend/app/main.py` 通过。
- **环境配置模板回归**: `conda activate openmlon && python -m pytest backend/tests/test_env_example_contract.py` 通过。
- **运行配置中心回归**: `conda activate openmlon && python -m pytest backend/tests/test_env_example_contract.py backend/tests/test_config_center_service.py`、`conda activate openmlon && python -m compileall backend/app/config_center backend/app/api/routes.py`、`npm --prefix frontend run lint`、`npm --prefix frontend run build` 与 `npm --prefix frontend run test` 通过。
- **testcase_gen LLM 生效关系回归**: `conda activate openmlon && python -m pytest backend/tests/test_config_center_service.py backend/tests/test_env_example_contract.py`、`conda activate openmlon && python -m compileall backend/app/testcase_gen backend/app/config_center`、`npm --prefix frontend run lint`、`npm --prefix frontend run build` 与 `npm --prefix frontend run test` 通过。
- **LLM Provider Registry 回归**: `conda activate openmlon && python -m pytest backend/tests/test_llm_provider_registry.py backend/tests/test_config_center_service.py backend/tests/test_env_example_contract.py`、`conda activate openmlon && python -m compileall backend/app/llm_provider_registry.py backend/app/config.py backend/app/config_center` 通过。
- **运行配置 LLM 展示回归**: `conda activate openmlon && python -m pytest backend/tests/test_config_center_service.py backend/tests/test_llm_provider_registry.py backend/tests/test_env_example_contract.py`、`conda activate openmlon && python -m compileall backend/app/config_center backend/app/testcase_gen/utils/llms.py`、`npm --prefix frontend run lint`、`npm --prefix frontend run build` 与 `npm --prefix frontend run test` 通过。
- **运行配置卡片化回归**: `npm --prefix frontend run lint`、`npm --prefix frontend run build` 与 `npm --prefix frontend run test` 通过。
- **LLM Provider Registry 2A 回归**: `conda activate openmlon && python -m pytest backend/tests/test_llm_provider_registry.py backend/tests/test_config_center_service.py backend/tests/test_env_example_contract.py`、`conda activate openmlon && python -m compileall backend/app/llm_provider_registry.py backend/app/config_center`、`npm --prefix frontend run lint`、`npm --prefix frontend run build` 与 `npm --prefix frontend run test` 通过。
- **LLM Provider Registry 2B 回归**: `conda activate openmlon && python -m pytest backend/tests/test_config_center_service.py backend/tests/test_llm_provider_registry.py backend/tests/test_env_example_contract.py`、`conda activate openmlon && python -m compileall backend/app/config_center backend/app/llm_provider_registry.py`、`npm --prefix frontend run lint`、`npm --prefix frontend run build` 与 `npm --prefix frontend run test` 通过。
- **LLM Provider Registry 2C-3B 回归**: `conda activate openmlon && python -m pytest backend/tests/test_config_center_service.py backend/tests/test_llm_provider_registry.py backend/tests/test_env_example_contract.py`、`conda activate openmlon && python -m compileall backend/app/config_center backend/app/llm_provider_registry.py`、`npm --prefix frontend run lint`、`npm --prefix frontend run build` 与 `npm --prefix frontend run test` 通过。

## [0.2.8.2] - 2026-05-12
