# data JSON 迁移 SQLite 可行性计划

## 背景

`backend/app/data` 下当前仍有两类非 API 自动化 JSON 数据文件：

- `file_tracker.json`
- `prompt_hub.json`

API 自动化数据已经具备 SQLite 后端和 JSON 迁移能力，默认共享 `backend/app/data/openmelon.db`。剩余两个 JSON 也可以迁入同一个 SQLite 文件，但迁移风险和改造范围不同，需要分阶段推进。

## 关联模块

### file_tracker.json

当前文件：

- `backend/app/data/file_tracker.json`

读写入口：

- `backend/app/services/file_tracker.py`

业务调用方：

- `backend/app/main.py`
  - 启动时将 `file_tracker` 挂到 `app.state.file_tracker`。
- `backend/app/services/indexer.py`
  - 文档索引完成后新增或更新导入记录。
  - 同名文件会更新旧记录，避免重复行。
- `backend/app/api/management_routes.py`
  - `/api/manage/files` 列表。
  - `/api/manage/files/{record_id}` 删除。
  - `/api/manage/files?filename=...` 按文件名删除。
  - `/api/manage/files/{record_id}/reindex` 重新索引并更新状态。
- `frontend/src/api/file.js`
  - 调用导入管理接口。
- `frontend/src/pages/ManagePage.jsx` 与 `frontend/src/features/Manage/*`
  - 展示导入记录、删除、重建索引、分页和筛选。

数据形态：

- 顶层是 `{record_id: record}` 字典。
- record 字段包括 `id`、`filename`、`doc_type`、`module`、`chunk_count`、`indexed_at`、`status`、`file_path`。

可行性：

- **高**。这是典型运行期索引记录，适合表结构存储。
- 可直接建 `file_records` 表，按 `id` 主键保存字段，同时保留 `data` JSON 列方便兼容扩展字段。
- 查询量小，但 SQLite 可以更稳定地支持后续分页、按文件名/模块/状态过滤。

建议表结构：

```sql
CREATE TABLE IF NOT EXISTS file_records (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL DEFAULT '',
  doc_type TEXT NOT NULL DEFAULT '',
  module TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT '',
  indexed_at TEXT NOT NULL DEFAULT '',
  file_path TEXT DEFAULT '',
  chunk_count INTEGER NOT NULL DEFAULT 0,
  data TEXT NOT NULL
);

CREATE INDEX IF NOT EXISTS idx_file_records_filename ON file_records(filename);
CREATE INDEX IF NOT EXISTS idx_file_records_module ON file_records(module);
CREATE INDEX IF NOT EXISTS idx_file_records_status ON file_records(status);
```

### prompt_hub.json

当前文件：

- `backend/app/data/prompt_hub.json`

读写入口：

- `backend/app/services/prompt_hub_tracker.py`

业务调用方：

- `backend/app/api/routers/prompt_hub.py`
  - `/api/prompt-hub/options`
  - `/api/prompt-hub/templates`
  - `/api/prompt-hub/skills`
  - `/api/prompt-hub/skill-categories`
  - 模板、技能、技能分类 CRUD。
- `backend/app/testcase_gen/services/prompt_assembler.py`
  - 测试用例生成时读取模板和技能。
  - Tracker 异常时回退到 `DEFAULT_PROMPT_HUB_DATA`。
- `backend/tests/test_prompt_hub_tracker.py`
  - 覆盖模板、技能、分类的增删改查和校验。
- `frontend/src/pages/PromptHubConfigPage.jsx`
  - Prompt Hub 管理页。
- `frontend/src/pages/SettingsPage.jsx`
  - 设置页内嵌 Prompt Hub 管理。
- `frontend/src/features/TestCase/hooks/usePromptHubOptions.js`
  - 测试用例生成页读取可用模板和技能。
- `frontend/src/api/promptHub.js`
  - Prompt Hub API client。

数据形态：

- 顶层包含 `version`、`updated_at`、`templates`、`skill_categories`、`skills`。
- `templates`、`skills`、`skill_categories` 都是数组。
- 写入时会整体校验：
  - 必须存在且仅存在一个启用中的默认模板。
  - 至少一个默认技能分类。
  - 模板、技能、分类 id/name 唯一。
  - 技能必须引用已存在分类。
  - 技能数量不能超过 `MAX_PROMPT_HUB_SKILLS`。
  - content 不允许包含 `{{` / `}}` 占位符语法。

可行性：

- **中高**。可以迁入 SQLite，但要保持当前整体配置校验语义。
- 不建议只用一个 `prompt_hub` JSON blob 表，否则收益有限。
- 建议拆成三张业务表，再加一个元信息表保存版本和更新时间。
- 迁移后仍应保留 `DEFAULT_PROMPT_HUB_DATA` 作为空库初始化和异常回退源。

建议表结构：

```sql
CREATE TABLE IF NOT EXISTS prompt_hub_meta (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_templates (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  content TEXT NOT NULL,
  review_summary TEXT DEFAULT '',
  enabled INTEGER NOT NULL DEFAULT 1,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 100,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_skill_categories (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  is_default INTEGER NOT NULL DEFAULT 0,
  sort_order INTEGER NOT NULL DEFAULT 100,
  data TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS prompt_skills (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  content TEXT NOT NULL,
  review_summary TEXT DEFAULT '',
  category TEXT NOT NULL,
  enabled INTEGER NOT NULL DEFAULT 1,
  sort_order INTEGER NOT NULL DEFAULT 100,
  data TEXT NOT NULL,
  FOREIGN KEY(category) REFERENCES prompt_skill_categories(id)
);

CREATE INDEX IF NOT EXISTS idx_prompt_templates_enabled ON prompt_templates(enabled);
CREATE INDEX IF NOT EXISTS idx_prompt_skills_enabled ON prompt_skills(enabled);
CREATE INDEX IF NOT EXISTS idx_prompt_skills_category ON prompt_skills(category);
```

## 替换策略

### 迁移顺序

1. 先迁 `file_tracker.json`。
2. 再迁 `prompt_hub.json`。
3. 最后处理 JSON 文件留存策略和 `.gitignore`。

理由：

- `file_tracker` 是纯运行期记录，结构简单，迁移收益明确。
- `prompt_hub` 是用户可编辑配置，同时承载默认配置兜底，必须先保证校验、回退和测试一致。

### 共用基础设施

两个新 store 都应继承：

- `backend/app/storage/sqlite_store.py::BaseSQLiteStore`

默认使用共享连接：

- `backend/app/data/openmelon.db`

不要再创建模块私有 db 文件。

## 实施计划

### Phase 1: file_tracker SQLite 化

状态：**已完成**。

新增：

- 已直接改造 `backend/app/services/file_tracker.py`
- `FileTracker(BaseSQLiteStore)`

需要保留的公共方法：

- `add_record(filename, doc_type, module, chunk_count)`
- `get_all_records()`
- `get_record(record_id)`
- `delete_record(record_id)`
- `delete_by_filename(filename)`
- `update_record(record_id, **kwargs)`

迁移逻辑：

- 启动时如果 `file_records` 为空且 `file_tracker.json` 存在，则导入 JSON。
- 导入后不立即删除 JSON。
- 日志记录导入条数。

兼容检查：

- 导入管理页能正常列出历史记录。
- 新上传文件后能新增或更新记录。
- 删除文件时记录、物理文件、向量 chunks 的级联行为不变。
- 重新索引时不会产生重复记录。

测试建议：

- 已新增 `backend/tests/test_file_tracker_sqlite.py`。
- 覆盖新增、同名更新、按 id 删除、按 filename 删除、更新状态、JSON 迁移。

### Phase 2: prompt_hub SQLite 化

状态：**已完成**。

新增：

- 已直接改造 `backend/app/services/prompt_hub_tracker.py`
- `PromptHubTracker(BaseSQLiteStore)`

需要保留的公共方法：

- `load_data()`
- `list_templates(enabled_only=False)`
- `list_skills(enabled_only=False)`
- `list_skill_categories()`
- `get_template_by_id(style_id)`
- `get_skills_by_ids(skill_ids)`
- `get_options()`
- `create_template/update_template/delete_template`
- `create_skill/update_skill/delete_skill`
- `create_skill_category/update_skill_category/delete_skill_category`

迁移逻辑：

- 启动时如果 Prompt Hub 相关表为空：
  - 优先从 `prompt_hub.json` 导入。
  - 若 JSON 不存在，则从 `DEFAULT_PROMPT_HUB_DATA` 初始化。
- 每次 mutation 仍需先构造完整 candidate，再复用现有 `_validate_data()` 语义。
- 写入成功后更新 `prompt_hub_meta.version` 和 `prompt_hub_meta.updated_at`。

兼容检查：

- 设置页 Prompt Hub 管理 CRUD 行为不变。
- 测试用例生成页能拉取模板、技能、默认模板。
- 删除默认模板、删除默认分类、删除被技能引用的分类仍被拒绝。
- Tracker 异常时 `prompt_assembler.py` 仍能回退默认配置。

测试建议：

- 已更新 `backend/tests/test_prompt_hub_tracker.py`，通过临时 SQLite 库覆盖现有 CRUD 和校验语义。
- 已通过 `data_file` 作为迁移源验证 JSON -> SQLite 初始化路径。

### Phase 3: 清理与运行策略

状态：**已完成**。

完成迁移并稳定后：

- `backend/app/data/api_execution/*.json` 作为迁移源保留一版或转移到备份目录。
- `file_tracker.json`、`prompt_hub.json` 可改为只读迁移源，不再写入。
- `.gitignore` 已增加：

```gitignore
backend/app/data/*.db
backend/app/data/*.db-shm
backend/app/data/*.db-wal
```

是否删除 JSON：

- 开发环境可以保留，便于人工检查迁移。
- 生产环境建议通过备份流程保留一次，然后停止写 JSON。
- 不建议在同一个版本里同时“迁 SQLite”和“删除 JSON 文件”，应分两个版本降低回滚风险。

## 风险与回滚

### 风险

- Prompt Hub 的整体校验语义迁移后容易被拆表写入破坏。
- File Tracker 删除链路涉及物理文件和向量库清理，必须确保记录删除结果不变。
- SQLite WAL 文件是运行期产物，不能提交。

### 回滚

- 不再保留运行时 JSONStore 回退路径；回滚应通过恢复上一版本代码和备份 JSON/SQLite 数据完成。
- 迁移初期不删除 JSON 源文件，作为备份和空库初始化来源。
- Store 初始化失败时应日志告警并中断启动，避免继续产生分叉数据。

## 可行性结论

- `file_tracker.json`: **可以正常替换，建议优先实施**。
- `prompt_hub.json`: **可以正常替换，但需要完整测试校验语义和默认兜底**。
- 两者都应复用 `BaseSQLiteStore` 和共享 `openmelon.db`，不应新增独立 db 文件。
