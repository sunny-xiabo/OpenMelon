# SQLite -> PostgreSQL Migration Runbook

> Current status: OpenMelon can run on PostgreSQL for shared metadata stores. SQLite is kept as a legacy rollback path during the migration observation period.

## Preflight

1. Keep the application writing to SQLite until the cutover window.
2. Start the optional PostgreSQL service when running a migration drill:

```bash
docker compose -f docker-compose.yml -f docker-compose.pg.yml up -d postgres
```

3. Call `GET /api/api-execution/storage/migration-readiness` and resolve high-risk findings before export.
4. Inspect the generated migration plan:

```bash
uv run python backend/scripts/sqlite_to_postgres.py plan --sqlite backend/runtime/data/openmelon.db
```

5. Review the PostgreSQL DDL before applying it:

```bash
uv run python backend/scripts/sqlite_to_postgres.py schema --sqlite backend/runtime/data/openmelon.db
```

## Target Shape

- Keep stable query fields as normal PostgreSQL columns.
- Map the existing SQLite `data` payload to PostgreSQL `JSONB`.
- Prefer `psycopg[binary,pool]` for the first production cutover because the current store is synchronous.

## Cutover Design

1. Freeze writes to SQLite.
2. Back up the SQLite database file.
3. Create PostgreSQL tables with the current indexed columns plus `data JSONB`.
4. Export SQLite tables in primary-key order and import in batches.
5. Verify each table:
   - row count
   - primary-key set
   - indexed column values
   - JSON payload hash
6. Run the read-only `compare` command for primary-key samples.
7. Set `STORAGE_BACKEND=postgres` and `DATABASE_URL`.
8. Start the backend and run smoke tests for API execution, file tracking, Prompt Hub, node type config, system health, and logs.
9. Keep the SQLite database file as rollback backup until production smoke tests pass.

## Migration Drill Commands

Install optional PostgreSQL migration dependencies:

```bash
uv sync --extra postgres
```

Copy SQLite data into PostgreSQL:

```bash
uv run --extra postgres python backend/scripts/sqlite_to_postgres.py copy \
  --sqlite backend/runtime/data/openmelon.db \
  --database-url "$DATABASE_URL"
```

Verify row counts and canonical JSON hashes:

```bash
uv run --extra postgres python backend/scripts/sqlite_to_postgres.py verify \
  --sqlite backend/runtime/data/openmelon.db \
  --database-url "$DATABASE_URL"
```

Run a read-only comparison with primary-key samples:

```bash
uv run --extra postgres python backend/scripts/sqlite_to_postgres.py compare \
  --sqlite backend/runtime/data/openmelon.db \
  --database-url "$DATABASE_URL"
```

## PostgreSQL Runtime And SQLite Sunset

PostgreSQL is used when explicitly enabled:

```bash
STORAGE_BACKEND=postgres
DATABASE_URL=postgresql://openmelon:openmelon@postgres:5432/openmelon
POSTGRES_HEALTHCHECK_ENABLED=true
```

The PostgreSQL runtime covers API execution, file tracker, Prompt Hub, and node type configuration. In `STORAGE_BACKEND=postgres` mode, SQLite health is reported as `legacy` and does not decide the overall runtime status. Keep the SQLite database file and cutover backup until the PostgreSQL observation period is complete.

Do not run fresh `copy --truncate` after new writes have reached PostgreSQL unless you intentionally want to discard those PG writes. During the observation period, use PostgreSQL as the source of truth and keep SQLite only for rollback investigation.

## Rollback

If smoke tests fail before new writes are accepted, point the runtime entrypoint back to SQLite and keep the PostgreSQL import for investigation. If writes have already reached PostgreSQL, export changed rows first before rollback.
