"""SQLite storage backend for API execution module.

Provides indexed queries, no record limits, and pagination support.
Uses the shared SQLite connection from app.storage.sqlite_store.
"""

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

from starlette.concurrency import run_in_threadpool

from app.storage.sqlite_store import BaseSQLiteStore

logger = logging.getLogger(__name__)


class SQLiteStore(BaseSQLiteStore):
    """SQLite-backed storage for API execution. Same public API as APIExecutionStore."""

    def _init_schema(self) -> None:
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'queued',
                project_id TEXT DEFAULT '',
                case_id TEXT DEFAULT '',
                case_name TEXT DEFAULT '',
                run_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
            CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
            CREATE INDEX IF NOT EXISTS idx_runs_at ON runs(run_at);

            CREATE TABLE IF NOT EXISTS projects (
                project_id TEXT PRIMARY KEY,
                name TEXT NOT NULL DEFAULT '',
                updated_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS environments (
                environment_id TEXT PRIMARY KEY,
                project_id TEXT NOT NULL DEFAULT '',
                updated_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_env_project ON environments(project_id);

            CREATE TABLE IF NOT EXISTS specs (
                spec_id TEXT PRIMARY KEY,
                source_url TEXT DEFAULT '',
                content_hash TEXT DEFAULT '',
                parsed_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_specs_content_hash ON specs(content_hash);
            CREATE INDEX IF NOT EXISTS idx_specs_source_url ON specs(source_url);

            CREATE TABLE IF NOT EXISTS policy_audits (
                audit_id TEXT PRIMARY KEY,
                project_id TEXT DEFAULT '',
                action TEXT DEFAULT '',
                created_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_audits_project ON policy_audits(project_id);

            CREATE TABLE IF NOT EXISTS automation_tasks (
                task_id TEXT PRIMARY KEY,
                status TEXT DEFAULT '',
                project_id TEXT DEFAULT '',
                updated_at TEXT DEFAULT '',
                created_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_tasks_status ON automation_tasks(status);
            CREATE INDEX IF NOT EXISTS idx_tasks_project ON automation_tasks(project_id);

            CREATE TABLE IF NOT EXISTS automation_definitions (
                definition_id TEXT PRIMARY KEY,
                updated_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );

            CREATE TABLE IF NOT EXISTS automation_runs (
                automation_run_id TEXT PRIMARY KEY,
                run_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_automation_runs_at ON automation_runs(run_at);

            CREATE TABLE IF NOT EXISTS run_stage_events (
                event_id TEXT PRIMARY KEY,
                created_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_stage_events_at ON run_stage_events(created_at);

            CREATE TABLE IF NOT EXISTS artifact_meta (
                artifact_id TEXT PRIMARY KEY,
                created_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_artifact_at ON artifact_meta(created_at);

            CREATE TABLE IF NOT EXISTS knowledge_items (
                knowledge_id TEXT PRIMARY KEY,
                item_type TEXT DEFAULT '',
                project_id TEXT DEFAULT '',
                created_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_knowledge_type ON knowledge_items(item_type);
            CREATE INDEX IF NOT EXISTS idx_knowledge_project ON knowledge_items(project_id);

            CREATE TABLE IF NOT EXISTS event_logs (
                event_id TEXT PRIMARY KEY,
                created_at TEXT DEFAULT '',
                level TEXT DEFAULT '',
                module TEXT DEFAULT '',
                event_type TEXT DEFAULT '',
                project_id TEXT DEFAULT '',
                trace_id TEXT DEFAULT '',
                source_id TEXT DEFAULT '',
                title TEXT DEFAULT '',
                message TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_event_logs_created_at ON event_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_event_logs_level ON event_logs(level);
            CREATE INDEX IF NOT EXISTS idx_event_logs_module ON event_logs(module);
            CREATE INDEX IF NOT EXISTS idx_event_logs_project ON event_logs(project_id);
            CREATE INDEX IF NOT EXISTS idx_event_logs_trace ON event_logs(trace_id);
            CREATE INDEX IF NOT EXISTS idx_event_logs_type ON event_logs(event_type);
        """)

    # ---- specs ----

    def save_spec(self, spec: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("specs", "spec_id", spec["spec_id"], {
                "source_url": spec.get("source_url", ""),
                "content_hash": spec.get("content_hash", ""),
                "parsed_at": spec.get("parsed_at", ""),
            }, spec)
            return spec

    def get_spec(self, spec_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one("SELECT data FROM specs WHERE spec_id = ?", (spec_id,)))

    def get_spec_by_content_hash(self, content_hash: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._query_one("SELECT data FROM specs WHERE content_hash = ?", (content_hash,))
            return self._row_to_data(row)

    def get_latest_spec_by_source_url(self, source_url: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._query_one(
                "SELECT data FROM specs WHERE source_url = ? ORDER BY parsed_at DESC LIMIT 1",
                (source_url,),
            )
            return self._row_to_data(row)

    # ---- runs ----

    def save_run(self, run: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            opts = run.get("execution_options") or {}
            self._upsert("runs", "run_id", run["run_id"], {
                "status": run.get("status", "queued"),
                "project_id": opts.get("project_id", ""),
                "case_id": run.get("case_id", ""),
                "case_name": run.get("case_name", ""),
                "run_at": run.get("run_at", ""),
            }, run)
            return run

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one("SELECT data FROM runs WHERE run_id = ?", (run_id,)))

    def update_run(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            row = self._query_one("SELECT data FROM runs WHERE run_id = ?", (run_id,))
            if not row:
                return None
            existing = json.loads(row["data"])
            merged = {**existing, **patch}
            opts = merged.get("execution_options") or {}
            self._upsert("runs", "run_id", run_id, {
                "status": merged.get("status", "queued"),
                "project_id": opts.get("project_id", ""),
                "case_id": merged.get("case_id", ""),
                "case_name": merged.get("case_name", ""),
                "run_at": merged.get("run_at", ""),
            }, merged)
            return merged

    def list_runs(
        self,
        limit: int = 20,
        status: str | None = None,
        keyword: str | None = None,
        project_id: str | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        with self._lock:
            conditions = ["1=1"]
            params: list[Any] = []
            if status:
                conditions.append("status = ?")
                params.append(status)
            if project_id:
                conditions.append("project_id = ?")
                params.append(project_id.strip())
            if keyword:
                kw = keyword.lower().strip()
                conditions.append(
                    "(LOWER(case_name) LIKE ? OR LOWER(case_id) LIKE ? OR data LIKE ?)"
                )
                params.extend([f"%{kw}%", f"%{kw}%", f"%{kw}%"])
            where = " AND ".join(conditions)
            rows = self._query(
                f"SELECT data FROM runs WHERE {where} ORDER BY run_at DESC LIMIT ? OFFSET ?",
                tuple(params) + (limit, offset),
            )
            return [json.loads(r["data"]) for r in rows]

    def delete_run(self, run_id: str) -> bool:
        with self._lock:
            cursor = self._conn.execute("DELETE FROM runs WHERE run_id = ?", (run_id,))
            self._conn.commit()
            return cursor.rowcount > 0

    # ---- projects ----

    def save_project(self, project: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("projects", "project_id", project["project_id"], {
                "name": project.get("name", ""),
                "updated_at": project.get("updated_at") or project.get("created_at") or "",
            }, project)
            return project

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one("SELECT data FROM projects WHERE project_id = ?", (project_id,)))

    def list_projects(self) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._query("SELECT data FROM projects ORDER BY updated_at DESC")
            return [json.loads(r["data"]) for r in rows]

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            cursor = self._conn.execute("DELETE FROM projects WHERE project_id = ?", (project_id,))
            self._conn.execute("DELETE FROM environments WHERE project_id = ?", (project_id,))
            self._conn.commit()
            return cursor.rowcount > 0

    # ---- environments ----

    def save_environment(self, environment: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("environments", "environment_id", environment["environment_id"], {
                "project_id": environment.get("project_id", ""),
                "updated_at": environment.get("updated_at") or environment.get("created_at") or "",
            }, environment)
            return environment

    def get_environment(self, environment_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one("SELECT data FROM environments WHERE environment_id = ?", (environment_id,)))

    def list_environments(self, project_id: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            if project_id:
                rows = self._query(
                    "SELECT data FROM environments WHERE project_id = ? ORDER BY updated_at DESC",
                    (project_id,),
                )
            else:
                rows = self._query("SELECT data FROM environments ORDER BY updated_at DESC")
            return [json.loads(r["data"]) for r in rows]

    def delete_environment(self, environment_id: str) -> bool:
        with self._lock:
            cursor = self._conn.execute("DELETE FROM environments WHERE environment_id = ?", (environment_id,))
            self._conn.commit()
            return cursor.rowcount > 0

    # ---- policy audits ----

    def save_policy_audit(self, audit: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("policy_audits", "audit_id", audit["audit_id"], {
                "project_id": audit.get("project_id", ""),
                "action": audit.get("action", ""),
                "created_at": audit.get("created_at", ""),
            }, audit)
            return audit

    def list_policy_audits(
        self,
        limit: int = 20,
        project_id: str | None = None,
        action: str | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            conditions = ["1=1"]
            params: list[Any] = []
            if project_id:
                conditions.append("project_id = ?")
                params.append(project_id.strip())
            if action:
                conditions.append("action = ?")
                params.append(action.strip())
            where = " AND ".join(conditions)
            rows = self._query(
                f"SELECT data FROM policy_audits WHERE {where} ORDER BY created_at DESC LIMIT ?",
                tuple(params) + (limit,),
            )
            return [json.loads(r["data"]) for r in rows]

    # ---- automation tasks ----

    def save_automation_task(self, task: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("automation_tasks", "task_id", task["task_id"], {
                "status": task.get("status", ""),
                "project_id": task.get("project_id", ""),
                "updated_at": task.get("updated_at") or task.get("created_at") or "",
                "created_at": task.get("created_at") or "",
            }, task)
            return task

    def get_automation_task(self, task_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one("SELECT data FROM automation_tasks WHERE task_id = ?", (task_id,)))

    def list_automation_tasks(
        self,
        limit: int = 20,
        status: str | None = None,
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            conditions = ["1=1"]
            params: list[Any] = []
            if status:
                conditions.append("status = ?")
                params.append(status.strip())
            if project_id:
                conditions.append("project_id = ?")
                params.append(project_id.strip())
            where = " AND ".join(conditions)
            rows = self._query(
                f"SELECT data FROM automation_tasks WHERE {where} ORDER BY updated_at DESC LIMIT ?",
                tuple(params) + (limit,),
            )
            return [json.loads(r["data"]) for r in rows]

    def update_automation_task(self, task_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            row = self._query_one("SELECT data FROM automation_tasks WHERE task_id = ?", (task_id,))
            if not row:
                return None
            existing = json.loads(row["data"])
            merged = {**existing, **patch}
            self._upsert("automation_tasks", "task_id", task_id, {
                "status": merged.get("status", ""),
                "project_id": merged.get("project_id", ""),
                "updated_at": merged.get("updated_at") or merged.get("created_at") or "",
                "created_at": merged.get("created_at") or "",
            }, merged)
            return merged

    # ---- automation definitions ----

    def save_automation_definition(self, definition: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("automation_definitions", "definition_id", definition["definition_id"], {
                "updated_at": definition.get("updated_at") or definition.get("created_at") or "",
            }, definition)
            return definition

    def get_automation_definition(self, definition_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one(
                "SELECT data FROM automation_definitions WHERE definition_id = ?",
                (definition_id,),
            ))

    def list_automation_definitions(
        self,
        limit: int = 100,
        project_id: str | None = None,
        definition_type: str | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._query(
                "SELECT data FROM automation_definitions ORDER BY updated_at DESC LIMIT ?",
                (max(limit * 3, limit),),
            )
            definitions = [json.loads(r["data"]) for r in rows]
            if project_id:
                safe_project_id = project_id.strip()
                definitions = [
                    item for item in definitions
                    if item.get("project_id", "") in {"", safe_project_id}
                ]
            if definition_type:
                safe_type = definition_type.strip()
                definitions = [item for item in definitions if item.get("definition_type") == safe_type]
            return definitions[:limit]

    def delete_automation_definition(self, definition_id: str) -> bool:
        with self._lock:
            cursor = self._conn.execute("DELETE FROM automation_definitions WHERE definition_id = ?", (definition_id,))
            self._conn.commit()
            return cursor.rowcount > 0

    # ---- automation runs ----

    def save_automation_run(self, run: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("automation_runs", "automation_run_id", run["automation_run_id"], {
                "run_at": run.get("run_at", ""),
            }, run)
            return run

    def list_automation_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._query("SELECT data FROM automation_runs ORDER BY run_at DESC LIMIT ?", (limit,))
            return [json.loads(r["data"]) for r in rows]

    # ---- run stage events ----

    def save_run_stage_event(self, event: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("run_stage_events", "event_id", event["event_id"], {
                "created_at": event.get("created_at", ""),
            }, event)
            return event

    # ---- artifact meta ----

    def save_artifact_meta(self, artifact: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("artifact_meta", "artifact_id", artifact["artifact_id"], {
                "created_at": artifact.get("created_at", ""),
            }, artifact)
            return artifact

    # ---- knowledge items ----

    def save_knowledge_item(self, item: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("knowledge_items", "knowledge_id", item["knowledge_id"], {
                "item_type": item.get("item_type", ""),
                "project_id": item.get("project_id", ""),
                "created_at": item.get("created_at", ""),
            }, item)
            return item

    def list_knowledge_items(self, limit: int = 50, item_type: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            if item_type:
                rows = self._query(
                    "SELECT data FROM knowledge_items WHERE item_type = ? ORDER BY created_at DESC LIMIT ?",
                    (item_type.strip(), limit),
                )
            else:
                rows = self._query(
                    "SELECT data FROM knowledge_items ORDER BY created_at DESC LIMIT ?",
                    (limit,),
                )
            return [json.loads(r["data"]) for r in rows]

    # ---- event logs ----

    def save_event_log(self, event: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("event_logs", "event_id", event["event_id"], {
                "created_at": event.get("created_at", ""),
                "level": event.get("level", ""),
                "module": event.get("module", ""),
                "event_type": event.get("event_type", ""),
                "project_id": event.get("project_id", ""),
                "trace_id": event.get("trace_id", ""),
                "source_id": event.get("source_id", ""),
                "title": event.get("title", ""),
                "message": event.get("message", ""),
            }, event)
            return event

    def get_event_log(self, event_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one("SELECT data FROM event_logs WHERE event_id = ?", (event_id,)))

    def list_event_logs(
        self,
        limit: int = 50,
        offset: int = 0,
        project_id: str | None = None,
        module: str | None = None,
        level: str | None = None,
        event_type: str | None = None,
        trace_id: str | None = None,
        keyword: str | None = None,
        start_at: str | None = None,
        end_at: str | None = None,
    ) -> list[dict[str, Any]]:
        where, params = self._event_log_where(project_id, module, level, event_type, trace_id, keyword, start_at, end_at)
        with self._lock:
            rows = self._query(
                f"SELECT data FROM event_logs WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                tuple(params) + (limit, offset),
            )
            return [json.loads(r["data"]) for r in rows]

    def count_event_logs(
        self,
        project_id: str | None = None,
        module: str | None = None,
        level: str | None = None,
        event_type: str | None = None,
        trace_id: str | None = None,
        keyword: str | None = None,
        start_at: str | None = None,
        end_at: str | None = None,
    ) -> int:
        where, params = self._event_log_where(project_id, module, level, event_type, trace_id, keyword, start_at, end_at)
        with self._lock:
            row = self._query_one(f"SELECT COUNT(*) AS count FROM event_logs WHERE {where}", tuple(params))
            return int(row["count"] if row else 0)

    def list_related_event_logs(self, event_id: str, limit: int = 20) -> list[dict[str, Any]]:
        with self._lock:
            event = self._row_to_data(self._query_one("SELECT data FROM event_logs WHERE event_id = ?", (event_id,)))
            if not event:
                return []
            refs = set(event.get("refs") or [])
            trace_id = event.get("trace_id") or ""
            source_id = event.get("source_id") or ""
            candidates = self._query(
                "SELECT data FROM event_logs WHERE event_id != ? ORDER BY created_at DESC LIMIT ?",
                (event_id, max(limit * 8, limit)),
            )
            related = []
            for row in candidates:
                item = json.loads(row["data"])
                item_refs = set(item.get("refs") or [])
                if (
                    (trace_id and item.get("trace_id") == trace_id)
                    or (source_id and item.get("source_id") == source_id)
                    or bool(refs.intersection(item_refs))
                ):
                    related.append(item)
                if len(related) >= limit:
                    break
            return related

    def summarize_event_logs(
        self,
        project_id: str | None = None,
        module: str | None = None,
        level: str | None = None,
        event_type: str | None = None,
        trace_id: str | None = None,
        keyword: str | None = None,
        start_at: str | None = None,
        end_at: str | None = None,
    ) -> dict[str, Any]:
        where, params = self._event_log_where(project_id, module, level, event_type, trace_id, keyword, start_at, end_at)
        with self._lock:
            total_row = self._query_one(f"SELECT COUNT(*) AS count FROM event_logs WHERE {where}", tuple(params))
            level_rows = self._query(
                f"SELECT level, COUNT(*) AS count FROM event_logs WHERE {where} GROUP BY level",
                tuple(params),
            )
            module_rows = self._query(
                f"SELECT module, COUNT(*) AS count FROM event_logs WHERE {where} GROUP BY module ORDER BY count DESC",
                tuple(params),
            )
            type_rows = self._query(
                f"SELECT event_type, COUNT(*) AS count FROM event_logs WHERE {where} GROUP BY event_type ORDER BY count DESC",
                tuple(params),
            )
            latest_error = self._query_one(
                f"SELECT created_at FROM event_logs WHERE {where} AND level = 'error' ORDER BY created_at DESC LIMIT 1",
                tuple(params),
            )
            level_counts = {row["level"]: int(row["count"]) for row in level_rows}
            return {
                "total": int(total_row["count"] if total_row else 0),
                "error_count": level_counts.get("error", 0),
                "warning_count": level_counts.get("warning", 0),
                "module_counts": [{"label": row["module"], "count": int(row["count"])} for row in module_rows],
                "event_type_counts": [{"label": row["event_type"], "count": int(row["count"])} for row in type_rows],
                "latest_error_at": latest_error["created_at"] if latest_error else "",
            }

    def _event_log_where(
        self,
        project_id: str | None,
        module: str | None,
        level: str | None,
        event_type: str | None,
        trace_id: str | None,
        keyword: str | None,
        start_at: str | None,
        end_at: str | None,
    ) -> tuple[str, list[Any]]:
        conditions = ["1=1"]
        params: list[Any] = []
        filters = {
            "project_id": project_id,
            "module": module,
            "level": level,
            "event_type": event_type,
            "trace_id": trace_id,
        }
        for column, value in filters.items():
            if value:
                conditions.append(f"{column} = ?")
                params.append(value.strip())
        if start_at:
            conditions.append("created_at >= ?")
            params.append(start_at.strip())
        if end_at:
            conditions.append("created_at <= ?")
            params.append(end_at.strip())
        if keyword:
            kw = f"%{keyword.lower().strip()}%"
            conditions.append("(LOWER(title) LIKE ? OR LOWER(message) LIKE ? OR LOWER(event_type) LIKE ? OR data LIKE ?)")
            params.extend([kw, kw, kw, kw])
        return " AND ".join(conditions), params

    # ---- recovery ----

    def recover_stale_runs(self) -> list[str]:
        with self._lock:
            rows = self._query("SELECT run_id, data FROM runs WHERE status IN ('queued', 'running')")
            recovered = []
            for row in rows:
                run = json.loads(row["data"])
                run["status"] = "failed"
                run["failure_reason"] = "服务重启，执行中断"
                run["finished_at"] = run.get("finished_at") or run.get("run_at", "")
                self._upsert("runs", "run_id", row["run_id"], {
                    "status": "failed",
                    "project_id": (run.get("execution_options") or {}).get("project_id", ""),
                    "case_id": run.get("case_id", ""),
                    "case_name": run.get("case_name", ""),
                    "run_at": run.get("run_at", ""),
                }, run)
                recovered.append(row["run_id"])
            return recovered

    # ---- async wrappers ----

    async def async_get_run(self, run_id: str) -> dict[str, Any] | None:
        return await run_in_threadpool(self.get_run, run_id)

    async def async_save_run(self, run: dict[str, Any]) -> dict[str, Any]:
        return await run_in_threadpool(self.save_run, run)

    async def async_update_run(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        return await run_in_threadpool(self.update_run, run_id, patch)

    async def async_update_run_atomic(
        self,
        run_id: str,
        updater: Callable[[dict[str, Any]], dict[str, Any] | None],
    ) -> dict[str, Any] | None:
        def _atomic() -> dict[str, Any] | None:
            with self._lock:
                row = self._query_one("SELECT data FROM runs WHERE run_id = ?", (run_id,))
                if not row:
                    return None
                existing = json.loads(row["data"])
                updated = updater(existing)
                if updated is None:
                    return None
                opts = updated.get("execution_options") or {}
                self._upsert("runs", "run_id", run_id, {
                    "status": updated.get("status", "queued"),
                    "project_id": opts.get("project_id", ""),
                    "case_id": updated.get("case_id", ""),
                    "case_name": updated.get("case_name", ""),
                    "run_at": updated.get("run_at", ""),
                }, updated)
                return updated

        return await run_in_threadpool(_atomic)

    async def async_list_runs(self, **kwargs: Any) -> list[dict[str, Any]]:
        return await run_in_threadpool(lambda: self.list_runs(**kwargs))

    async def async_delete_run(self, run_id: str) -> bool:
        return await run_in_threadpool(self.delete_run, run_id)

    async def async_save_policy_audit(self, audit: dict[str, Any]) -> dict[str, Any]:
        return await run_in_threadpool(self.save_policy_audit, audit)

    async def async_save_automation_task(self, task: dict[str, Any]) -> dict[str, Any]:
        return await run_in_threadpool(self.save_automation_task, task)

    async def async_save_knowledge_item(self, item: dict[str, Any]) -> dict[str, Any]:
        return await run_in_threadpool(self.save_knowledge_item, item)

    async def async_list_knowledge_items(self, **kwargs: Any) -> list[dict[str, Any]]:
        return await run_in_threadpool(lambda: self.list_knowledge_items(**kwargs))

    async def async_save_event_log(self, event: dict[str, Any]) -> dict[str, Any]:
        return await run_in_threadpool(self.save_event_log, event)

    # ---- migration from JSON ----

    def _migrate_one(self, table: str, id_col: str, entity_id: str, entity: dict) -> None:
        """Insert a single entity with indexed columns populated."""
        columns = self._extract_indexed_columns(table, entity)
        self._upsert(table, id_col, entity_id, columns, entity)

    def _extract_indexed_columns(self, table: str, entity: dict) -> dict[str, Any]:
        if table == "runs":
            opts = entity.get("execution_options") or {}
            return {
                "status": entity.get("status", "queued"),
                "project_id": opts.get("project_id", ""),
                "case_id": entity.get("case_id", ""),
                "case_name": entity.get("case_name", ""),
                "run_at": entity.get("run_at", ""),
            }
        if table == "projects":
            return {
                "name": entity.get("name", ""),
                "updated_at": entity.get("updated_at") or entity.get("created_at") or "",
            }
        if table == "environments":
            return {
                "project_id": entity.get("project_id", ""),
                "updated_at": entity.get("updated_at") or entity.get("created_at") or "",
            }
        if table == "specs":
            return {
                "source_url": entity.get("source_url", ""),
                "content_hash": entity.get("content_hash", ""),
                "parsed_at": entity.get("parsed_at", ""),
            }
        if table == "policy_audits":
            return {
                "project_id": entity.get("project_id", ""),
                "action": entity.get("action", ""),
                "created_at": entity.get("created_at", ""),
            }
        if table == "automation_tasks":
            return {
                "status": entity.get("status", ""),
                "project_id": entity.get("project_id", ""),
                "updated_at": entity.get("updated_at") or entity.get("created_at") or "",
                "created_at": entity.get("created_at") or "",
            }
        if table == "automation_definitions":
            return {
                "updated_at": entity.get("updated_at") or entity.get("created_at") or "",
            }
        if table == "automation_runs":
            return {"run_at": entity.get("run_at", "")}
        if table == "run_stage_events":
            return {"created_at": entity.get("created_at", "")}
        if table == "artifact_meta":
            return {"created_at": entity.get("created_at", "")}
        if table == "knowledge_items":
            return {
                "item_type": entity.get("item_type", ""),
                "project_id": entity.get("project_id", ""),
                "created_at": entity.get("created_at", ""),
            }
        if table == "event_logs":
            return {
                "created_at": entity.get("created_at", ""),
                "level": entity.get("level", ""),
                "module": entity.get("module", ""),
                "event_type": entity.get("event_type", ""),
                "project_id": entity.get("project_id", ""),
                "trace_id": entity.get("trace_id", ""),
                "source_id": entity.get("source_id", ""),
                "title": entity.get("title", ""),
                "message": entity.get("message", ""),
            }
        return {}

    def migrate_from_json(self, json_dir: Path) -> int:
        """Import all JSON data files into SQLite. Returns count of imported records."""
        total = 0
        table_file_map = [
            ("runs", "api_runs.json", "run_id"),
            ("projects", "projects.json", "project_id"),
            ("environments", "environments.json", "environment_id"),
            ("specs", "api_specs.json", "spec_id"),
            ("policy_audits", "policy_audits.json", "audit_id"),
            ("automation_tasks", "automation_tasks.json", "task_id"),
            ("automation_definitions", "automation_definitions.json", "definition_id"),
            ("automation_runs", "automation_runs.json", "automation_run_id"),
            ("run_stage_events", "run_stage_events.json", "event_id"),
            ("artifact_meta", "artifact_meta.json", "artifact_id"),
            ("knowledge_items", "knowledge_items.json", "knowledge_id"),
            ("event_logs", "event_logs.json", "event_id"),
        ]
        for table, filename, id_col in table_file_map:
            filepath = json_dir / filename
            if not filepath.exists():
                continue
            try:
                data = json.loads(filepath.read_text(encoding="utf-8"))
                if not isinstance(data, dict):
                    continue
                for entity_id, entity in data.items():
                    self._migrate_one(table, id_col, entity_id, entity)
                    total += 1
                self._conn.commit()
                logger.info("Migrated %d records from %s to SQLite", len(data), filename)
            except Exception as exc:
                logger.warning("Failed to migrate %s: %s", filename, exc)
        return total
