# 后端结构化持久化 SQLite 收敛计划

> 更新时间：2026-05-08

## 目标

将后端自有的结构化运行态数据统一收敛到共享 SQLite `backend/app/data/openmelon.db`，避免继续写入 JSON 文件。

不纳入本轮 SQLite 收敛的内容：

- 上传原始文件、导出文件、日志等天然文件型产物。
- Neo4j 图谱数据和 Qdrant 向量数据等外部服务存储。
- `.env`、静态默认配置等部署配置文件。

## 执行步骤

### Step 1: 盘点剩余写入入口

状态：已完成。

结论：

- API 自动化仍保留 JSONStore 回退路径。
- 图谱节点类型配置仍写入 `backend/config/node_types.json`。
- `file_tracker`、Prompt Hub、API 自动化默认路径已具备 SQLite 迁移能力。

### Step 2: 收敛 API 自动化存储入口

状态：已完成。

动作：

- `backend/app/api_execution/storage.py` 改为 SQLite-only 入口。
- 保留 `APIExecutionStore` 名称作为 SQLite 兼容构造器，避免路由和测试调用面大改。
- 移除 `OPENMELON_STORAGE_BACKEND=json` 运行回退语义。
- 旧 `backend/app/data/api_execution/*.json` 仅作为空库迁移源。

验收：

- 临时 store 写入后只生成 SQLite DB，不生成 JSON。

### Step 3: 迁移节点类型配置

状态：已完成。

动作：

- 新增 `NodeTypeStore(BaseSQLiteStore)`。
- 新增 `graph_node_types` 表保存节点类型、分类、颜色、尺寸和排序。
- `backend/config/node_types.json` 改为初始化种子，不再作为页面 CRUD 的写入目标。

验收：

- 节点类型创建、更新、删除后只写 SQLite。
- 种子 JSON 内容保持不变。

### Step 4: 文档与变更日志

状态：已完成。

动作：

- 更新 `CHANGELOG.md`。
- 更新 `MANUAL.md` 的节点类型配置和本地运行期存储说明。
- 更新 API 自动化设计文档中 JSONStore/fallback 的旧描述。

### Step 5: 验证

状态：已完成。

已执行命令：

```bash
cd backend
python -m pytest tests/test_api_execution_*.py tests/test_graph_node_type_sqlite.py tests/test_file_tracker_sqlite.py tests/test_prompt_hub_tracker.py
cd ..
python -m compileall -q backend/app/api_execution backend/app/models backend/app/storage backend/app/services
```

结果：

- API 自动化、节点类型、File Tracker、Prompt Hub 相关 98 个用例通过。
- compileall 通过。

## 当前边界

完成本轮后，“后端自有结构化运行态数据”默认且唯一写入 SQLite。

仍不归入 SQLite 的内容包括：

- `backend/app/data/uploads/` 中的上传原始文件。
- 日志文件。
- 导出下载产物。
- Neo4j / Qdrant 中的图谱和向量数据。
- 作为初始化种子或迁移备份保留的 JSON 文件。
