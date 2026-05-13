# 变更日志 (Changelog)

本项目的所有重要更改都将统一记录在此文件中。

格式编写基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 的指导规范，
同时本项目的版本号遵循 [语义化版本管理 (Semantic Versioning)](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

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
- **统一分页协议回归**: `python -m compileall backend/app/api_execution backend/app/api/routers/logs.py`、API Execution 相关 pytest 与 `npm --prefix frontend run lint` 通过。
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

### 新增 (Added)
- **API 流程模板复制/另存**: 模板弹窗新增复制模板和另存为新模板能力，保存/另存后会同步模板来源到当前 DSL，便于后续执行进入模板维度统计。
- **API 执行模板维度统计**: API 执行概览新增流程模板执行表现表格，按模板聚合执行数、通过率、失败率、失败数、平均耗时和最近执行时间。
- **API 流程图缩放平移**: 流程图视图新增缩放、重置和拖拽平移能力，节点点击继续联动步骤选择。
- **失败后 AI 修复建议**: API 自动化执行失败后自动生成 AI 修复补丁建议，仍需用户确认后手动应用，避免静默修改脚本。
- **API 流程 P2 草稿生成**: 新增 `POST /api/api-execution/ai/flow-draft`，支持基于业务目标和 OpenAPI operations 生成流程 DSL 草稿。
- **AI 流程草稿预览**: API 自动化步骤 2 新增业务目标输入和 AI 草稿预览弹窗，展示步骤链路、依赖、变量提取、断言数量和不确定项，用户确认后才应用到工作台。
- **API 流程变量链路增强**: AI 流程草稿可注册多个资源 ID，自动串联 token、path/query/body/header 中的变量引用，并在预览中展示变量引用位置。
- **API 流程断言推荐**: AI 流程草稿基于响应状态码和响应 schema 自动推荐 `status_code_in`、`json_path_exists` 与 `response_time_lt` 基础断言，并在预览中展示摘要。
- **API 流程模板智能推荐**: AI 流程草稿接口返回 `template_recommendations`，按业务目标、模板名称/说明/标签和步骤数推荐可复用流程模板。
- **API 编排质量评分**: AI 流程草稿新增 `quality_score`，从变量、鉴权、断言、高风险操作和待确认项评估草稿可用度，并在预览弹窗展示。
- **推荐模板套用/合并**: AI 流程草稿预览中的推荐模板支持“套用”和“合并片段”，合并时会重排模板步骤 ID 并继续要求人工确认。
- **失败诊断修复草稿**: AI 修复补丁响应新增 `repair_draft`，失败后可预览修复后的流程草稿、变更步骤和质量评分，再人工确认应用。
- **API Flow 验收资产**: 新增 `docs/samples/api-flow-demo-openapi.json` 和 `docs/Knowledge/api-flow-orchestration-acceptance.md`，用于真实场景验收登录、创建订单、查询订单和失败修复链路。
- **API 流程编排 P2 文档**: 新增 `docs/Knowledge/api-flow-orchestration-p2-plan.md`，沉淀 P2 优先级、接口约定、已完成范围和后续增强项。

### 变更 (Changed)
- **API 流程模板来源追踪**: `APITestCaseDsl` 新增 `flow_template_id`、`flow_template_name`、`flow_template_tags`，流程模板保存接口会写回模板来源，执行参数会携带模板来源用于概览聚合。
- **API 自动化 AI 入口命名**: API 自动化第 3 步的 AI 按钮从“AI 补全”调整为“AI 编排建议”，与流程编排语义保持一致。
- **API 流程编排路线图更新**: `docs/Knowledge/api-flow-orchestration-mvp-plan.md` 标记 P1 收口完成，并补充模板复制/另存、流程图缩放平移和失败后 AI 建议说明。
- **API 执行概览计划更新**: `docs/Knowledge/api-execution-dashboard-plan.md` 补充模板维度通过率/失败率统计口径。
- **AI 流程草稿安全边界**: AI 草稿只进入预览，不自动执行、不静默覆盖当前 DSL；应用后进入步骤 3 编排工作台继续人工确认。
- **失败诊断分类增强**: 变量引用或变量替换失败会归类为 `variable_reference_missing`，422 参数校验建议补充检查 body/path/query 中的 `{{变量}}` 与前置 extraction。
- **AI 草稿预览 UI 打磨**: 草稿/修复草稿预览改为折叠分区展示，变量链路从密集 chips 调整为“提取来源 / 引用位置”分组。
- **结果页修复草稿入口补齐**: API 自动化步骤 4 的“AI 修复补丁”会携带当前执行报告生成修复建议；当响应只有 `repair_draft`、没有可直接应用的 `patch_operations` 时，也会展示“预览修复草稿”，避免修复建议被隐藏。
- **流程健康检查增强**: API 流程编排工作台新增依赖顺序、循环依赖、自依赖、后置变量引用、重复变量提取和变量来源冲突提示，拖拽排序后能更早暴露流程风险。
- **修复草稿对比视图**: AI 修复草稿预览新增字段级修复对比，展示调整前、调整后、原因和低风险标记；无自动补丁时明确提示需人工检查环境、数据或鉴权。
- **修复建议分级诊断台**: AI 修复草稿新增 `repair_suggestion_groups`，将建议拆为低风险可应用、需要人工确认、只作为排查建议三类，前端预览按三栏诊断台展示。
- **低风险修复独立应用**: AI 修复草稿预览新增“仅应用低风险项”，只将 `low_risk_apply` 对应字段写回当前 DSL，保留完整草稿应用给人工确认场景。
- **阶段 C/D/E 计划打标**: `docs/Knowledge/api-flow-orchestration-p2-plan.md` 新增阶段 C/D/E 任务清单，已完成项用 `[x]` 标记，后续增强项保留 `[ ]` 追踪。
- **AI 修复应用确认与来源标记**: 应用低风险项、完整修复草稿或直接补丁前会展示字段清单确认；应用后 DSL 写入 `ai_repair_source` 等来源信息，编排工作台提示用户确认后再执行。
- **执行概览诊断台联动**: API 执行概览失败记录抽屉新增修复建议分级摘要和“打开修复诊断台”入口，跳转 API 自动化后自动载入 run 并聚焦修复草稿预览。
- **阶段 D 受控修复重跑**: 修复草稿诊断台新增“应用低风险并受控重跑”，会只写入低风险补丁并重跑失败步骤，后端将修复前后通过/失败变化和修改字段固化到执行报告。
- **受控重跑策略收口**: 低风险修复重跑前展示 AI 修复策略、最大修复次数、已修复次数和本次重跑步骤；达到项目修复次数上限时阻止重跑，并优先只重跑受影响失败步骤。
- **修复经验手动沉淀**: 运行结果页新增“修复经验沉淀”入口，受控修复后可生成知识候选并由用户确认写入知识库、向量库和图谱，不做静默沉淀。
- **阶段 E 知识沉淀基础闭环**: 新增 `POST /api/api-execution/knowledge/runs/{run_id}/candidate`，支持按执行记录生成知识沉淀候选，并避免已确认候选被重复改回待处理。
- **相似失败历史方案召回**: AI 修复草稿会展示相似失败召回出的历史已验证修复方案，并按历史修复效果评分排序。
- **AI 多方案修复**: 修复诊断台新增低风险直接应用、保守人工确认、激进调整排查三类方案，用户仍需手动选择和确认。
- **修复效果评分**: 修复草稿和受控修复重跑报告新增 `repair_effect_score`，综合低风险项、需确认项、历史验证方案和重跑结果评估修复可信度。
- **模板推荐历史表现加权**: AI 流程草稿模板推荐开始结合模板历史执行次数、通过率和失败率，并在推荐卡片展示历史表现理由。
- **Demo OpenAPI 一键加载**: API 自动化步骤 1 新增“加载 Demo 资产”，可以直接载入验收样例 OpenAPI，不再手工上传文件。
- **Demo Project 一键初始化**: API 自动化步骤 1 新增“初始化 Demo 项目”，自动创建 Demo 项目、环境、执行样例、失败诊断样例和知识样本。
- **项目优化路线图**: 新增 `docs/Knowledge/openmelon-project-optimization-roadmap.md`，把整体项目优化项分成 P0-P3，便于后续逐项落地和回归。
- **项目优化执行顺序调整**: Playwright/UI smoke 后置到 UI 验收阶段，当前优先继续沉淀验收脚本、任务中心和知识治理能力。
- **任务中心轻量聚合接口**: 新增 `GET /api/api-execution/automation/task-center/summary`，按项目聚合待处理任务状态、风险、任务类型、处理队列和最近任务，为后续任务中心页面提供只读数据契约。
- **发版验收 Smoke 脚本**: 新增 `docs/Knowledge/release-acceptance-smoke.md`，沉淀 Demo 初始化、执行概览、任务中心聚合、后端 pytest、前端 lint/build 和人工页面验收步骤。
- **P1 治理与追踪计划**: 新增 `docs/Knowledge/openmelon-project-p1-governance-plan.md`，沉淀任务中心、知识治理、模板治理和验收标准。
- **知识治理接口**: 新增 `GET /api/api-execution/knowledge/review` 与 `PATCH /api/api-execution/knowledge/items/{knowledge_id}/status`，支持已沉淀知识按项目、类型、状态审核，并可标记失效、撤回或恢复有效。
- **设置页治理中心**: 设置页新增“治理中心”，集中处理知识治理、任务中心、模板治理和数据资产状态；API 自动化页底部收敛为执行历史，并提供治理中心跳转入口。
- **设置页日志中心**: 设置页新增“日志中心”只读视图，聚合 API 执行记录、策略审计、自动化任务和知识状态事件，支持项目、模块、等级、关键词筛选和详情抽屉。
- **日志中心分页**: 日志中心支持过滤后分页展示、每页条数切换和当前页统计，并将聚合加载范围提升到最近更多事件。
- **日志中心诊断增强**: 日志中心新增时间范围筛选、Error/Warning/API 失败/待处理任务统计，以及按 run/task/knowledge/project 关联的相关事件抽屉。
- **统一日志接口计划**: 新增 `docs/Knowledge/unified-log-interface-plan.md`，明确统一日志表、查询接口、统计接口、关联事件接口、写入规范和前端迁移路径。
- **统一业务事件日志接口**: 新增 `event_logs` 存储与 `GET /api/logs/events`、`GET /api/logs/summary`、`GET /api/logs/events/{event_id}/related`，支持分页、等级、模块、项目、关键词、trace 和时间范围查询。
- **统一日志写入服务**: 新增 `log_event(...)` 业务事件写入 helper，API 执行、策略审计、自动化任务和知识沉淀状态变化开始写入统一事件日志。
- **全项目核心日志写入补齐**: 测试用例生成、向量入库、文档索引/上传、异步上传任务、RAG 查询、图谱节点类型治理、Prompt Hub 配置变更、文件管理删除/重建索引、企业 webhook 和 API 自动化 AI 助手接入统一业务事件日志。
- **P0/P1 收口与变更分批归档**: 新增 `docs/Knowledge/openmelon-p0-p1-closeout.md` 与 `docs/Knowledge/openmelon-0.2.8.2-change-batches.md`，明确 P0/P1 已收口、P2 暂不扩大，并将当前脏工作区按功能域拆成 5 个可独立验收批次。
- **模板治理元信息**: 流程模板列表补充 `version`、`deprecated`、`scope` 和 `performance_snapshot`，用于展示模板版本、废弃状态、适用范围和历史执行表现。

### 验证 (Verified)
- **API 流程 P1 收口回归**: `uv run pytest backend/tests/test_api_execution_dashboard.py backend/tests/test_api_execution_project_environment.py`、`npm run lint` 与 `npm run build` 通过，确认模板维度统计、模板复制/另存、流程图缩放平移和失败后 AI 修复建议可正常构建。
- **API 流程 P2 草稿回归**: `uv run pytest backend/tests/test_api_execution_flow_draft.py backend/tests/test_api_execution_dashboard.py backend/tests/test_api_execution_project_environment.py`、`npm run lint` 与 `npm run build` 通过。
- **API 流程变量链路回归**: `backend/tests/test_api_execution_flow_draft.py` 新增多资源 ID 与 body/path 变量引用覆盖。
- **API 流程 P2 剩余项回归**: `backend/tests/test_api_execution_flow_draft.py` 覆盖断言推荐与模板推荐，`backend/tests/test_api_execution_diagnostics.py` 覆盖变量引用失败分类。
- **API 流程 P2.1 深化回归**: `backend/tests/test_api_execution_flow_draft.py` 覆盖编排质量评分返回结构，`npm run lint` 与 `npm run build` 验证模板套用/合并入口可正常打包。
- **失败诊断修复草稿回归**: `backend/tests/test_api_execution_ai_assistant.py` 覆盖 `repair_draft`、变更步骤标记和无自动补丁时的人工确认提示。
- **API Flow 验收打磨回归**: `npm run lint` 与 `npm run build` 通过，确认草稿预览折叠分区和验收资产不影响前端构建。
- **API Flow 页面验收**: 通过 demo OpenAPI 跑通导入、AI 草稿生成、草稿应用、流程图查看、完整执行失败诊断链路，并补齐步骤 4 修复草稿预览入口。
- **任务中心聚合回归**: `uv run pytest backend/tests/test_api_execution_dashboard.py backend/tests/test_api_execution_project_environment.py backend/tests/test_api_execution_knowledge.py`、`npm run lint` 与 `npm run build` 通过。
- **P0 验收脚本沉淀**: `docs/Knowledge/openmelon-project-optimization-roadmap.md` 已将“验收脚本沉淀到 docs/Knowledge”标记完成。
- **P1 治理与追踪回归**: `uv run pytest backend/tests/test_api_execution_knowledge.py backend/tests/test_api_execution_dashboard.py backend/tests/test_api_execution_project_environment.py`、`npm run lint` 与 `npm run build` 通过。
- **治理/日志中心迁移回归**: 设置页新增治理中心和日志中心后，`npm run lint`、`npm run build` 与 API 执行相关后端 pytest 通过。
- **统一日志接口回归**: `uv run pytest backend/tests/test_event_logs.py backend/tests/test_api_execution_project_environment.py backend/tests/test_api_execution_knowledge.py`、`npm run lint` 与 `npm run build` 通过。
- **全项目日志写入回归**: `uv run pytest backend/tests/test_event_logs.py backend/tests/test_api_execution_project_environment.py backend/tests/test_api_execution_knowledge.py backend/tests/test_api_execution_dashboard.py backend/tests/test_prompt_hub_tracker.py backend/tests/test_graph_node_type_sqlite.py backend/tests/test_api_execution_ai_assistant.py backend/tests/test_api_execution_flow_draft.py`、`npm run lint` 与 `npm run build` 通过。

---

## [0.2.8.1] - 2026-05-11

### 新增 (Added)
- **Reranker Sidecar 服务**: 新增 `app.reranker_service:app` 轻量 FastAPI 服务，提供 `/health` 与 `/rerank` 接口，用于将本地 BGE/FlagEmbedding 重排能力从主后端拆出为独立 sidecar。
- **API 执行概览仪表盘**: 「数据仪表盘」新增 API 执行概览，基于真实 API 自动化执行历史展示执行总数、通过率、失败数、待处理项、平均耗时、状态分布、失败原因 Top 5、失败步骤 Top 5 和最近执行记录。
- **API 执行概览后端接口**: 新增 `GET /api/api-execution/dashboard/summary` 只读聚合接口，复用 SQLite 中的 `runs` 与 `automation_tasks` 数据，支持按项目过滤和 `limit` 限制，不新增数据表。
- **执行详情/失败诊断抽屉**: API 执行概览中的最近执行记录支持打开右侧抽屉；通过记录显示执行详情，失败记录显示诊断信息，排队/执行中记录显示进度语义，取消记录显示中断原因。
- **API 自动化联动入口**: 执行详情抽屉新增「跳转 API 自动化」入口，通过 `sessionStorage` 携带 `run_id`，切换到 API 自动化页后自动载入对应脚本与执行报告。
- **实现计划文档**: 新增 `docs/Knowledge/api-execution-dashboard-plan.md`，沉淀 API 执行概览仪表盘、失败诊断入口、接口约定、测试清单与后续增强方向。
- **API 流程编排工作台**: API 自动化第 3 步新增列表式流程编排工作台，支持步骤选择、上移/下移排序、步骤配置、变量流转摘要和高级 DSL JSON 折叠编辑。
- **API 流程编排 P0 增强**: 流程编排工作台新增未保存切换提醒、步骤启用/禁用、执行结果状态回填、变量 chip 插入，以及断言/变量提取快速编辑表单。
- **API 流程编排 P0 收尾**: 流程编排工作台补齐执行前未保存确认、变量插入目标选择、失败重试快速编辑表单，以及断言 expected 类型归一化。
- **API 流程图视图**: 流程编排工作台新增只读流程图视图，支持“列表 / 图”切换，展示步骤顺序、显式依赖和变量传递关系。
- **API 流程模板**: 新增流程模板保存/载入能力，编排工作台可将当前 DSL 保存为模板，并从模板列表载入复用。
- **API 流程模板接口**: 新增 `GET/POST/DELETE /api/api-execution/flow-templates`，复用 `automation_definitions` 存储并通过 `definition_type=flow_template` 区分模板记录。
- **API 流程模板管理增强**: 模板弹窗新增关键词搜索、标签筛选、编辑元信息和用当前 DSL 覆盖保存模板。
- **API 流程拖拽排序**: 流程步骤列表新增基于 `@dnd-kit` 的拖拽排序，保留上/下移按钮作为精确操作。
- **API 流程编排文档**: 新增 `docs/Knowledge/api-flow-orchestration-mvp-plan.md`，沉淀流程编排 MVP 的范围、交互、校验规则、验收清单与后续增强方向。

### 变更 (Changed)
- **Reranker 依赖拆分**: `FlagEmbedding` 与 `sentence-transformers` 从默认后端依赖移至 `reranker` optional extra；主后端镜像默认不再安装 Torch/Transformers 等重依赖，显著降低普通 Docker build 成本。
- **Reranker 后端可配置**: 新增 `RERANKER_BACKEND`、`RERANKER_URL`、`RERANKER_TIMEOUT_SECONDS` 配置，支持 `local`、`sidecar`、`disabled` 三种模式；sidecar 不可用时自动降级为原始向量检索顺序。
- **Docker 一键启动**: `docker-compose.yml` 去除 `app`、`web`、`reranker` 的 profile 限制，完整服务栈可直接通过 `docker compose up -d --build` 构建并启动；如仅需基础依赖，可继续显式执行 `docker compose up -d neo4j qdrant`。
- **Qdrant 健康检查**: 修复 `qdrant/qdrant:latest` 镜像内无 `wget` 导致健康检查误判 unhealthy 的问题，改为基于 bash TCP 探测 `6333` 端口。
- **文档目录归档**: 将前端部署、操作介绍、Prompt Hub 和 UI 执行计划文档迁移至 `docs/Knowledge/` 与 `docs/planning/`，让根级 docs 目录按知识文档、规划文档和截图资源分层。
- **CI 配置暂时下线**: 暂时移除 GitHub Actions 配置 `.github/workflows/ci.yml` 和 GitLab CI 配置 `.gitlab-ci.yml`，避免远端仓库展示和文档导航混杂；后续如需恢复自动化检查，可从历史提交中恢复对应配置。
- **API 自动化与仪表盘联动增强**: API 自动化执行、取消、后台运行和失败步骤重跑后会触发仪表盘刷新事件；API 执行概览可作为 API 自动化执行历史的观察面板，而不是静态占位页。
- **API 执行记录入口统一**: 最近执行记录从“仅失败可诊断”升级为所有状态均可查看详情，操作文案按状态区分为「详情 / 诊断 / 进度 / 原因」。
- **API 自动化编排体验升级**: `StepOrchestrate` 从断言/运行参数/JSON 编辑堆叠界面调整为流程工作台容器，保留原执行、AI 补全、导出和高级 JSON 编辑能力。
- **API 流程禁用步骤策略**: 禁用步骤仅作为前端执行前过滤能力，不写入 `APITestStep` schema，避免污染后端 DSL 与历史记录结构。
- **API 流程拖拽依赖策略**: 拖拽排序只调整 DSL `steps` 顺序，不自动改写 `depends_on`，依赖顺序异常继续由工作台 warning 提醒。
- **API 流程编排组件拆分**: 将 1200 行级别的 `FlowWorkbench` 拆分为运行配置、步骤列表、变量面板、步骤编辑器、流程图、模板弹窗、高级 JSON 和工具函数模块，降低后续维护成本。
- **API 流程编排路线图完善**: `docs/Knowledge/api-flow-orchestration-mvp-plan.md` 从 MVP 计划扩展为分阶段路线图，补充 P0、只读流程图与 P1 模板完成情况、后续 backlog、模板接口、校验规则、验收清单和风险约束。

### 验证 (Verified)
- **API 执行概览聚合测试**: 新增 `backend/tests/test_api_execution_dashboard.py`，覆盖混合状态统计、项目过滤、空历史、失败原因 TopN 与失败步骤 TopN 聚合。
- **API 执行概览回归**: `uv run pytest tests/test_api_execution_dashboard.py` 通过，`npm run build` 通过。
- **前端工程规范回归**: 新增 `.eslintignore` 排除 `dist/` 构建产物，`npm run lint` 与 `npm run build` 均通过。
- **API 流程编排回归**: `npm run lint` 与 `npm run build` 通过，确认流程编排工作台新增组件符合当前前端 lint 与打包要求。
- **API 流程编排 P0 回归**: `npm run lint` 通过，确认 P0 收尾交互符合当前前端 ESLint 规则。
- **API 流程图回归**: `npm run lint` 与 `npm run build` 通过，确认只读流程图视图不影响前端打包。
- **API 流程模板回归**: `uv run pytest tests/test_api_execution_project_environment.py tests/test_api_execution_dashboard.py`、`npm run lint` 与 `npm run build` 通过。
- **API 流程拖拽排序回归**: `npm run lint` 与 `npm run build` 通过，确认 `@dnd-kit` 拖拽排序可正常打包。
- **API 流程组件拆分回归**: `npm run lint` 与 `npm run build` 通过，确认拆分后编排工作台仍可正常打包。
- **API 流程模板管理回归**: `npm run lint` 与 `npm run build` 通过，确认模板搜索筛选和覆盖保存入口可正常打包。

---

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
