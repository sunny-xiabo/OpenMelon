# OpenMelon

基于 **知识图谱 + 向量检索** 的智能文档问答系统，内置 AI 测试用例生成能力。

后端基于 FastAPI + Neo4j，前端基于 React + Material UI，使用 vis.js 渲染图谱，支持多种 LLM Provider 一键切换。

---

## 核心特性

- **多通道智能问答 (Agentic RAG)**：LLM 自动识别用户问题意图（图谱/向量/混合/可视化）。支持自动改写查询、评估答案充分性的多步推理，并搭配 BGE 重排序 (Reranker) 提升精度。所有回答均标注精确引用。
- **多智能体测试用例生成**：基于 AutoGen 的“需求分析 → 用例生成 → 用例评审”三阶段流水线。支持 Prompt Hub 动态配置模板与技能，生成结果自动“双写落盘”至图谱和向量库，支持导出 Excel/XMind。
- **动态图谱可视化**：vis.js 实时渲染，支持拖拽、缩放、节点高亮。支持多维筛选和 2 度关系子图探索。
- **自动化覆盖率分析**：基于图谱关系自动计算测试覆盖率，提供指标大屏与排序，快速定位高风险功能。
- **全格式文档解析与管理**：支持 16 种文件格式的解析（PDF/Word/Markdown/XMind 等），提供异步上传、文件追踪、重新索引及批量管理。
- **灵活的部署与配置**：支持 OpenAI / Qwen / DeepSeek / Mimo 等多 Provider；原生支持企业级通知 Webhook。

---

## 系统架构

```mermaid
flowchart TD
    %% 定义颜色主题
    classDef default fill:#f9f9f9,stroke:#d3d3d3,stroke-width:1px
    classDef gateway fill:#2b323b,stroke:#1e88e5,stroke-width:0px,color:#fff
    classDef offline fill:#e3f2fd,stroke:#1e88e5,stroke-width:2px,color:#000
    classDef onlineQA fill:#f3e5f5,stroke:#8e24aa,stroke-width:2px,color:#000
    classDef onlineAgent fill:#fff8e1,stroke:#fbc02d,stroke-width:2px,color:#000
    classDef storage fill:#ffffff,stroke:#f4511e,stroke-width:2px,stroke-dasharray: 5 5,color:#000
    classDef core fill:#e8f5e9,stroke:#43a047,stroke-width:1px,color:#000
    classDef db fill:#ffcc80,stroke:#e65100,stroke-width:2px,color:#000

    User(["用户 / Web UI"]) --> API_GW["FastAPI 统一网关"]
    class API_GW gateway

    %% ==========================================
    %% 1. 离线数据摄入流水线 (Offline Ingestion Pipeline)
    %% ==========================================
    subgraph Offline["离线数据摄入流 (Offline Ingestion Pipeline)"]
        direction LR
        Upload["文档上传"] --> Parse["Parser 解析<br>(PDF/Word/MD...)"]
        Parse --> Chunk["文本切块<br>(Chunking)"]
        
        Chunk --> Extract["图谱抽取<br>(Entity & Relation)"]
        Chunk --> Embed["向量化<br>(Text-Embedding)"]
    end
    class Offline offline

    %% ==========================================
    %% 2. 存储底座：双核引擎 (Dual Storage Engines)
    %% ==========================================
    subgraph Storage["双核存储引擎 (Dual Storage Engines)"]
        direction LR
        Neo4j[("Neo4j<br>知识图谱 (精准结构)")] 
        Qdrant[("Qdrant<br>向量数据库 (模糊语义)")]
    end
    class Storage storage
    class Neo4j,Qdrant db

    Extract -->|"结构化拓扑注入"| Neo4j
    Embed -->|"稠密语义片段注入"| Qdrant

    %% ==========================================
    %% 3. 在线编排层 A：智能问答 (RAG Orchestrator)
    %% ==========================================
    subgraph Online_QA["编排层 A：智能问答 (RAG Orchestrator)"]
        direction TB
        QU["Query 理解与分类<br>(Intent Router)"]
        Route{"动态路由策略"}
        Recall["多路并发召回<br>(Multi-channel Recall)"]
        Rerank["融合排序过滤<br>(BGE Reranker)"]
        Prompt["上下文拼接与 Prompt 构建"]
        LLM_QA(("LLM 生成回答"))

        QU --> Route
        Route -->|"KG / Vector / Hybrid"| Recall
        Recall --> Rerank
        Rerank --> Prompt
        Prompt --> LLM_QA
    end
    class Online_QA onlineQA
    class QU,Route,Recall,Rerank,Prompt core

    %% ==========================================
    %% 4. 在线编排层 B：测试用例生成 (Agentic Generator)
    %% ==========================================
    subgraph Online_TestCase["编排层 B：多智能体用例生成 (Agentic TestCase Generator)"]
        direction TB
        TC_Input["用例文档/文本输入"]
        TC_Context["双核联合上下文获取"]
        
        subgraph AutoGen["AutoGen 多智能体协同流水线"]
            direction LR
            Phase1["阶段 1<br>需求分析"] --> Phase2["阶段 2<br>用例生成"]
            Phase2 --> Phase3["阶段 3<br>用例评审"]
        end
        
        TC_Input --> TC_Context
        TC_Context --> AutoGen
    end
    class Online_TestCase onlineAgent
    class TC_Input,TC_Context core

    %% ==========================================
    %% 全局连接逻辑
    %% ==========================================
    API_GW -->|"文档管理调度"| Upload
    API_GW -->|"QA 请求"| QU
    API_GW -->|"用例生成请求"| TC_Input

    Recall <==>|"1. Cypher 查询图谱<br>2. KNN 检索向量"| Storage
    TC_Context <==>|"补全生成所依赖的背景知识"| Storage
    
    %% 用例双写落盘
    Phase3 -.->|"沉淀结果，支持后续语义检索"| Storage
```

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

#### 方式 A：本机开发模式（推荐前端或快速调试）
```bash
# 启动依赖服务（图谱数据库）
docker compose up -d neo4j

# 启动后端
cd backend
uv sync
uvicorn app.main:app --reload --host 0.0.0.0 --port 8000

# 启动前端（新开终端）
cd frontend
npm install
npm run dev
```

#### 方式 B：Docker 容器模式（推荐纯后端迭代）
```bash
docker compose build app
docker compose -f docker-compose.yml -f docker-compose.dev.yml up -d
docker compose logs -f app

# 前端同样在本地启动
cd frontend && npm install && npm run dev
```

### 3. 访问系统
- **前端页面**: [http://localhost:3000](http://localhost:3000)
- **API 文档**: [http://localhost:8000/docs](http://localhost:8000/docs)
- **Neo4j 数据库**: [http://localhost:7474](http://localhost:7474)

---

## 使用指南

第一次进入系统，建议按以下顺序体验整个闭环：

| 体验顺序 | 对应页面 | 操作说明 |
|:---:|---|---|
| **1** | **导入管理** | 上传一份需求文档/代码架构图，等待状态变为“已索引” |
| **2** | **问答** | 针对上传的文档直接提问，查看系统给出的回答与引用来源 |
| **3** | **图谱总览** | 查看系统刚为你自动抽取生成的实体与关系图谱 |
| **4** | **测试用例生成** | 体验一键将刚才的文档转换为测试用例，并导出 Excel |
| **5** | **覆盖率视图** | 查看哪些模块缺少测试用例，直观发现风险点 |

### 界面概览

<details>
<summary>点击展开查看各页面截图</summary>

- **问答**：![问答页面](docs/screenshots/qa-page.png)
- **图谱总览**：![图谱总览页面](docs/screenshots/graph-page.png)
- **测试用例生成**：![测试用例生成页面](docs/screenshots/testcase-page.png)
- **Prompt Hub**：![Prompt Hub 页面](docs/screenshots/prompt-hub-page.png)
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
│   ├── api/             # FastAPI 路由映射与依赖注入
│   ├── engine/          # RAG 核心编排层（意图路由、多路召回、Rerank）
│   ├── storage/         # 存储底座（Neo4j 知识图谱与 Qdrant 向量库）
│   ├── services/        # 业务逻辑（文档解析、覆盖率计算等）
│   └── testcase_gen/    # 基于 AutoGen 的多智能体测试用例生成模块
├── frontend/src/        # React 前端代码
├── docs/                # 项目补充文档及截图资源
└── docker-compose.yml   # 容器编排文件
```

---

## 文档导航

想要深入了解系统？请查阅以下进阶文档：

| 文档 | 适用对象 | 核心内容 |
|------|---------|---------|
| **[MANUAL.md](MANUAL.md)** | 开发者、运维 | 完整操作手册：架构详解、环境配置、API 参考、运维排查与 Prompt Hub 指南 |
| **[CHANGELOG.md](CHANGELOG.md)** | 开发者 | 项目版本的变更记录与架构优化历史归档 |
| **[docs/FRONTEND_DEPLOYMENT.md](docs/FRONTEND_DEPLOYMENT.md)** | 运维 | 前端独立部署 Nginx 配置示例与环境变量说明 |
