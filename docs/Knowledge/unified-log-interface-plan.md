# OpenMelon 统一日志接口计划

## 背景

当前「日志中心」已经能通过现有接口聚合展示 API 执行、策略审计、自动化任务和知识状态事件，但它还不是统一日志系统。

当前数据来源：

- `runs`：API 自动化执行记录。
- `policy_audits`：策略审计。
- `automation_tasks`：待处理任务、写入失败、策略阻断等。
- `knowledge_items`：知识沉淀、失效、撤回状态。

下一阶段需要补统一日志接口，让前端日志中心从“多接口聚合”升级为“单接口查询”。

补充说明：OpenMelon 原本已有系统日志接口：

- `GET /api/logs`：读取 `openmelon.log` / `openmelon_error.log` 的尾部文本。
- `GET /api/logs/list`：列出可读取的日志文件。

本计划新增的是业务事件日志接口，路径放在 `/api/logs/events`、`/api/logs/summary` 和 `/api/logs/events/{event_id}/related`，与原系统日志文件接口并存，不覆盖原接口。

## 目标

- 建立统一日志事件结构。
- 提供统一只读查询接口。
- 支持分页、时间范围、等级、模块、项目、关键词和 trace 过滤。
- API 自动化、测试用例生成、知识入库、向量/图谱写入、AI 调用逐步写入统一日志。
- 保留现有聚合逻辑作为迁移期 fallback。

## 非目标

- 第一版不做复杂全文检索引擎。
- 第一版不接外部日志系统。
- 第一版不做日志删除和长期归档策略。
- 第一版不替换 Python 标准 logging，只补业务事件日志。

## 数据模型

建议新增 SQLite 表：`event_logs`

字段：

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| `event_id` | TEXT PRIMARY KEY | 日志事件 ID |
| `created_at` | TEXT | 事件时间，ISO 字符串 |
| `level` | TEXT | `info`、`warning`、`error` |
| `module` | TEXT | `api_execution`、`testcase_generation`、`knowledge`、`policy`、`scheduler`、`system` |
| `event_type` | TEXT | 事件类型，如 `run_completed`、`knowledge_ingest_failed` |
| `project_id` | TEXT | 项目 ID，可空 |
| `trace_id` | TEXT | 关联链路 ID，优先使用 `run_id`、`task_id`、`knowledge_id` |
| `source_id` | TEXT | 源对象 ID |
| `title` | TEXT | 简短标题 |
| `message` | TEXT | 详细说明 |
| `data` | TEXT | JSON 原始载荷 |

建议索引：

- `created_at`
- `level`
- `module`
- `project_id`
- `trace_id`
- `event_type`

## 事件结构

统一返回结构：

```json
{
  "event_id": "evt_xxx",
  "created_at": "2026-05-12T10:00:00Z",
  "level": "error",
  "module": "api_execution",
  "event_type": "run_failed",
  "project_id": "demo-api-flow",
  "trace_id": "run-123",
  "source_id": "run-123",
  "title": "API 执行失败",
  "message": "订单详情返回 404",
  "refs": ["run-123", "task-456", "demo-api-flow"],
  "data": {}
}
```

## API 设计

### 查询日志

`GET /api/logs/events`

参数：

- `project_id`
- `module`
- `level`
- `event_type`
- `trace_id`
- `keyword`
- `start_at`
- `end_at`
- `limit`，默认 50，最大 200
- `offset`，默认 0

返回：

```json
{
  "total": 128,
  "limit": 50,
  "offset": 0,
  "items": []
}
```

### 查询日志统计

`GET /api/logs/summary`

参数同查询日志，返回：

```json
{
  "total": 128,
  "error_count": 3,
  "warning_count": 18,
  "module_counts": [],
  "event_type_counts": [],
  "latest_error_at": "2026-05-12T10:00:00Z"
}
```

### 查询关联事件

`GET /api/logs/events/{event_id}/related`

按 `trace_id` 和 `refs` 返回相关事件。

## 写入规范

新增 helper：

- `log_event(level, module, event_type, title, message, project_id="", trace_id="", source_id="", refs=None, data=None)`

第一批写入点：

- API 执行开始、完成、失败、取消。
- 策略允许、策略阻断。
- 自动化任务创建、完成。
- 知识候选创建、确认沉淀、写入失败。
- 流程模板保存、覆盖、删除。
- 测试用例生成开始、完成、失败、存入向量库。

## 前端迁移

当前日志中心逻辑：

- 多接口聚合。
- 前端过滤、分页、统计、关联事件。

迁移后：

- 筛选、分页、统计改为调用统一日志接口。
- 详情抽屉调用 related 接口。
- 保留现有聚合函数作为接口不可用时的 fallback。

## 分阶段计划

### 阶段 1：后端日志表和只读接口

- [x] 新增 `event_logs` 存储能力。
- [x] 新增 `GET /api/logs/events`。
- [x] 新增 `GET /api/logs/summary`。
- [x] 新增 `GET /api/logs/events/{event_id}/related`。
- [x] 覆盖分页、过滤、关键词和 trace 查询测试。

### 阶段 2：核心业务写入

- [x] API 执行链路写入事件。
- [x] 策略审计写入事件。
- [x] 自动化任务写入事件。
- [x] 知识沉淀写入事件。

### 阶段 3：前端切换数据源

- [x] 日志中心改接统一日志接口。
- [x] 保留聚合 fallback。
- [x] 统计栏改接 summary。
- [x] 相关事件改接 related。

### 阶段 4：扩展模块

- [x] 测试用例生成写入日志。
- [x] 向量库写入状态写入日志。
- [x] 图谱写入状态写入日志。
- [x] AI 调用摘要写入日志。
- [x] 文档索引/上传写入日志。
- [x] RAG 查询写入日志。
- [x] Prompt Hub 配置变更写入日志。
- [x] 文件管理删除/重建索引写入日志。
- [x] 企业微信/钉钉/飞书 webhook 发送、验证和回调处理写入日志。

## 验收标准

- 日志中心分页来自后端 `total/limit/offset`。
- 同一 `run_id` 相关的执行、策略、任务、知识事件能串起来。
- 关键词能搜索标题、说明、事件类型和关键 ID。
- 不影响现有 API 自动化、测试用例生成和知识沉淀流程。
- 旧聚合模式在统一日志接口不可用时仍能展示基础日志。

## 当前完成记录

- 已新增 `backend/app/api/routers/logs.py`，统一暴露业务事件查询、统计和关联事件接口。
- 已新增 `backend/app/api/logging_service.py`，业务侧通过 `log_event(...)` 写入统一事件。
- 已在 SQLite store 中新增 `event_logs` 表、索引、分页查询、统计查询和关联查询。
- 已将 API 执行、策略审计、自动化任务和知识状态变化接入统一事件写入。
- 已将前端日志中心切换到统一日志接口，并保留原多接口聚合 fallback。
- 已确认原 `GET /api/logs` / `GET /api/logs/list` 系统日志文件接口继续保留。
- 已补齐测试用例生成、测试用例向量入库、文档索引/上传、异步上传任务、RAG 查询、图谱节点类型治理、Prompt Hub 变更、文件管理删除/重建索引、企业 webhook 和 API 自动化 AI 助手事件写入。

## 后续待办

- 日志中心增加“系统日志文件”子视图，用于读取原 `/api/logs` 和 `/api/logs/list`。
- 继续把 reranker sidecar 调用成功率和耗时纳入统一日志。
- 系统运行日志文件仍通过原 `/api/logs` 读取，不进入 `event_logs`，后续可做统一页面展示。
