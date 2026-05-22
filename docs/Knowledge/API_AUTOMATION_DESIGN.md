# API 自动化功能设计方案

> 最后更新: 2026-05-08 (API 自动化存储已收敛为 SQLite-only)

## 概述

本文档记录 OpenMelon 后端 API 自动化模块的设计方案与演进历程。涵盖存储层、执行引擎、变量系统、调度、可观测性等方面的设计决策与实施状态。

---

## 一、存储层抽象 (已完成)

### 问题

原始实现使用 JSON 文件全量读写，无索引，`MAX_SAVED_RUNS=50` 硬限制历史数据，无法支撑生产级使用。

### 方案

抽象存储接口，SQLite 起步，后期可迁移到 PostgreSQL。当前运行时入口已收敛为 SQLite-only，JSON 文件只作为迁移种子。

**接口定义** (`storage.py`):
- `APIExecutionStore` — SQLite 兼容构造器，保留旧名称以减少调用面变更
- `SQLiteStore` — API 自动化实际存储实现

**SQLite 设计** (`app/storage/sqlite_store.py` + `app/api_execution/sqlite_store.py`):
- 表: `runs`, `projects`, `environments`, `specs`, `policy_audits`, `automation_tasks`, `automation_definitions`, `automation_runs`, `run_stage_events`, `artifact_meta`, `knowledge_items`
- 索引: `status`, `project_id`, `run_at`, `created_at`, `item_type`, `content_hash`
- WAL 模式 + `busy_timeout=5000`
- JSON-in-TEXT 存储模式，兼顾灵活性与查询能力
- 共享连接架构: `BaseSQLiteStore` (app/storage) 提供连接管理和通用工具方法，各模块子类继承并定义自己的表和方法，共享同一个 db 文件

**自动迁移**:
- 启动时创建共享 SQLite store
- 如果共享 DB 为空且旧 JSON 文件存在，逐条读取写入 SQLite
- 迁移后保留 JSON 文件作为备份/初始化兼容源，不再作为运行时写入目标

**分页**: `list_runs` 等方法支持 `offset` 参数

### 后期迁移 PG

当前已补齐只读 readiness 检查：`GET /api/api-execution/storage/migration-readiness`。该接口会返回 SQLite 表规模、JSON 字段风险、PG JSONB 映射建议和执行历史归档策略，用于迁移前评估。

迁移原则：

- 稳定查询字段拆列：`project_id`、`status`、`run_at`、`method`、`path`、`source_url`、`content_hash` 等继续建普通索引。
- 复杂 payload 保留 JSONB：`script`、`results`、`execution_options`、OpenAPI request/response 片段、策略 decision 和扩展配置不急于全量拆列。
- 敏感配置单独处理：项目认证、环境变量和 headers 迁移前需要扫描敏感键，生产环境优先迁为 Secret 引用或密文。
- 执行历史先定归档：普通通过记录可按项目/月归档，失败、策略阻断、已沉淀知识的记录延长保留。

真正切换 PG 时，再新增 `PostgresStore` 实现，使用 `asyncpg` 或 `psycopg`，迁移脚本分页读取 SQLite `data` 字段，写入 PG 后校验行数、核心字段和 JSON hash。

### 涉及文件

| 文件 | 说明 |
|------|------|
| `backend/app/storage/sqlite_store.py` | BaseSQLiteStore 基类 + 共享连接管理 |
| `backend/app/api_execution/storage.py` | API 自动化 SQLite-only 入口 + 默认 store |
| `backend/app/api_execution/sqlite_store.py` | API 执行模块 SQLite 实现 (继承 BaseSQLiteStore) |
| `backend/app/api_execution/__init__.py` | API 自动化模块初始化 |

---

## 二、执行引擎优化 (已完成)

### 2.1 异步安全

**问题**: 存储层使用 `threading.Lock`，在 async 上下文中可能导致死锁。

**方案**:
- 新增 `async_*` 系列方法，使用 `run_in_threadpool` 包装同步 I/O
- `_update_progress` 和 `_mark_finished` 使用 `async_update_run_atomic` 实现原子读-改-写
- `_execute_run` 全链路 async 化

### 2.2 竞态条件修复

**问题**: 多个协程并发修改同一个 run 记录时可能丢失更新。

**方案**: 原子更新模式
```python
async def async_update_run_atomic(self, run_id: str, updater: Callable) -> dict | None:
    """原子读-改-写，updater 接收现有数据返回新数据"""
```

### 2.3 启动恢复

**问题**: 服务重启后，`queued`/`running` 状态的 run 永远卡住。

**方案**: `recover_stale_runs()` 在启动时将这些 run 标记为 `failed`，`failure_reason` 设为 `"服务重启，执行中断"`。

### 2.4 断言类型校验

**问题**: 未知断言类型默认通过，掩盖配置错误。

**方案**: `_run_assertions` 中未知类型返回 `passed=False`，`message` 包含类型名称。`validate_dsl` 路由增加 `_VALID_ASSERTION_TYPES` 白名单校验。

### 2.5 代码去重

- `_execution_options`, `_now_iso` 等函数统一到 `utils.py`
- 知识模块 `_now_iso` 从 `datetime` 直接 import 改为从 `utils.py` import
- `routers.py` 中移除重复定义

### 涉及文件

| 文件 | 说明 |
|------|------|
| `backend/app/api_execution/storage.py` | async 包装、原子更新、recover_stale_runs |
| `backend/app/api_execution/run_queue.py` | 全链路 async、竞态修复 |
| `backend/app/api_execution/runner.py` | 断言校验、path 解析增强 |
| `backend/app/api_execution/utils.py` | 公共工具函数 |
| `backend/app/api_execution/routers.py` | 去重、校验增强 |

---

## 三、失败自动重试 (已完成)

### 3.1 步骤级重试

**Schema**:
```python
class APIRetryConfig(BaseModel):
    max_attempts: int = 1          # 最大尝试次数（含首次）
    delay_ms: int = 1000           # 重试间隔（毫秒）
    backoff_factor: float = 1.0    # 退避因子，delay *= backoff_factor
    retry_on: list[str] = ["status_code"]  # 触发重试的断言类型
```

**实现**: `_run_step_with_retry()` 包装 `_run_step()`，根据 `retry_on` 匹配失败断言类型决定是否重试。

### 3.2 项目级自动重跑

**Schema**: `APIRunReport` 新增字段:
- `attempt: int = 1` — 当前第几次尝试
- `parent_run_id: Optional[str] = None` — 上一次失败的 run_id

**实现**: `_execute_run` 中，run 完成后检查 `project_policy_snapshot.max_reruns`，如果 `attempt <= max_reruns`，自动创建新 run 入队，`attempt` 递增，`parent_run_id` 指向失败 run。

**约束**: 仅对测试断言失败触发重跑，超时/取消/基础设施异常不触发。

### 涉及文件

| 文件 | 说明 |
|------|------|
| `backend/app/api_execution/schemas.py` | APIRetryConfig, attempt, parent_run_id |
| `backend/app/api_execution/runner.py` | _run_step_with_retry |
| `backend/app/api_execution/run_queue.py` | _maybe_auto_rerun |

---

## 四、变量系统增强 (已完成)

### 问题

变量只能来自上一步 extraction，缺乏环境变量注入、随机数据生成、时间戳等能力。

### 方案

**Schema**:
```python
class VariableSetup(BaseModel):
    name: str
    source: str = "static"  # static | env | random | timestamp
    value: Any = None       # source=static 时使用
    env_key: str = ""       # source=env 时读取环境变量
    random_type: str = ""   # uuid | string | int | float
    random_min: int = 0
    random_max: int = 100
    random_length: int = 8
```

**变量优先级** (低到高):
1. `environment.variables` — 环境配置
2. `script.variables` — 脚本静态变量
3. `setup_variables` — 运行前预设（static/env/random/timestamp）
4. extraction — 步骤间传递

**实现**: `_init_variables()` 按优先级合并，`_generate_random()` 处理各类随机数据生成。

### 涉及文件

| 文件 | 说明 |
|------|------|
| `backend/app/api_execution/schemas.py` | VariableSetup, APITestCaseDsl.setup_variables |
| `backend/app/api_execution/runner.py` | _init_variables, _generate_random |

---

## 五、步骤并行执行 (已完成)

### 问题

步骤严格串行执行，即使无变量依赖也必须等待前一步完成。

### 方案

**Schema 已有字段**:
- `APITestStep.depends_on: list[str] = []` — 依赖的 step id 列表
- `APITestStep.parallel_group: str = ""` — 同组内并行执行

**实现**:
- `_build_step_levels(steps)` — Kahn 算法拓扑排序，返回可并行执行的层级列表
- `_detect_cycle(steps, step_map)` — DFS 检测循环依赖，有环抛 ValueError
- `_needs_dag_execution(steps)` — 检测是否有步骤使用 `depends_on` 或 `parallel_group`，无则走串行路径（向后兼容）
- `_run_dag()` — 按层级执行；未使用 `parallel_group` 时保持原有层级并行，使用后同一拓扑层内按并行组分批执行
- 并行步骤各自持有变量副本，组完成后合并 extraction 到全局变量；同名变量不同值会显式标记 `variable_conflict` 失败
- `continue_on_failure=False` 时，任何并行组有失败即停止后续组

### 涉及文件

| 文件 | 说明 |
|------|------|
| `backend/app/api_execution/runner.py` | DAG 构建 + 并行执行逻辑 |

---

## 六、SSE 进度推送 (已完成)

### 问题

前端必须轮询才能获取进度，浪费资源且体验差。

### 方案

使用 Server-Sent Events (SSE)，比 WebSocket 更轻量，适合单向推送。

**路由**: `GET /runs/{run_id}/stream`

**实现**:
- `run_queue.py` 维护 `_sse_channels: dict[str, list[asyncio.Queue]]` 映射
- `subscribe_sse(run_id)` / `unsubscribe_sse(run_id, queue)` 管理连接
- `_broadcast_sse(run_id, event, data)` 向所有订阅者广播；SSE 队列使用 `API_EXECUTION_SSE_QUEUE_SIZE` 控制上限，慢客户端会丢弃旧进度保留最新进度
- `_update_progress` 中写入 storage 后广播 `progress` 事件
- `_mark_finished` 中广播 `finished` 事件并关闭所有连接
- `_close_sse_channels(run_id)` 发送 None 信号终止流
- `routers.py` 使用 `StreamingResponse` 实现 SSE 端点
- 已结束的 run 直接返回 final 事件，不创建订阅

### 涉及文件

| 文件 | 说明 |
|------|------|
| `backend/app/api_execution/routers.py` | SSE 端点 |

### 队列运行时配置

单节点生产加固保留当前 asyncio 后台队列，不引入外部队列依赖。队列吞吐和等待策略由以下配置控制：

- `API_EXECUTION_MAX_CONCURRENT_RUNS`：后台执行最大并发，默认 `2`
- `API_EXECUTION_QUEUE_WAIT_TIMEOUT_S`：等待并发槽位超时时间，默认 `60`
- `API_EXECUTION_SSE_QUEUE_SIZE`：单个 SSE 订阅连接的进度缓冲上限，默认 `100`
- `GET /api/api-execution/runs/queue/status`：返回单进程队列状态、存储中的 queued/running 计数和 SSE 订阅数
| `backend/app/api_execution/run_queue.py` | 进度广播 |

---

## 七、测试套件组织 (待实施 - P2)

### 问题

没有测试套件、标签、分组概念，每个 run 都是独立脚本。

### 设计

**新增 Schema**:
```python
class APITestSuite(BaseModel):
    suite_id: str
    name: str
    project_id: str
    description: str = ""
    tags: list[str] = []
    case_ids: list[str] = []
    parallel: bool = False
    continue_on_failure: bool = True
    environment_id: str = ""
```

**路由**: Suite CRUD + `POST /suites/{suite_id}/run`

**存储**: `suites.json` 或 SQLite suites 表

### 涉及文件

| 文件 | 说明 |
|------|------|
| `backend/app/api_execution/schemas.py` | APITestSuite |
| `backend/app/api_execution/storage.py` | Suite CRUD |
| `backend/app/api_execution/routers.py` | Suite 路由 |
| `backend/app/api_execution/run_queue.py` | 套件执行逻辑 |

---

## 八、定时调度 (待实施 - P2)

### 问题

`schedule_cron` 字段存在但从未使用，`trigger_scheduled_runs` 必须手动调用。

### 设计

使用 `APScheduler` 作为后台调度器。

**新增文件**: `backend/app/api_execution/scheduler.py`
- `init_scheduler()` — 应用启动时加载所有项目的 cron 任务
- 项目 CRUD 时同步调度器（add/remove job）
- `GET /automation/scheduled-runs/status` — 返回调度器状态

**依赖**: `pip install apscheduler`

### 涉及文件

| 文件 | 说明 |
|------|------|
| `backend/app/api_execution/scheduler.py` | 调度器（新建） |
| `backend/app/api_execution/routers.py` | 项目 CRUD 同步调度器 |
| `backend/app/main.py` | 启动时 init_scheduler |

---

## 九、知识图谱写入可靠性 (已完成)

### 问题

图谱写入 fire-and-forget，失败无重试无告警。

### 方案

- `write_run_to_graph_with_retry(graph_ops, run, max_retries=3, retry_delay=1.0)` — 带指数退避重试
- 每次失败记录 `logger.warning` 日志
- 全部重试失败后返回 `{"success": False, "error": ..., "attempt": ...}`
- `build_graph_write_failure_task(run, error, attempt)` — 构建 `knowledge_write_failure` 类型的 automation_task
- `_ingest_single_run_to_knowledge` 中使用带重试版本，失败时自动创建待处理任务

### 涉及文件

| 文件 | 说明 |
|------|------|
| `backend/app/api_execution/knowledge.py` | 重试逻辑、失败任务构建 |
| `backend/app/api_execution/routers.py` | 调用带重试版本 |

---

## 实施状态总览

| 阶段 | 模块 | 状态 |
|------|------|------|
| P0 | SQLite 存储 | 已完成 |
| P0 | 步骤级重试 | 已完成 |
| P0 | 变量系统增强 | 已完成 |
| P0 | 项目级 max_reruns | 已完成 |
| P1 | 步骤并行执行 | 已完成 |
| P1 | SSE 进度推送 | 已完成 |
| P1 | 知识图谱可靠性 | 已完成 |
| P2 | 测试套件组织 | 待实施 |
| P2 | 定时调度 | 待实施 |
