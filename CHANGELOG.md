# 变更日志 (Changelog)

本项目的所有重要更改都将统一记录在此文件中。

格式编写基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 的指导规范，
同时本项目的版本号遵循 [语义化版本管理 (Semantic Versioning)](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

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
