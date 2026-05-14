# 变更日志 (Changelog)

本项目的所有重要更改都将统一记录在此文件中。

格式编写基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 的指导规范，
同时本项目的版本号遵循 [语义化版本管理 (Semantic Versioning)](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

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
