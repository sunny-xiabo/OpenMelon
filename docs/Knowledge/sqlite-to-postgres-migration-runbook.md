# SQLite -> PostgreSQL Migration Runbook

> Current status: OpenMelon still uses SQLite as the runtime metadata store. PostgreSQL is only prepared as a future migration target.

## Preflight

1. Keep the application writing to SQLite only.
2. Start the optional PostgreSQL service when running a migration drill:

```bash
docker compose -f docker-compose.yml -f docker-compose.pg.yml up -d postgres
```

3. Call `GET /api/api-execution/storage/migration-readiness` and resolve high-risk findings before export.

## Target Shape

- Keep stable query fields as normal PostgreSQL columns.
- Map the existing SQLite `data` payload to PostgreSQL `JSONB`.
- Prefer `psycopg[binary,pool]` for the first production cutover because the current store is synchronous.

## Cutover Design

1. Freeze writes to SQLite.
2. Create PostgreSQL tables with the current indexed columns plus `data JSONB`.
3. Export SQLite tables in primary-key order and import in batches.
4. Verify each table:
   - row count
   - primary-key set
   - indexed column values
   - JSON payload hash
5. Switch the runtime storage entrypoint to PostgreSQL.
6. Keep the SQLite database file as rollback backup until production smoke tests pass.

## Rollback

If smoke tests fail before new writes are accepted, point the runtime entrypoint back to SQLite and keep the PostgreSQL import for investigation. If writes have already reached PostgreSQL, export changed rows first before rollback.
