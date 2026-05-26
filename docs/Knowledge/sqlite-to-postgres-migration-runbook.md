# PostgreSQL Runtime Operations Guide

> OpenMelon 现在采用 PostgreSQL-only 运行时元数据库。本页不再描述 SQLite 迁移流程，只保留 PostgreSQL 的备份、恢复和重置动作。

## 1. 启动运行时

本地最小运行集：

```bash
docker compose up -d postgres neo4j
```

如需外部向量库，再启动：

```bash
docker compose up -d qdrant
```

应用运行前请确保 `DATABASE_URL` 已配置，例如：

```bash
DATABASE_URL=postgresql://openmelon:openmelon@postgres:5432/openmelon
```

## 2. 备份 PostgreSQL

推荐使用 `pg_dump` 做逻辑备份：

```bash
docker compose exec postgres pg_dump \
  -U ${POSTGRES_USER:-openmelon} \
  -d ${POSTGRES_DB:-openmelon} \
  -Fc > openmelon-$(date +%Y%m%d%H%M%S).dump
```

如果要保留可读 SQL，可以把 `-Fc` 换成 `-Fp`。

## 3. 恢复 PostgreSQL

```bash
cat openmelon-backup.dump | docker compose exec -T postgres pg_restore \
  -U ${POSTGRES_USER:-openmelon} \
  -d ${POSTGRES_DB:-openmelon} \
  --clean --if-exists --no-owner --no-privileges
```

如果备份文件是纯 SQL，改用 `psql`：

```bash
cat openmelon-backup.sql | docker compose exec -T postgres psql \
  -U ${POSTGRES_USER:-openmelon} \
  -d ${POSTGRES_DB:-openmelon}
```

## 4. 重置索引治理状态

索引治理的任务列表是进程内状态，不写入数据库。要清空当前任务队列，重启 `app` 容器即可：

```bash
docker compose restart app
```

如果要重置派生索引状态，按下面顺序处理：

1. 在「索引治理」页面取消正在运行的任务。
2. 执行「一致性扫描」确认缺失、孤儿和源缺失情况。
3. 需要时执行「重建」或「清理」。
4. 如需彻底清空派生向量，可手工删除 Qdrant 集合后再重建。

常见集合：

- `doc_chunks`
- `test_cases`

示例：

```bash
curl -X DELETE "http://localhost:6333/collections/doc_chunks"
curl -X DELETE "http://localhost:6333/collections/test_cases"
```

## 5. 完整开发环境重置

如需一次性清空 PostgreSQL、Neo4j、Qdrant 卷数据，可使用：

```bash
docker compose down -v
```

这个命令会删除所有挂载卷，请只在明确需要重置整个本地环境时使用。
