<p align="center">
  <img src="docs/screenshots/OpenMelon_log.png" alt="OpenMelon" width="680" />
</p>

<p align="center">
  后端基于 FastAPI + Neo4j，前端基于 React + Material UI，使用 vis.js 渲染图谱，支持多种 LLM Provider 一键切换。
</p>

---

## 核心特性

- **多通道智能问答 (Agentic RAG)**：LLM 自动识别用户问题意图（图谱/向量/混合/可视化），支持自动改写查询、评估答案充分性的多步推理，搭配 BGE 重排序 (Reranker) 提升精度，所有回答均标注精确引用。
- **多智能体测试用例生成**：基于 AutoGen 的三阶段流水线（需求分析、用例生成、用例评审），支持 Prompt Hub 动态配置模板与技能，生成结果双写落盘至图谱和向量库，支持导出 Excel/XMind。
- **全链路 API 自动化**：IDE 级三栏式工作台，支持接口编排拖拽排序、变量跨步骤注入、AI 修复补丁、执行历史批量管理（勾选删除/一键清空全部）及执行经验知识沉淀。
- **动态图谱可视化**：vis.js 实时渲染，支持拖拽、缩放、节点高亮，支持多维筛选和 2 度关系子图探索。
- **全链路数据仪表盘**：涵盖图谱覆盖率、API 自动化健康度及 UI 自动化（规划中）的多维度可视化聚合看板，快速定位高风险功能。
- **全格式文档解析与管理**：支持 16 种文件格式的解析（PDF/Word/Markdown/XMind 等），提供异步上传、文件追踪、重新索引及批量管理。
- **灵活的部署与配置**：支持 OpenAI / Qwen / DeepSeek / Mimo 等多 Provider；运行时产物统一存放在 backend/runtime/，支持 OPENMELON_DATA_DIR 自定义挂载；原生支持企业级通知 Webhook。

---

## 系统架构

<p align="center">
  <img src="docs/screenshots/system-architecture.png" alt="系统架构" />
</p>

---

## 快速开始

### 1. 前置准备
```bash
git clone <repository-url>
cd OpenMelon

# 配置环境变量
cp .env.example .env
# 必须编辑 .env 填写以下两项：
# LLM_PROVIDER=qwen
# API_KEY=你的大模型密钥
```
> 默认不提供 Embedding 的模型（如 DeepSeek）需额外配置 Embedding 参数，详见 [.env.example](.env.example)。

### 2. 启动服务（两种方式任选）

#### 方式 A：Docker 一键启动（推荐完整体验）
```bash
docker compose up -d --build
```

该命令会构建并启动前端、主后端、Reranker Sidecar、Neo4j 和 Qdrant。首次构建 Reranker 镜像会下载 `torch`、`FlagEmbedding` 等重依赖，耗时较长；后续会复用 Docker/uv 缓存。

#### 方式 B：本机开发模式（推荐前端或快速调试）
```bash
# 启动依赖服务
# 如只调试主后端，可只启动 neo4j qdrant；Reranker 可在 .env 中关闭或改为 local
docker compose up -d neo4j qdrant

# 启动后端
cd backend
uv sync
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 启动前端（新开终端）
cd frontend
npm install
npm run dev
```

本机模式默认前端地址为 `http://localhost:3000`；Docker 一键启动默认前端地址为 `http://localhost`。

### 3. 访问系统
- **前端页面**: [http://localhost:3000](http://localhost:3000)
- **API 文档**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Neo4j 数据库**: [http://localhost:7474](http://localhost:7474)

---

## 使用指南

第一次进入系统，建议按以下顺序体验整个闭环：

| 体验顺序 | 对应页面 | 操作说明 |
|:---:|---|---|
| **1** | **导入管理** | 上传一份需求文档/代码架构图/接口规范，等待状态变为“已索引” |
| **2** | **图谱总览** | 查看系统刚为你自动抽取生成的实体与关系图谱 |
| **3** | **问答** | 针对上传的文档直接提问，体验 Agentic RAG 的多步推理与精准引用 |
| **4** | **测试用例生成** | 体验一键将文档或业务模块转换为测试用例，落盘存证并导出 Excel |
| **5** | **API 自动化** | 将用例转化为 API DSL，支持 AI 一键生成编排、自动修复并沉淀可信执行经验 |
| **6** | **数据仪表盘** | 查看全链路覆盖率、哪些模块缺少用例以及自动化的健康度 |

### 界面概览

<details>
<summary>点击展开查看各页面截图</summary>

- **问答**：![问答页面](docs/screenshots/qa-page.png)
- **图谱总览**：![图谱总览页面](docs/screenshots/graph-page.png)
- **导入管理**：![导入管理页面](docs/screenshots/manage-page.png)
- **测试用例生成**：![测试用例生成页面](docs/screenshots/testcase-page.png)
- **API 自动化**：![API 自动化页面](docs/screenshots/api-execution-page.png)
- **设置 - 节点类型配置**：![节点类型配置](docs/screenshots/node-page.png)
- **设置 - 项目与环境**：![项目与环境](docs/screenshots/project-env-page.png)
- **设置 - Prompt Hub**：![Prompt Hub 页面](docs/screenshots/prompt-hub-page.png)
</details>

---

## 支持的 LLM Provider

| Provider | `.env` 值 | 默认 Chat 模型 | 默认 Embedding 模型 |
|----------|-----------|---------------|-------------------|
| 公司网关 | `openai_compat` | qwen-plus | text-embedding-v3 |
| OpenAI | `openai` | gpt-4o-mini | text-embedding-3-small |
| 通义千问 | `qwen` | qwen-plus | text-embedding-v3 |
| DeepSeek | `deepseek` | deepseek-chat | — |
| Mimo | `mimo` | mimo-v2-flash | — |

---

## 核心代码结构

```text
OpenMelon/
├── backend/app/
│   ├── api/                 # 通用 FastAPI 路由（问答、图谱、导入、日志等）
│   ├── api_execution/       # API 自动化模块（接口解析、DSL、编排执行、策略、AI 修复、知识沉淀）
│   │   ├── routes/          # 各子模块路由（runs、specs、projects、knowledge、templates 等）
│   │   ├── services/        # 业务服务（run_service、spec_service、knowledge_service 等）
│   │   └── sqlite_store.py  # 模块专属 SQLite 存储层
│   ├── engine/              # RAG 核心编排层（意图路由、多路召回、Rerank）
│   ├── storage/             # 存储底座（共享 SQLite、Neo4j 知识图谱与 Qdrant 向量库）
│   ├── services/            # 业务逻辑（文档解析、覆盖率计算、会话管理、企业 Webhook 等）
│   ├── testcase_gen/        # 基于 AutoGen 的多智能体测试用例生成模块
│   └── runtime_paths.py     # 集中管理所有运行时产物路径，支持 OPENMELON_DATA_DIR 环境变量
├── backend/runtime/         # 运行时产物（数据库、日志、上传文件等，不提交 git）
│   ├── data/openmelon.db    # SQLite 主库（执行历史、项目、知识、Prompt Hub 等所有结构化数据）
│   ├── data/uploads/        # 用户上传的原始文件
│   └── logs/                # 应用日志
├── frontend/src/
│   ├── pages/               # 页面组件（QA、Graph、Manage、TestCase、APIExecution、Dashboard、Settings）
│   ├── features/            # 功能模块（APIExecution、APIExecutionFlow、Graph、QA、PromptHub 等）
│   ├── api/                 # 前端 API 客户端（execution.js、client.js 等）
│   └── components/          # 通用 UI 组件
├── docs/                    # 项目补充文档及截图资源
├── deploy/                  # 部署配置（Nginx、Docker 相关）
├── scripts/                 # 运维脚本
└── docker-compose.yml       # 容器编排文件
```

后端所有的运行时产物（数据库、日志、导出文件、上传文件）统一存放在 `backend/runtime/` 目录下，并支持通过 `OPENMELON_DATA_DIR` 环境变量配置存放路径，彻底将运行时数据与源码分离。Neo4j 与 Qdrant 数据仍使用各自独立的挂载卷。

---

## 文档导航

想要深入了解系统？请查阅以下进阶文档：

| 文档 | 适用对象 | 核心内容 |
|------|---------|---------|
| **[MANUAL.md](MANUAL.md)** | 开发者、运维 | 完整操作手册：架构详解、环境配置、API 参考、运维排查与 Prompt Hub 指南 |
| **[CHANGELOG.md](CHANGELOG.md)** | 开发者 | 项目版本的变更记录与架构优化历史归档 |
| **[docs/Knowledge/FRONTEND_DEPLOYMENT.md](docs/Knowledge/FRONTEND_DEPLOYMENT.md)** | 运维 | 前端独立部署 Nginx 配置示例与环境变量说明 |
| **[docs/Knowledge/OPERATION_INTRO_GUIDE.md](docs/Knowledge/OPERATION_INTRO_GUIDE.md)** | 新用户、测试、产品 | 页面入口、操作路径和常见使用流程 |
| **[docs/Knowledge/PROMPT_HUB_GUIDE.md](docs/Knowledge/PROMPT_HUB_GUIDE.md)** | 测试、管理员 | Prompt Hub 模板、技能和分类管理说明 |
| **[docs/planning/UI_EXECUTION_PLAN.md](docs/planning/UI_EXECUTION_PLAN.md)** | 开发者、测试负责人 | UI 自动化执行能力规划与落地路径 |
