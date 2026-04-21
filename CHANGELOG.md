# 变更日志 (Changelog)

本项目的所有重要更改都将统一记录在此文件中。

格式编写基于 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.0.0/) 的指导规范，
同时本项目的版本号遵循 [语义化版本管理 (Semantic Versioning)](https://semver.org/lang/zh-CN/spec/v2.0.0.html)。

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
