# 变更日志 (Changelog)

本项目的所有重要更改都将统一记录在此文件中。

格式编写基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 的指导规范，
同时本项目的版本号遵循 [语义化版本管理 (Semantic Versioning)](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

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
