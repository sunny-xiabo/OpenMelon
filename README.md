<p align="center">
  <img src="docs/screenshots/OpenMelon_log.png" alt="OpenMelon" width="680" />
</p>

<p align="center">
  后端基于 FastAPI + Neo4j，前端基于 React + Material UI，使用 vis.js 渲染图谱，支持多种 LLM Provider 一键切换。
</p>

---

## 核心特性

- **多通道智能问答 (Agentic RAG)**：LLM 自动识别用户问题意图（图谱/向量/混合/可视化），支持自动改写查询、评估答案充分性的多步推理，搭配 BGE 重排序 (Reranker) 提升精度；向量检索与 PostgreSQL pg_trgm 关键词检索并行执行，通过 RRF 融合排序，对精确术语（API 名称、错误码、方法名）召回率显著提升；所有回答均标注精确引用并支持点击溯源高亮图谱节点；支持图片附件多模态查询、回答复制/重试/点赞踩反馈。
- **多智能体测试用例生成**：基于 AutoGen 的三阶段流水线（需求分析、用例生成、用例评审），支持 Prompt Hub 动态配置模板与技能；生成结果默认落盘至图谱，开启外部向量库后同步写入 Qdrant，支持导出 Excel/XMind/Markdown；支持生成中取消、生成后内联编辑、表单草稿自动保存。
- **全链路 API 自动化**：支持项目-模块-接口资产台账、OpenAPI 差异预览确认同步、项目级认证/前置依赖/清理流程配置向导、变量引用检查、API Agent 冒烟与参数负向测试计划生成、推荐解释、依赖发现、业务链路自动编排、画布式依赖图确认、Agent 失败诊断摘要、调度/CI 触发入口、PostgreSQL 运行态健康检查、项目测试任务复用与治理、策略校验、执行结果回写、AI 修复补丁、执行历史批量管理及执行经验知识沉淀。
- **动态图谱可视化**：vis.js 实时渲染，支持拖拽、缩放、节点高亮，支持多维筛选和 2 度关系子图探索；支持导出图谱为 PNG 图片、两节点间最短路径查询。
- **全链路数据仪表盘**：涵盖图谱覆盖率、API 自动化健康度及 UI 自动化（规划中）的多维度可视化聚合看板，快速定位高风险功能。
- **索引治理工作台**：统一查看业务源、Neo4j 图谱索引与 Qdrant 向量库的一致性，支持缺失/孤儿/源缺失诊断、明细查看、状态同步、异步回填和审计记录。
- **全格式文档解析与管理**：支持 16 种文件格式的解析（PDF/Word/Markdown/XMind 等），提供异步上传、文件追踪、重新索引及批量管理。
- **灵活的部署与配置**：支持内置 Provider 模板、自定义 Provider 注册、设置页运行配置中心和阶段一热更新；支持配置导出/导入和版本历史回滚，保存时自动验证 LLM 端点可达性；运行时产物统一存放在 `backend/runtime/`，支持 `OPENMELON_DATA_DIR` 自定义挂载；原生支持企业级通知 Webhook。

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
# 至少填写：
# LLM_PROVIDER=qwen
# API_KEY=你的大模型密钥
# 本机运行后端时还需要：
# DATABASE_URL=postgresql://openmelon:openmelon@localhost:5432/openmelon
```
> 默认不提供 Embedding 的模型（如 DeepSeek）需额外配置 Embedding 参数，详见 [.env.example](.env.example)。
>
> PostgreSQL 是唯一运行期元数据库。Docker 一键启动会给 app 容器注入 `DATABASE_URL`；本机启动后端前，请先启动 `postgres` 服务并在 `.env` 中配置 localhost 连接串。

### 2. 启动服务（两种方式任选）

#### 方式 A：Docker 一键启动（推荐完整体验）
```bash
docker compose up -d --build
```

该命令会构建并启动前端、主后端、Reranker Sidecar、PostgreSQL、Neo4j 和 Qdrant。首次构建 Reranker 镜像会下载 `torch`、`FlagEmbedding` 等重依赖，耗时较长；后续会复用 Docker/uv 缓存。

#### 方式 B：本机开发模式（推荐前端或快速调试）
```bash
# 启动依赖服务
# 如只调试主后端，可只启动 postgres neo4j qdrant；Reranker 可在 .env 中关闭或改为 local
docker compose up -d postgres neo4j qdrant

# 启动后端
cd backend
uv sync
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 启动前端（新开终端）
cd frontend
npm install
npm run dev
```

本机模式默认前端地址为 `http://localhost:3000`；Docker 一键启动默认前端地址为 `http://localhost`。本机 Vite 开发服务会代理 `/api`、`/docs`、`/openapi.json` 和 `/redoc` 到后端 `8000`，因此 `http://localhost:3000/docs` 也可查看 FastAPI 文档；如果访问失败，先确认 `http://localhost:8000/docs` 是否正常。

### 3. 访问系统
- **前端页面**: [http://localhost:3000](http://localhost:3000)
- **API 文档**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **API 文档（前端代理）**: [http://localhost:3000/docs](http://localhost:3000/docs)
- **Neo4j 数据库**: [http://localhost:7474](http://localhost:7474)

---

## 开发维护命令

```bash
# 清理本地测试缓存、Python 字节码和前端构建产物
scripts/clean_artifacts.sh

# 一键运行后端测试、前端 lint/test/build
scripts/check.sh

# 后端测试
cd backend && uv run pytest

# 前端检查
cd frontend && npm run lint && npm test && npm run build
```

如果本机没有全局 `npm`，但已有 Node 可执行文件和 `frontend/node_modules`，可以这样运行：

```bash
OPENMELON_NODE_BIN=/path/to/node scripts/check.sh
```

### 生产安全配置

生产环境建议显式设置以下配置，避免开发默认值进入线上：

```bash
APP_ENV=production
DEBUG=false
CORS_ALLOW_ORIGINS=https://your-openmelon.example.com
PROTECT_ADMIN_API=true
ADMIN_API_KEYS=replace-with-long-random-key
# 可选：如前置网关签发 JWT，可配置 HS256 Bearer Token 校验密钥
ADMIN_JWT_SECRET=replace-with-long-random-secret
```

`APP_ENV=production` 且未配置 `CORS_ALLOW_ORIGINS` 时，后端不会默认放开任意跨域来源；`DEBUG=false` 时，接口不会向客户端返回内部异常详情。`PROTECT_ADMIN_API=true` 后，删除、清空、配置保存、执行触发、AI 生成和索引治理等高风险接口需要 `X-API-Key` 或 `Authorization: Bearer <jwt>`。

---

## 使用指南

第一次进入系统，建议按以下顺序体验整个闭环：

| 体验顺序 | 对应页面 | 操作说明 |
|:---:|---|---|
| **1** | **导入管理** | 上传一份需求文档/代码架构图/接口规范，等待状态变为“已索引” |
| **2** | **图谱总览** | 查看系统刚为你自动抽取生成的实体与关系图谱 |
| **3** | **问答** | 针对上传的文档直接提问，体验 Agentic RAG 的多步推理与精准引用 |
| **4** | **测试用例生成** | 体验一键将文档或业务模块转换为测试用例，落盘存证并导出 Excel |
| **5** | **API 自动化** | 维护项目接口资产台账，按模块或接口生成 API Agent 冒烟 DSL，保存为项目测试任务后可反复载入执行 |
| **6** | **数据仪表盘** | 查看全链路覆盖率、哪些模块缺少用例以及自动化的健康度 |
| **7** | **索引治理** | 检查 Neo4j 与 Qdrant 是否一致，必要时执行状态同步、孤儿清理或 Qdrant 异步回填 |

### 界面概览

<details>
<summary>点击展开查看各页面截图</summary>

- **问答**：![问答页面](docs/screenshots/qa-page.png)
- **图谱总览**：![图谱总览页面](docs/screenshots/graph-page.png)
- **导入管理**：![导入管理页面](docs/screenshots/manage-page.png)
- **测试用例生成**：![测试用例生成页面](docs/screenshots/testcase-page.png)
- **API 自动化**：![API 自动化页面](docs/screenshots/api-execution-page.png)
- **数据仪表盘**：![数据仪表盘页面](docs/screenshots/dashboard-page.png)
- **索引治理**：![索引治理页面](docs/screenshots/index-governance-page.png)
- **设置中心**：![设置中心页面](docs/screenshots/settings-page.png)
- **设置 - 节点类型配置**：![节点类型配置](docs/screenshots/node-page.png)
- **设置 - 项目与环境**：![项目与环境](docs/screenshots/project-env-page.png)
- **设置 - 运行配置**：![运行配置](docs/screenshots/runtime-config-page.png)
- **设置 - 健康检查**：![健康检查](docs/screenshots/system-health-page.png)
- **设置 - Prompt Hub**：![Prompt Hub 页面](docs/screenshots/prompt-hub-page.png)
- **设置 - 治理中心**：![治理中心](docs/screenshots/governance-center-page.png)
- **设置 - 日志中心**：![日志中心](docs/screenshots/log-center-page.png)
- **设置 - AI/RAG 观测**：![AI/RAG 观测](docs/screenshots/ai-observability-page.png)
</details>

---

## 运行配置中心

设置页中的“运行配置”是当前版本推荐的运行参数入口，可初始化 `.env`、维护 LLM/Embedding/检索/Reranker 参数、管理自定义 Provider 模板，并区分热更新与需重启项。完整说明见 [MANUAL.md](MANUAL.md#3-环境配置详解)。

---

## 支持的 LLM Provider

| Provider | `.env` 值 | 默认 Chat 模型 | 默认 Embedding 模型 |
|----------|-----------|---------------|-------------------|
| OpenAI-compatible 网关 | `openai_compat` | qwen-plus | text-embedding-v3 |
| OpenAI | `openai` | gpt-4o-mini | text-embedding-3-small |
| 通义千问 | `qwen` | qwen-plus | text-embedding-v3 |
| DeepSeek | `deepseek` | deepseek-chat | — |
| Mimo | `mimo` | mimo-v2-flash | — |

除了内置 Provider 外，运行配置中心还支持：

- 新增、编辑、删除自定义 Provider
- 保存推荐模型、别名、默认 Base URL 和 Embedding 能力
- 将自定义 Provider 持久化到运行时文件，而不是直接写入 `.env`

需要注意：

- Provider 管理维护的是“模板库”，不会直接替换当前运行中的主模块配置
- 真正生效的 Provider / Base URL / 模型，仍以 `.env` 和主模块 LLM 分组中当前保存值为准

---

## 核心代码结构

```text
OpenMelon/
├── backend/app/
│   ├── api/                 # 通用 FastAPI 路由（问答、图谱、导入、日志等）
│   ├── api_execution/       # API 自动化模块（项目/模块/接口资产、Agent 测试任务、DSL、编排执行、策略、诊断、调度入口、AI 修复、知识沉淀）
│   │   ├── routes/          # 各子模块路由（runs、specs、projects、knowledge、templates 等）
│   │   ├── services/        # 业务服务（run_service、spec_service、knowledge_service 等）
│   │   ├── postgres_store.py # API 执行模块 PostgreSQL 存储门面与索引查询
│   │   └── storage.py        # 运行时存储实例与 provider 入口
│   ├── auth/                # 认证与权限模块（API Key、JWT 校验）
│   ├── config_center/       # 配置中心（导入/导出、版本历史、LLM 端点验证）
│   ├── engine/              # RAG 核心编排层（意图路由、多路召回、BM25+向量 RRF 融合、Rerank）
│   ├── governance_center/   # 治理中心（待办队列、知识库、模板库、资产健康）
│   ├── index_governance/    # 索引治理模块（Neo4j/Qdrant 一致性扫描、清理、回填任务）
│   ├── knowledge_rag/       # API 执行知识检索与沉淀
│   ├── log_center/          # 日志中心（统一事件日志、审计、清理策略）
│   ├── storage/             # 存储底座（PostgreSQL 元数据库、Neo4j 知识图谱与 Qdrant 向量库）
│   ├── services/            # 业务逻辑（文档解析、覆盖率计算、会话管理、企业 Webhook 等）
│   ├── testcase_gen/        # 基于 AutoGen 的多智能体测试用例生成模块
│   │   ├── agents/          # 生成流水线智能体（需求分析、用例生成、评审）
│   │   ├── routes/          # 测试用例生成路由
│   │   ├── tc_llm_slot_store.py # 三路 LLM 槽位配置持久化
│   │   └── ...
│   └── runtime_paths.py     # 集中管理所有运行时产物路径，支持 OPENMELON_DATA_DIR 环境变量
├── backend/runtime/         # 运行时产物（数据库连接外部化，保留上传文件与日志等）
│   ├── data/                # 上传文件、Prompt Hub 种子和其他运行时文件
│   ├── data/uploads/        # 用户上传的原始文件
│   └── logs/                # 应用日志
├── frontend/src/
│   ├── pages/               # 页面组件（QA、Graph、Manage、TestCase、APIExecution、Dashboard、IndexGovernance、Settings）
│   ├── features/            # 功能模块（APIExecution、APIExecutionFlow、Graph、QA、PromptHub、AIObservability 等）
│   ├── api/                 # 前端 API 客户端（execution.js、client.js 等）
│   ├── components/          # 通用 UI 组件
│   ├── services/            # 前端业务服务
│   └── hooks/               # 自定义 React Hooks
├── docs/                    # 项目补充文档及截图资源
├── deploy/                  # 部署配置（Nginx、Docker 相关）
├── scripts/                 # 运维脚本
└── docker-compose.yml       # 容器编排文件
```

后端所有的运行时产物（数据库、日志、导出文件、上传文件）统一存放在 `backend/runtime/` 目录下，并支持通过 `OPENMELON_DATA_DIR` 环境变量配置存放路径，彻底将运行时数据与源码分离。Neo4j 与 Qdrant 数据仍使用各自独立的挂载卷。

当前业务元数据库为 PostgreSQL-only：`DATABASE_URL` 是必填运行配置，API execution、FileTracker、Prompt Hub、NodeTypeStore、日志中心事件日志和 AI 调用日志均写入 PostgreSQL。系统健康会直接检查 PostgreSQL 运行态。

PostgreSQL 本地环境直接由 `docker-compose.yml` 提供。新环境启动时，后端会在 PostgreSQL 中自动确保运行期表结构；运维备份、恢复、重置和索引治理说明见 [MANUAL.md](MANUAL.md#15-数据维护与清理)。索引治理任务队列是进程内状态，重启应用会清空当前待处理任务视图。

---

## 文档导航

想要深入了解系统？请查阅以下进阶文档：

| 文档 | 适用对象 | 核心内容 |
|------|---------|---------|
| **[MANUAL.md](MANUAL.md)** | 开发者、运维 | 操作手册：环境初始化、运行配置中心、Provider 管理、热更新边界、页面运维与常见排查 |
| **[CHANGELOG.md](CHANGELOG.md)** | 开发者 | 项目版本的变更记录与架构优化历史归档 |
