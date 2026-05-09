# 变更日志 (Changelog)

本项目的所有重要更改都将统一记录在此文件中。

格式编写基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 的指导规范，
同时本项目的版本号遵循 [语义化版本管理 (Semantic Versioning)](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

## [0.2.8] - 2026-05-09

*(API 自动化执行稳定性修复 & 前端模块加载容错增强)*

### 新增 (Added)
- **前端懒加载容错**: 新增 `utils/lazyWithRetry.js` 工具，替代原生 `React.lazy()`，模块加载失败时自动重试最多 3 次（间隔递增），全部失败后自动刷新页面，解决刷新页面后切换模块卡在 loading 的问题。
- **后台执行超时保护**: `run_queue.py` 新增 `QUEUE_WAIT_TIMEOUT_S = 60` 常量，将信号量获取与任务执行包装为 `_acquire_and_run` 函数，外层 `asyncio.wait_for` 统一超时控制，避免任务因并发槽位满而无限期排队。
- **残留任务自动清理**: `routers.py` 模块加载时调用 `recover_stale_runs()`，服务启动后自动将上次残留的 `queued`/`running` 状态任务标记为 `failed`，防止幽灵任务阻塞新提交。
- **前端排队超时提醒**: `ExecutionContext.jsx` 轮询新增 90 秒排队超时检测，超时后 Snackbar 提示用户可能的原因和建议操作。

### 变更 (Changed)
- **前端错误边界粒度**: `App.jsx` 的 `ErrorBoundary` 从包裹所有 Tab 改为每个 Tab 独立包裹，一个模块崩溃不再影响其他模块的正常使用。
- **阶段标题去除吸顶**: `StageHeader.jsx` 移除 `position: sticky`、`top: 0`、`zIndex: 8` 和 `backdropFilter`，阶段标题改为跟随正常文档流滚动。
- **后台执行信号量管理**: `run_queue.py` 将 `_execute_run` 拆分为外层超时控制 + 内层 `_acquire_and_run`（保留原始 `async with _semaphore` 模式），避免手动 acquire/release 导致的信号量泄漏风险。

### 修复 (Fixed)
- **执行成功仍显示排队中**: 修复 `ExecutionContext.jsx` 中 `runAllSteps` 调用 `getRun` 后未同步更新 `backgroundRunStatus` 的 bug——当任务执行极快（如 6ms）时，`runReport.status` 已为 `passed` 但 Alert 仍显示 `排队中`。
- **模块加载卡死**: 修复刷新页面后切换到其他模块时，`React.lazy()` 加载失败导致 `Suspense` 永久显示 loading 的问题，通过 `lazyWithRetry` 自动重试和 per-tab `ErrorBoundary` 双重保障。

---

## [0.2.7] - 2026-05-09

*(前端架构优化 & 项目/环境配置迁移至设置页 & 主题色板统一 & Context 拆分 & 跨组件通信标准化 & CI/CD 流水线 & 前端性能优化)*

### 新增 (Added)
- **设置页 - 项目与环境配置**: 新增 `ProjectEnvConfigPage` 组件，将 API 自动化的项目和环境管理从向导第一步迁移至「设置 > 项目与环境」，支持项目增删改查、环境增删改查、AI 策略配置，环境编辑通过 Dialog 弹窗操作。
- **前端配置文件**: 将 `node_types.json` 复制到 `frontend/src/config/`，解除前端对 `backend/` 目录的跨目录依赖。
- **语义色板系统**: `theme/index.js` 新增 `slate`（10 阶灰度）、`accent`（12 色强调色）、`gradients`（6 预设渐变）三组语义色板，作为全项目颜色 token 基础设施。
- **APIExecution 子 Context**: 将 1154 行单体 `context.jsx` 拆分为 6 个独立子 Context（UIContext、SpecContext、ProjectEnvContext、DSLContext、ExecutionContext、RunHistoryContext），配套 `CombinedProvider` + 兼容层 `useAPIExecution()` hook，现有消费者零改动。
- **事件总线工具**: 新增 `utils/eventBus.js`，提供 `emit()` / `on()` 轻量 pub/sub 封装，替代各处裸 `window.dispatchEvent` / `window.addEventListener`；`on()` 返回取消订阅函数，简化 useEffect cleanup。
- **CI/CD 流水线**: 新增 `.github/workflows/ci.yml`（GitHub Actions）和 `.gitlab-ci.yml`（GitLab CI），四阶段流水线：Lint（ESLint + ruff）-> Test（pytest + vite build）-> Build（Docker 镜像构建推送）-> Deploy（待配置）。master/devxia 分支及 `v*` tag 自动触发镜像构建，MR 触发 Lint + Test。

### 变更 (Changed)
- **API 自动化向导**: StepImport 简化为项目/环境选择器 + AI 策略临时覆盖，"新建项目/环境" 选项引导用户前往设置页操作。
- **设置页**: SettingsPage 新增「项目与环境」section，侧边栏目录从 2 项扩展为 3 项（节点类型配置、Prompt Hub、项目与环境）。
- **常量收敛**: 提取 `GRAPH_DATA_UPDATED_EVENT` 到 `constants/events.js` 共享模块，Graph/QA/Manage 三处 feature constants 文件不再各自定义。
- **API 模块清理**: 6 个 API 模块（chat/graph/file/testCase/system/promptHub）移除未使用的 `fetchJSONWithTimeout`、`fetchBlob`、`OPENAPI_PARSE_TIMEOUT_MS` 导入。
- **确认弹窗统一**: context.jsx 和 StepScope.jsx 中 3 处 `window.confirm()` 替换为项目统一的 `ConfirmDialog` 组件。
- **流式请求错误处理**: testCaseAPI 的 `generateFromFile` 和 `generateFromContext` 从 raw `fetch()` 改为 `fetchStream` 统一客户端，新增 HTTP 错误检查。
- **环境 Dialog 增强**: ProjectEnvConfigPage 环境编辑 Dialog 新增 `enabled` 启用开关；创建首个环境时自动更新项目的 `default_environment_id`。
- **后端版本号**: `pyproject.toml` 版本从 `0.1.0` 同步为 `0.2.7`。
- **Neo4j 密码外部化**: docker-compose 中 Neo4j 密码改为 `${NEO4J_PASSWORD:-password}` 环境变量引用。
- **ESLint 配置**: 新增 `.eslintrc.json`，基于 eslint:recommended + react-hooks/recommended 规则集。
- **硬编码颜色迁移至主题色板**: 全项目约 492 处硬编码 hex/rgba/gradient 颜色迁移至 `theme.palette` 语义 token（`slate.*`、`accent.*`、`gradients.*`），涉及 52 个文件；非 MUI 组件（CodeMirror、vis-network）和 HTML 模板中的颜色保留原值。
- **Context 拆分重构**: APIExecution 单体 Context（1154 行、44 个 useState）拆分为 6 个职责单一的子 Context，通过 `CombinedProvider` 嵌套和 `useAPIExecution()` 兼容 hook 保持向后兼容；跨域协调采用 ref callback 模式（`registerResetCallback`、`registerFetchHistory`）。
- **跨组件事件通信标准化**: 3 个自定义事件常量（`GRAPH_DATA_UPDATED_EVENT`、`NODE_TYPE_OVERRIDES_UPDATED_EVENT`、`PROMPT_HUB_UPDATED_EVENT`）统一收拢至 `constants/events.js`，事件名统一加 `openmelon:` 前缀；`constants/promptHub.js` 改为 re-export；`theme/nodeTypes.js` 中的 dispatch 改为 `emit()`；7 个文件的监听改为 `on()` 返回取消函数。
- **前端包体积优化**: `TestCaseMindMap` 改为 `React.lazy` 懒加载（markmap 库 651 KB 仅在切换思维导图视图时加载）；CodeMirror 从 APIExecutionPage 拆为独立 chunk（420 KB），APIExecutionPage 体积从 507 KB 降至 87 KB（-83%）；vite `manualChunks` 新增 codemirror 分组。

### 修复 (Fixed)
- **vis-network 内存泄漏**: QAPage 和 GraphPage 的 vis-network 实例在组件卸载时未调用 `destroy()`，导致 DOM 和内存资源泄漏；添加 useEffect cleanup 函数。
- **跨目录导入**: `theme/nodeTypes.js` 直接 import `../../../backend/config/node_types.json`，前端独立部署会断裂；改为导入 `../config/node_types.json`。
- **Dockerfile 指令顺序**: 后端 Dockerfile 存在重复 CMD 且第一行 CMD 在 USER 指令之前（以 root 运行），移除重复 CMD 并确保 USER 在 CMD 之前。
- **Git 跟踪运行时数据**: 10 个 JSON 数据文件（`backend/app/data/api_execution/*.json`）为 SQLite 迁移后的遗留种子文件，已加入 `.gitignore` 并从 git 跟踪中移除。
- **静默错误吞没**: ManagePage、TestCasePage、QAPage、GraphPage、context.jsx 中 6 处空 catch 块补充 `console.error` 日志。
- **JSON 解析静默失败**: ProjectEnvConfigPage 的 3 处 JSON.parse catch 从静默替换为空对象改为 showSnackbar 提示并中止保存。
- **死代码清理**: 删除从未被引用的 `MarkMapPage.jsx`；StepImport 移除解构后未使用的 3 个 setter。

---

## [0.2.6] - 2026-05-08

*(后端结构化持久化 SQLite 收敛)*

### 变更 (Changed)
- **API 自动化存储**: `backend/app/api_execution/storage.py` 收敛为 SQLite-only 入口，移除 `OPENMELON_STORAGE_BACKEND=json` 和 SQLite 初始化失败时回退 JSONStore 的运行路径；旧 `backend/app/data/api_execution/*.json` 仅作为空库迁移源读取。
- **图谱节点类型配置**: 「设置 > 节点类型配置」从写入 `backend/config/node_types.json` 改为写入共享 SQLite `graph_node_types` 表；`node_types.json` 仅作为空库初始化种子。
- **测试存储**: `APIExecutionStore` 保留为 SQLite 兼容构造器，测试临时目录会落到临时 `api_execution.db`，不再生成 JSON 数据文件。

### 新增 (Added)
- **图谱节点类型存储**: 新增 `NodeTypeStore(BaseSQLiteStore)`，节点类型列表、创建、更新、删除均复用共享 SQLite 连接。
- **迁移执行文档**: 新增 `docs/Knowledge/backend-sqlite-persistence-completion-plan.md`，沉淀本轮全量 SQLite 收敛范围、步骤和验收口径。
- **培训汇报材料**: 新增 `docs/presentations/openmelon-training-leadership-briefing.pptx`，用于当前项目培训和领导汇报，覆盖业务闭环、架构、核心功能、安全边界、演示路径和后续规划。

### 修复 (Fixed)
- **API 自动化重试**: 修复 `_maybe_auto_rerun` 中 `current_attempt > max_reruns` 重试次数多跑一次的 off-by-one bug，改为 `>=`。
- **API 自动化知识图谱**: 修复 `write_run_to_graph_with_retry` 退避算法为线性增长（`delay * attempt`）而非指数退避的问题，改为 `delay * 2^(attempt-1)`。
- **SQLite 存储并发**: 修复 `BaseSQLiteStore._lock` 为实例级锁但连接全局共享导致多实例并发写冲突的问题，改为按 DB 路径的全局共享锁 `get_shared_lock()`。
- **SQLite 存储语义**: `_upsert` 从 `INSERT OR REPLACE`（先删后插）改为 `INSERT ... ON CONFLICT ... DO UPDATE SET`，避免有外键或触发器时的非预期行为。
- **SQLite 存储索引**: 补充 `specs.content_hash`、`specs.source_url`、`automation_runs.run_at`、`run_stage_events.created_at`、`artifact_meta.created_at` 索引，提升按条件查询和排序性能。

### 验证 (Verified)
- **SQLite-only 回归**: 新增 `backend/tests/test_api_execution_sqlite_only.py` 和 `backend/tests/test_graph_node_type_sqlite.py`，覆盖 API 自动化不再写 JSON、节点类型从 JSON 种子初始化并写入 SQLite。
- **SQLite-only 回归**: `python -m pytest tests/test_api_execution_*.py tests/test_graph_node_type_sqlite.py tests/test_file_tracker_sqlite.py tests/test_prompt_hub_tracker.py` 通过，覆盖 98 个相关用例。
- **编译检查**: `python -m compileall -q backend/app/api_execution backend/app/models backend/app/storage backend/app/services` 通过。

---

## [0.2.5] - 2026-04-30

*(API 自动化功能增强 & 存储架构升级)*

### 新增 (Added)
- **API 自动化存储**: 新增 `app/storage/sqlite_store.py` 通用 SQLite 基础设施，`BaseSQLiteStore` 提供连接管理、WAL 模式、通用查询方法，各模块子类共享同一 db 连接。
- **API 自动化存储**: 新增 `app/api_execution/sqlite_store.py` SQLite 存储后端，实现与 JSONStore 相同的公共 API，支持索引查询、无记录数限制和分页。
- **API 自动化存储**: 新增 JSON -> SQLite 自动迁移，启动时检测 `OPENMELON_STORAGE_BACKEND` 环境变量（默认 sqlite），自动将 `api_runs.json` 等文件导入 SQLite 并填充索引列。
- **通用存储**: `file_tracker.json` 迁入共享 SQLite 库，新增 `file_records` 表，导入管理仍保留原有新增、更新、删除和重建索引调用方式。
- **Prompt Hub 存储**: `prompt_hub.json` 迁入共享 SQLite 库，新增 `prompt_hub_meta`、`prompt_templates`、`prompt_skill_categories`、`prompt_skills` 表，保留模板、技能和分类 CRUD 语义。
- **API 自动化重试**: 新增步骤级失败重试（`APIRetryConfig`），支持 `max_attempts`、`delay_ms`、`backoff_factor`、`retry_on` 断言类型匹配。
- **API 自动化重试**: 新增项目级 `max_reruns` 自动重跑，失败执行自动入队新 run，`attempt` 递增，`parent_run_id` 追踪重试链。
- **API 自动化变量**: 新增 `VariableSetup` 支持 `env`（环境变量注入）、`random`（uuid/string/int/float）、`timestamp`（ISO 时间戳）、`static` 四种变量来源。
- **API 自动化变量**: `APIExtraction` 新增 `default` 字段，extraction 失败时使用默认值。
- **API 自动化执行**: 新增 DAG 步骤并行执行，`APITestStep.depends_on` 声明依赖关系，Kahn 算法拓扑排序，同层级 `asyncio.gather` 并行，循环依赖检测。
- **API 自动化进度**: 新增 SSE 进度推送 `GET /runs/{run_id}/stream`，实时推送 `progress` 和 `finished` 事件。
- **API 自动化知识图谱**: 新增 `write_run_to_graph_with_retry` 带指数退避重试，失败时自动创建 `knowledge_write_failure` 待处理任务。
- **API 自动化文档**: 新增 `docs/api-automation/API_AUTOMATION_DESIGN.md`，沉淀全部设计方案与实施状态。

### 变更 (Changed)
- **API 自动化存储**: `run_queue.py` 全链路 async 化，`enqueue_run`、`cancel_run`、`_execute_run`、`_update_progress`、`_mark_finished` 改为 async，使用 `async_update_run_atomic` 原子读-改-写修复竞态条件。
- **API 自动化存储**: 启动时 `recover_stale_runs()` 将 `queued`/`running` 状态的 run 标记为 `failed`，避免服务重启后任务卡死。
- **API 自动化断言**: 未知断言类型从 `passed=True` 改为 `passed=False`，`validate_dsl` 新增断言类型白名单校验。
- **API 自动化导入**: `parse_openapi_file` 新增 10MB 文件大小限制。
- **API 自动化策略**: `_assert_patch_auto_applicable` 改为对修复后脚本重新评估策略，而非复用原执行决策。
- **API 自动化知识**: 知识搜索 `_build_knowledge_index` 改用 `_tokenize` 去除标点，搜索和索引统一归一化。
- **API 自动化代码**: 移除 `routers.py`、`runner.py`、`knowledge.py` 中的重复函数定义，统一到 `utils.py`。
- **API 自动化代码**: 清理 API 模块无用 import、未引用辅助函数和重复 store 工厂，SQLite 子类只保留 `_init_schema()`、业务方法与迁移逻辑。
- **API 自动化日志**: JSONStore 的 `_read_*_no_lock` 方法从静默吞异常改为 `logger.warning` 记录。
- **运行期产物**: `.gitignore` 新增 `backend/app/data/*.db*`，避免 SQLite 主库和 WAL/SHM 文件进入提交。
- **通用存储迁移**: `file_tracker.json` 和 `prompt_hub.json` 改为只读迁移源；空库启动时自动导入旧 JSON 或默认 Prompt Hub 配置，正常写入不再回写 JSON。

### 修复 (Fixed)
- **API 自动化知识搜索**: 修复 `_search_local_repair_knowledge` 在 `project_id` 过滤后 inverted index 索引指向旧列表，导致返回错误结果或 IndexError 的 bug，改为评分时同步过滤。
- **API 自动化迁移**: 修复 `migrate_from_json` 只插入 `id + data` 未填充 `status`、`project_id` 等索引列，导致迁移后按条件查询返回空的问题。
- **API 自动化存储**: 修复 SQLite 默认落点分散为 `api_execution/store.db` 的问题，统一使用共享连接默认库 `backend/app/data/openmelon.db`，避免重复 DB 文件。
- **API 自动化重试**: 修复 `_run_step_with_retry` 在 `max_attempts < 1` 时返回 `None` 的类型安全问题。
- **API 自动化导出**: 修复 pytest 导出器 `read_path` 不支持括号语法（如 `items[0].name`）的问题。
- **API 自动化导出**: 修复 pytest 导出器生成脚本时的正则转义 warning。
- **API 自动化导入**: 修复未使用的 `asyncio`、`write_run_to_graph`、`APIRetryConfig` 导入。

### 验证 (Verified)
- **通用存储迁移**: `python -m pytest backend/tests/test_file_tracker_sqlite.py backend/tests/test_prompt_hub_tracker.py` 通过，覆盖导入管理记录 SQLite CRUD、旧 JSON 迁移、Prompt Hub 模板/技能/分类 CRUD 与校验语义。
- **通用存储迁移**: `python -m compileall -q backend/app/services/file_tracker.py backend/app/services/prompt_hub_tracker.py` 通过。

---

## [0.2.4] - 2026-04-28

*(API 自动化多来源导入扩展 & 覆盖率视图兼容修复)*

### 新增 (Added)
- **API 自动化**: 新增 `backend/app/api_execution/spec_parser.py` 多来源接口资产解析器，支持 OpenAPI / Swagger、Postman Collection、HAR、Apifox/ApiPost 风格请求树、Markdown/TXT/CSV、Word、Excel、HTML 与普通接口清单文本统一导入。
- **API 自动化**: 新增针对多来源解析能力的自动化测试 `backend/tests/test_api_execution_spec_parser.py`，覆盖 Postman、HAR、Markdown 接口列表、通用 JSON 请求树以及 Swagger HTML 自动发现链路。
- **API 自动化配置**: 新增项目与环境配置 MVP，支持保存常用 Base URL、Header、变量、失败策略，并在执行记录中保存环境快照。
- **API 自动化策略**: 新增项目级 AI 自动化边界配置，支持 AI 自动执行、AI 自动修复、后台定时执行开关，以及接口白名单/黑名单，为后续受控 AI 自动化提供项目策略快照。
- **覆盖率治理**: 新增 `docs/COVERAGE_BUGFIX_NOTES.md`，沉淀覆盖率视图空白、`COVERS` warning、当前统计口径与后续升级方向的专项记录。
- **覆盖率治理**: 新增 `backend/tests/test_coverage_service.py`，覆盖覆盖率回退逻辑与模块详情兼容逻辑，防止后续回归。

### 变更 (Changed)
- **API 自动化 UI**: `APIExecutionPage` 重构为“导入文档 → 选择接口 → 配置执行 → 查看结果”的四段式工作流，保留原有执行与导出能力的同时，大幅降低页面信息堆叠感。
- **API 自动化 UI**: 进一步将右侧主工作区收敛为连续式 workbench，弱化多层卡片嵌套，把接口选择、编排执行、脚本增强和结果诊断改为同一容器内的顺序分段，并将桌面分栏断点提前到 1080px，减少常见屏宽下的页面割裂感。
- **API 自动化历史执行**: 最近执行记录新增脚本载入编辑入口，支持从历史报告恢复 DSL、Base URL 与失败策略，编辑后再重新执行或只重跑失败步骤。
- **API 自动化历史执行**: 历史重跑与失败步骤重跑改为更新原执行记录，刷新执行时间、脚本内容和结果明细，不再为同一次修复追加新的失败记录。
- **API 自动化导入体验**: 页面导入区文案与文件选择范围同步扩展，不再误导用户只能上传 OpenAPI 文件，URL 提示也改为支持 OpenAPI 文档地址、Swagger `/docs` 页面与普通接口文档地址。
- **API 自动化环境配置**: 项目与环境工作台补充环境类型、环境变量 JSON、请求超时配置，并在历史执行与报告中展示环境快照，执行时自动合并环境变量参与 `{{变量名}}` 替换。
- **API 自动化历史执行**: 最近执行支持按项目筛选，并在执行记录、报告中展示项目策略快照，便于回放时知道当时的 AI 自动化边界。
- **API 自动化配置**: 前端项目/环境管理补齐删除入口，并在保存环境后同步更新项目默认环境，使页面项目环境 CRUD 与后端接口能力保持闭环。
- **API 自动化策略**: 新增执行前策略引擎，单步、批量与后台执行统一校验项目黑名单、白名单、高风险方法与生产环境写操作，策略判断会进入执行记录。
- **API 自动化报告**: 执行报告新增项目策略判断展示，可查看风险等级、已评估接口、AI 自动执行/修复开关与策略警告。
- **API 自动化 AI 补全**: 新增 DSL 校验、AI DSL 补全与 AI 修复补丁接口，支持生成结构化 patch、策略预评估和用户确认应用。
- **API 自动化 AI 修复**: 页面新增“AI 补全”和“AI 修复补丁”入口，可在执行失败后查看补丁摘要并应用到脚本，避免 AI 静默修改或越权重跑。
- **API 自动化策略引擎**: Phase 10 新增语义风险识别、敏感字段识别、项目策略限额、风险等级覆盖与策略审计记录，项目页可配置最大自动修复/重跑/请求数。
- **API 自动化审计**: 新增策略审计持久化与查询能力，执行前的允许/阻断判断会沉淀为 `policy_audits.json`，便于后续审批队列和无人值守追责。
- **API 自动化受控自动修复**: 新增低风险失败执行的自动修复重跑接口，项目策略允许时自动应用安全补丁、只重跑失败步骤并覆盖更新原执行记录。
- **API 自动化待处理队列**: 新增 `automation_tasks.json` 与待处理任务查询/完成接口，自动修复被策略阻断或重跑后仍失败时会升级为人工待处理项。
- **API 自动化报告**: 执行记录新增 `automation_summary` 与 `repair_history`，保存自动修复前后的通过/失败/耗时对比、补丁字段和风险等级。
- **API 自动化 AI 接入**: AI DSL 补全与失败修复补丁改为优先复用项目已配置的 OpenAI-compatible `API_BASE_URL` / `API_KEY` / `CHAT_MODEL`，模型不可用或返回不合规时自动回退启发式规则。
- **API 自动化无人值守**: 新增白名单项目执行触发接口，可筛选开启定时执行与 AI 自动执行的项目，按项目默认环境和接口白名单入队后台执行。
- **API 自动化文档同步**: 新增接口资产变化同步触发接口，可比较项目绑定文档 hash 并重新生成 `auto_generated_dsl`，为后续文档监听和 cron 调度打基础。
- **API 自动化知识沉淀**: 新增执行历史知识沉淀接口，可将 API run 转换为本地知识条目，并在 Neo4j 可用时写入 `Module/APIOperation/TestCase/APIRun`、`COVERS`、`FAILED_AT` 等关系。
- **API 自动化修复经验复用**: 知识沉淀现可写入 `api_execution_knowledge` 向量 chunk，AI 修复补丁生成前会优先检索相似失败/修复经验并注入模型上下文，向量不可用时回退本地 JSON 知识检索。
- **API 自动化知识质量门**: 执行完成后改为自动生成 `knowledge_ingest_candidate` 待处理项，不直接写入向量；用户确认后才沉淀到本地知识、向量库和图谱，降低错误执行污染 AI 修复知识的风险。
- **统一自动化控制面**: 新增 `AutomationDefinition`、`AutomationRun`、`RunStageEvent`、`ArtifactMeta` 抽象和 JSON Store，同步沉淀 API 执行定义、运行、阶段事件与报告制品元数据，为后续 UI 自动化共用控制面打基础。
- **覆盖率统计**: 覆盖率服务改为优先统计 `TestCase -[:COVERS]-> Feature`，当图谱中尚未建立 `COVERS` 关系时，自动回退为 `Module -[:CONTAINS]-> TestCase` 兼容口径。
- **前端架构**: 继续按 feature-based 结构重构导入管理与问答模块，新增 `features/Manage` 与 `features/QA`，将导入工作台、索引统计、筛选栏、索引表格、分页栏及问答基础常量/工具函数从页面组件中拆出。
- **问答模块重构**: 将历史会话面板与消息气泡渲染拆分为 `SessionHistoryPanel`、`MessageBubble`，让 `QAPage` 更聚焦会话数据流、问答请求和图谱联动。
- **问答图谱重构**: 将右侧图谱线索面板拆分为 `GraphInsightPanel`，统一承载图谱搜索、筛选、空态、加载态、画布和图例展示。
- **Prompt Hub 管理页重构**: 新增 `features/PromptHub`，拆出编辑弹窗、技能分类弹窗、配置表格、概览卡片、默认表单和筛选工具函数，将 `PromptHubConfigPage` 收敛为配置容器页。
- **覆盖率页面重构**: 新增 `features/Coverage`，拆出指标卡、筛选栏、环形图、排行条、模块详情行、统计/筛选/导出工具函数，将 `CoveragePage` 收敛为数据加载与页面编排容器。
- **前端剩余模块重构**: 新增 `features/NodeType`、`features/Graph`，并继续完善 `features/TestCase`，将节点类型筛选/列表/编辑弹窗、图谱工具栏/图例/详情面板、测试用例生成配置与结果操作区从页面组件中拆出。

### 修复 (Fixed)
- **API 自动化导入**: 修复 `/api/api-execution/openapi/parse-file` 与 `/parse-url` 只能识别 OpenAPI JSON/YAML 的限制，现已支持多种常见 API 文档来源统一解析为接口资产。
- **Swagger 文档导入**: 修复直接输入 `/docs` 或普通 HTML 文档页时无法识别接口资产的问题，系统现会优先自动发现 `/openapi.json`、`/swagger.json`、`/v3/api-docs`，找不到时再回退到文本抽取。
- **API 自动化执行**: 新增 Base URL 前置校验，对 `locahost` 等常见主机名拼写错误给出明确提示，避免执行后只看到底层 DNS 解析错误。
- **API 自动化配置**: 修复项目/环境下拉中“新建项目”“新建环境”使用空值导致无法稳定选择的问题。
- **API 自动化配置**: 修复运行时 Bearer Token 可能进入环境快照的问题，执行历史中的环境 Header 与变量现会对敏感字段做脱敏展示。
- **API 自动化页面**: 修复页面组件缺失默认导出与步骤状态未初始化导致进入 API 自动化 Tab 崩溃的问题。
- **API 自动化结果页**: 修复阶段 3 点击“查看执行结果”进入结果诊断页时，因结果组件缺失图标、空态组件、策略标签工具函数和后台任务处理函数引用导致前端运行时报错的问题。
- **问答会话**: 修复新建会话后未发送消息时直接编辑标题，后端因会话尚未落库而返回 `PATCH /api/sessions/{id}/rename 404` 的问题；现在重命名会自动创建空会话并保存标题。
- **API 自动化对接**: 修复后端已提供环境删除接口但前端 service 与页面入口缺失的问题。
- **API 自动化流程**: 修复生成 DSL 成功后页面仍停留在“选择执行范围”的问题，现会自动进入编排与执行步骤。
- **API 自动化安全边界**: 修复项目 AI 自动化边界只记录不生效的问题，接口黑名单、白名单和高风险方法现在会在请求发出前强制拦截。
- **覆盖率视图**: 修复图谱中只有 `Module -> TestCase` 或默认 `通用模块` 数据时，覆盖率页返回空白的问题。
- **覆盖率日志噪音**: 修复 Neo4j 在数据库不存在 `COVERS` 关系类型时持续输出 warning 的问题，查询现已改为关系匹配后基于 `type(r)` 过滤，缺失时安静返回空结果。

---

## [0.2.3] - 2026-04-27

*(上传容错与级联清理修复 & 前端布局自适应优化)*

### 修复 (Fixed)
- **导入管理**: 修复通过 UI 删除文档时，未级联删除本地物理文件（`uploads/`）与 Qdrant 向量分块碎片的问题。现已实现安全的同步清理，同时故意保留 Neo4j 关系节点以防图谱断裂。
- **文件上传**: 修复因宿主机或人为误删临时目录导致的上传失败 (`[Errno 2] No such file or directory`) 问题。通过加入每次接收上传前的动态目录检查与创建机制，大幅提升运行期容错性。
- **测试用例生成**: 修复当用例生成结果较长时，列表视图内部滚动条失效导致底部内容被外部容器裁切（Flexbox 高度塌陷）的问题。
- **导图视图**: 修复了用例思维导图（Markmap）在初次加载渲染以及在全屏模式切换时，因 DOM 尺寸未就绪导致的不居中、不自适应问题。现已引入带延迟的安全 `fit()` 重计算链路。

---

## [0.2.2] - 2026-04-24

*(Prompt & Skill Hub 阶段二完成)*

### 新增 (Added)
- **Prompt Hub**: 新增 `backend/app/data/prompt_hub.json` 作为模板与技能的持久化配置载体。
- **Prompt Hub**: 新增 `backend/app/services/prompt_hub_tracker.py`，统一负责配置读取、校验、默认回退、版本更新与 CRUD 写回。
- **Prompt Hub API**: 新增 `/api/prompt-hub/options`、`/templates`、`/skills` 读写接口，支持模板与技能管理。
- **设置中心**: Settings 页新增 Prompt Hub 管理入口，支持模板和技能的新增、编辑、删除与默认模板配置。
- **自动化测试**: 新增 `backend/tests/test_prompt_hub_tracker.py`，覆盖模板/技能 CRUD、默认回退和非法配置校验。

### 变更 (Changed)
- **测试用例生成 UI**: 生成页改为动态读取 Prompt Hub 选项，不再依赖固定静态模板/技能常量。
- **回退策略**: 当已选模板被删除或停用时，前端自动回退为默认模板；当已选技能失效时，前端自动移除失效技能并提示。
- **测试用例生成运行时**: `prompt_assembler.py` 改为优先读取 Prompt Hub 持久化配置，同时保留默认兜底能力。
- **Prompt Hub 管理页**: 新增字段级帮助文案，直接提示模板和技能的写法边界、字段含义与示例方向。
- **Prompt Hub 技能分类**: 技能分类升级为独立持久化配置，支持中文默认分类、下拉选择、自定义输入、默认分类保护与删除校验。
- **Prompt Hub 大列表布局**: 管理页改为模板/技能分栏切换，并新增搜索、分类筛选和独立滚动区域，适配配置量增长场景。
- **文档体系**: `docs/PROMPT_HUB_GUIDE.md` 内容并入 `MANUAL.md`，并同步更新演进计划与当前落地状态。

### 修复 (Fixed)
- **Prompt Hub 交互**: 修复同一应用会话内修改模板/技能后测试用例生成页不会即时同步的问题，现已通过前端事件广播即时刷新。

---

## [0.2.1] - 2026-04-24

*(测试用例生成阶段一落地)*

### 新增 (Added)
- **测试用例生成**: 新增阶段一 Prompt/Skill 运行时能力，后端支持通过 `style_id` 与 `skill_ids` 动态组装生成器 Prompt，并向评审器传递结构化风格/技能摘要。
- **测试用例生成**: 新增 `backend/app/testcase_gen/services/prompt_assembler.py`，统一维护内置模板、专项技能、配置解析、评审摘要和缓存键生成逻辑。
- **测试用例生成 UI**: 生成页新增模板选择、专项技能多选与当前生成策略展示，允许在不改默认协议的前提下切换生成风格与覆盖重点。

### 变更 (Changed)
- **测试用例生成**: `/api/test-cases/generate` 与 `/api/test-cases/generate-from-context` 改为支持透传 `style_id` 与 `skill_ids`，并在三阶段链路中完整向下游传递。
- **缓存策略**: 测试用例生成缓存键纳入 `module`、`style_id`、排序后的 `skill_ids`、`use_vector` 与配置版本，避免切换模板或技能时误命中旧缓存。
- **日志系统**: `app` 与 `testcase_generator` logger 初始化改为幂等补齐处理器，确保重复导入或重载时仍能稳定挂载 stdout 与文件 handler。
- **版本范围**: 当前仅完成 Prompt & Skill Hub 阶段一运行时能力，阶段二管理端与持久化配置暂未启动。

### 修复 (Fixed)
- **测试用例解析**: 修复生成结果解析后的步骤序号显示错乱问题，前端按最终展示顺序重新编号，避免模型输出序号跳号或重复时界面顺序异常。
- **测试用例日志**: 修复测试用例链路 logger 初始化不一致导致的请求期日志可见性问题，请求阶段日志现在会稳定写入 `openmelon.log` 并输出到终端 handler。

---

## [0.2.0] - 2026-04-22

*(会话体验优化 & 工程治理)*

### 新增 (Added)
- **UI/UX**: 顶部导航栏重设计，提取为独立的 `TopNav` 组件。采用 Material UI 的 `Tabs` 实现响应式水平滚动，增加底部分栏高亮条和更细腻的 hover 动效，彻底解决未来扩展新模块时的空间挤压问题。
- **问答会话**: 历史会话列表全面重新设计——从不可读的 UUID 横向 Chip 标签，升级为纵向可折叠列表。自动以用户首次提问作为会话标题，显示相对时间（如"3分钟前"）和消息条数。
- **问答会话**: 支持会话重命名（inline 编辑）和删除前二次确认对话框，防止误删。
- **问答会话**: 直接在输入框发送消息将自动创建新会话，无需手动先点"新建"。
- **后端接口**: 新增 `PATCH /api/sessions/:id/rename` 接口，允许前端修改会话标题。
- **导入管理**: 重新索引时，表格状态栏即时切换为旋转动画（`CircularProgress`），索引完成后自动恢复。
- **覆盖率视图**: 指标卡片新增图标和趋势标签（如"67% 健康"、"需关注"），hover 时卡片微浮动。
- **覆盖率视图**: 环形图添加发光滤镜，提升视觉层次；覆盖率排行增加排名序号和 hover 提示（显示功能数/用例数）。
- **覆盖率视图**: 表格改为 sticky header + 可滚动区域，表头字体加粗加深，支持大量模块时保持列头可见。
- **覆盖率视图**: 用例数指标卡辅助文案改为"平均每功能 X 条用例"，信息密度更高。

### 变更 (Changed)
- **项目命名统一**: 全局清理旧项目名残留（`doc-rag`、`graph_rag`、`Graph RAG System`），统一为 `OpenMelon`。涉及日志文件名（`graph_rag.log` → `openmelon.log`）、Logger 命名空间、`.env.example` 注释、`package.json` 等 8 个文件 12 处。
- **后端接口**: `/api/sessions` 接口返回值从纯 ID 列表 `["abc123"]` 升级为元数据对象列表 `[{id, title, updated_at, message_count}]`。
- **Neo4j 连接**: 默认协议锁定为 `bolt://`，适配单机本地 Docker 环境，避免 `neo4j://` 触发的集群路由获取失败。
- **Neo4j 连接**: `connect()` 方法新增 `verify_connectivity()` 实际握手验证，杜绝"假成功"日志（驱动对象创建成功但实际未连通的误导问题）。

### 修复 (Fixed)
- **导入管理**: 修复重新索引静默失败——原因为 `file_tracker.json` 中残留旧项目路径 `doc-rag/`，导致系统找不到原始上传文件。
- **导入管理**: 前端 `doReindex` 现在正确检查后端返回的 `success: false` 并展示错误信息，不再静默吞掉业务层失败。

---

## [0.1.0]

*(首个预发布内部架构版本)*

### 新增 (Added)
- **后端基建**: 在 FastAPI 路由体系内引入了基于 `app/api/deps.py` 的规范全局依赖注入机制 (Dependency Injection)。该机制统一纳管了问答大模型客户端、向量库以及Neo4j的驱动实例。
- **运行环境**: 在项目中引入 Python 现代化的 `pyproject.toml` 基础环境元数据支持，并正式生成了底层的 `uv.lock` 高速依赖锁定映射表。

### 变更 (Changed)
- **后端架构**: 对高达 1300 行且高度耦合逻辑的 `routes.py` 进行了彻底的结构解耦重构。剥离为 5 个领域专属路由：检索核心 (`query.py`)、图谱服务 (`graph.py`)、文件解析器 (`ingestion.py`)、三方通信支持 (`webhooks.py`) 和监控检查 (`system.py`)。
- **打包部署 (DevOps)**: 优化 Dockerfile 的分层规则，取消了原有执行缓慢的 `pip install` 指令，取而代之地使用了带有缓存与安全特性的严格冻结指令 `uv sync --frozen`。
- **前端性能**: 移除了全量组件的同步渲染。在主应用 `App.jsx` 中使用了原生的 `React.lazy()` 配合 `<Suspense>` 进行页面模块动态导入（懒加载），成倍降低初始网络握手传输开销。
- **前端交互**: 加入了基于记忆缓存的渲染挂载追踪器（Tracker），既降低了页面初次打开时的卡顿感，又完美维持了每个后台 Tab 中的查询结果信息不被销毁。

### 移除 (Removed)
- **运行环境**: 移除了不可用且易发生依赖包水土不服的 `requirements.txt`。
