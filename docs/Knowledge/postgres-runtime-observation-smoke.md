# PostgreSQL Runtime Observation Smoke

> Goal: validate PostgreSQL as the active metadata runtime and collect observation data before any table redesign.

## Current Posture

- PostgreSQL is the active metadata runtime when `STORAGE_BACKEND=postgres`.
- SQLite is a legacy rollback backup and should show `legacy` in system health.
- Keep the current indexed columns plus `data JSONB` shape during the observation period.
- Do not run `copy --truncate` after PostgreSQL receives new writes unless discarding those writes is intentional.

## Fixed Smoke Order

1. Confirm containers and runtime config:

```bash
docker compose -f docker-compose.yml -f docker-compose.pg.yml ps postgres neo4j qdrant
cd backend
uv run --extra postgres python scripts/postgres_runtime_smoke.py --pretty
```

2. Run backend regression checks:

```bash
uv run --group dev pytest \
  tests/test_system_health.py \
  tests/test_postgres_store.py \
  tests/test_postgres_migration.py \
  tests/test_file_tracker_sqlite.py \
  tests/test_prompt_hub_tracker.py \
  tests/test_graph_node_type_sqlite.py \
  tests/test_event_logs.py \
  tests/test_api_execution_dashboard.py \
  tests/test_api_execution_run_queue.py
```

3. Run read-only migration consistency checks. These are observation references only:

```bash
uv run --extra postgres python scripts/sqlite_to_postgres.py verify \
  --sqlite runtime/data/openmelon.db \
  --database-url postgresql://openmelon:openmelon@localhost:5432/openmelon
```

```bash
uv run --extra postgres python scripts/sqlite_to_postgres.py compare \
  --sqlite runtime/data/openmelon.db \
  --database-url postgresql://openmelon:openmelon@localhost:5432/openmelon \
  --sample-size 5
```

4. Run frontend build and manual UI smoke:

```bash
npm --prefix frontend run build
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173
```

## Pass Criteria

- Smoke script returns `ok: true`.
- `storage_backend` is `postgres`.
- System health reports PostgreSQL `ok` and SQLite `legacy`.
- API execution, FileTracker, Prompt Hub, NodeTypeStore, event logs, and AI call logs checks are all `ok`.
- Frontend pages open without PG-related 500s:
  - Settings health panel
  - API execution dashboard and run history
  - Prompt Hub
  - Node type configuration
  - Log center and AI observability
  - Graph, Neo4j, and Qdrant-backed views

## Observation Checklist

Record these after each smoke pass or development session:

- `/api/system/health` status and component statuses.
- PostgreSQL row counts from the smoke script output.
- Growth in `event_logs`, `ai_call_logs`, and `runs`.
- Any SQL errors, JSONB serialization issues, or pagination/sorting regressions.
- Slow candidates: log filtering, dashboard summaries, run lists, AI observability summaries.
- Any new feature that tries to add SQLite-only SQL or assumes a filesystem SQLite path.

## When To Redesign Tables

Do not redesign tables just because the runtime is now PostgreSQL. Start a table-structure design only when observation data shows a concrete reason:

- repeated slow queries on a specific table;
- sustained growth in `event_logs`, `ai_call_logs`, or `runs`;
- JSONB fields becoming frequent filter/sort/group-by dimensions;
- clear need for stronger relational constraints.

Prompt Hub and node type configuration can remain JSONB payload tables unless real query pressure appears.
