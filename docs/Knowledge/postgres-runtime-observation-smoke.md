# PostgreSQL Runtime Smoke

> Goal: validate the PostgreSQL-only metadata runtime and catch regressions before deployment.

## Current Posture

- PostgreSQL is the only structured metadata runtime.
- `DATABASE_URL` must point to a reachable PostgreSQL instance before the backend starts.
- System health reports `components.postgres`; it must not report `components.sqlite`.
- Neo4j stores graph indexes and Qdrant stores optional external vectors; they are checked separately from PostgreSQL.

## Fixed Smoke Order

1. Confirm containers and runtime config:

```bash
docker compose ps postgres neo4j qdrant
cd backend
DATABASE_URL=postgresql://openmelon:openmelon@localhost:5432/openmelon \
  uv run --extra postgres python scripts/postgres_runtime_smoke.py --pretty
```

2. Run backend regression checks:

```bash
DATABASE_URL=postgresql://openmelon:openmelon@localhost:5432/openmelon \
  uv run --extra postgres pytest \
  tests/test_system_health.py \
  tests/test_postgres_store.py \
  tests/test_prompt_hub_tracker.py \
  tests/test_event_logs.py \
  tests/test_api_execution_run_queue.py \
  tests/test_index_governance_tasks.py -q
```

3. Run frontend build and manual UI smoke:

```bash
npm --prefix frontend run build
npm --prefix frontend run dev -- --host 0.0.0.0 --port 5173
```

## Pass Criteria

- Smoke script returns `ok: true`.
- System health reports PostgreSQL `ok`.
- System health does not include a SQLite component.
- API execution, FileTracker, Prompt Hub, NodeTypeStore, event logs, and AI call logs checks are all `ok`.
- Index governance can queue and complete a Qdrant rebuild task in tests.
- Frontend pages open without PG-related 500s:
  - Settings health panel
  - API execution dashboard and run history
  - Prompt Hub
  - Node type configuration
  - Log center and AI observability
  - Graph, Neo4j, and Qdrant-backed views

## Regression Watchlist

Record these after each smoke pass or development session:

- `/api/system/health` status and component statuses.
- PostgreSQL row counts from the smoke script output.
- Growth in `event_logs`, `ai_call_logs`, and `runs`.
- Any SQL errors, JSONB serialization issues, or pagination/sorting regressions.
- Async task regressions in upload indexing and index governance rebuilds.
- Any new code path that assumes a filesystem SQLite path or `STORAGE_BACKEND=sqlite`.

## When To Redesign Tables

Do not redesign tables just because the runtime is now PostgreSQL. Start a table-structure design only when observation data shows a concrete reason:

- repeated slow queries on a specific table;
- sustained growth in `event_logs`, `ai_call_logs`, or `runs`;
- JSONB fields becoming frequent filter/sort/group-by dimensions;
- clear need for stronger relational constraints.

Prompt Hub and node type configuration can remain JSONB payload tables unless real query pressure appears.
