"""SQLite storage backend for API execution module.

Provides indexed queries, no record limits, and pagination support.
Uses the shared SQLite connection from app.storage.sqlite_store.
"""

import json
import logging
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.storage.sqlite_store import BaseSQLiteStore

logger = logging.getLogger(__name__)


class SQLiteStore(BaseSQLiteStore):
    """SQLite-backed storage for API execution. Same public API as APIExecutionStore."""

    _EVENT_LOG_PRUNE_INTERVAL_SECONDS = 300

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._last_event_log_prune_at = 0.0
        super().__init__(*args, **kwargs)

    def _init_schema(self) -> None:
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS runs (
                run_id TEXT PRIMARY KEY,
                status TEXT NOT NULL DEFAULT 'queued',
                project_id TEXT DEFAULT '',
                case_id TEXT DEFAULT '',
                case_name TEXT DEFAULT '',
                environment_name TEXT DEFAULT '',
                run_at TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_runs_status ON runs(status);
            CREATE INDEX IF NOT EXISTS idx_runs_project ON runs(project_id);
            CREATE INDEX IF NOT EXISTS idx_runs_at ON runs(run_at);
            CREATE INDEX IF NOT EXISTS idx_runs_status_at ON runs(status, run_at);
            CREATE INDEX IF NOT EXISTS idx_runs_project_at ON runs(project_id, run_at);
            CREATE INDEX IF NOT EXISTS idx_runs_project_status_at ON runs(project_id, status, run_at);

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
            CREATE INDEX IF NOT EXISTS idx_tasks_status_updated ON automation_tasks(status, updated_at);
            CREATE INDEX IF NOT EXISTS idx_tasks_project_status_updated ON automation_tasks(project_id, status, updated_at);

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
                status TEXT DEFAULT '',
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
            CREATE INDEX IF NOT EXISTS idx_event_logs_project_created ON event_logs(project_id, created_at);
            CREATE INDEX IF NOT EXISTS idx_event_logs_module_created ON event_logs(module, created_at);
            CREATE INDEX IF NOT EXISTS idx_event_logs_level_created ON event_logs(level, created_at);
            CREATE INDEX IF NOT EXISTS idx_event_logs_project_module_created ON event_logs(project_id, module, created_at);

            CREATE TABLE IF NOT EXISTS ai_call_logs (
                call_id TEXT PRIMARY KEY,
                created_at TEXT DEFAULT '',
                feature TEXT DEFAULT '',
                operation TEXT DEFAULT '',
                provider TEXT DEFAULT '',
                model TEXT DEFAULT '',
                status TEXT DEFAULT '',
                degraded INTEGER DEFAULT 0,
                trace_id TEXT DEFAULT '',
                source_id TEXT DEFAULT '',
                latency_ms INTEGER DEFAULT 0,
                prompt_chars INTEGER DEFAULT 0,
                response_chars INTEGER DEFAULT 0,
                input_tokens INTEGER DEFAULT 0,
                output_tokens INTEGER DEFAULT 0,
                total_tokens INTEGER DEFAULT 0,
                failure_reason TEXT DEFAULT '',
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_ai_call_logs_created_at ON ai_call_logs(created_at);
            CREATE INDEX IF NOT EXISTS idx_ai_call_logs_feature ON ai_call_logs(feature);
            CREATE INDEX IF NOT EXISTS idx_ai_call_logs_operation ON ai_call_logs(operation);
            CREATE INDEX IF NOT EXISTS idx_ai_call_logs_model ON ai_call_logs(model);
            CREATE INDEX IF NOT EXISTS idx_ai_call_logs_status ON ai_call_logs(status);
            CREATE INDEX IF NOT EXISTS idx_ai_call_logs_trace ON ai_call_logs(trace_id);
            CREATE INDEX IF NOT EXISTS idx_ai_call_logs_feature_created ON ai_call_logs(feature, created_at);
            CREATE INDEX IF NOT EXISTS idx_ai_call_logs_status_created ON ai_call_logs(status, created_at);
            CREATE INDEX IF NOT EXISTS idx_ai_call_logs_degraded_created ON ai_call_logs(degraded, created_at);

            CREATE TABLE IF NOT EXISTS ai_debug_settings (
                key TEXT PRIMARY KEY,
                data TEXT NOT NULL
            );
        """)
        self._ensure_column("runs", "environment_name", "TEXT DEFAULT ''")
        self._conn.execute(
            """
            UPDATE runs
            SET environment_name = COALESCE(json_extract(data, '$.execution_options.environment_snapshot.name'), '')
            WHERE environment_name = ''
            """
        )
        self._conn.execute("CREATE INDEX IF NOT EXISTS idx_runs_environment_name ON runs(environment_name)")
        self._ensure_column("knowledge_items", "status", "TEXT DEFAULT ''")
        self._conn.execute(
            """
            UPDATE knowledge_items
            SET status = COALESCE(NULLIF(json_extract(data, '$.status'), ''), 'active')
            WHERE status = ''
            """
        )
        self._conn.executescript("""
            CREATE INDEX IF NOT EXISTS idx_knowledge_status ON knowledge_items(status);
            CREATE INDEX IF NOT EXISTS idx_knowledge_project_status_created ON knowledge_items(project_id, status, created_at);
            CREATE INDEX IF NOT EXISTS idx_knowledge_type_status_created ON knowledge_items(item_type, status, created_at);
        """)
        self._conn.commit()

    # ---- specs ----

    @staticmethod
    def _safe_page(limit: int, offset: int = 0, max_limit: int = 200) -> tuple[int, int]:
        return max(1, min(int(limit or 1), max_limit)), max(0, int(offset or 0))

    def _ensure_column(self, table: str, column: str, definition: str) -> None:
        columns = {row["name"] for row in self._query(f"PRAGMA table_info({table})")}
        if column not in columns:
            self._conn.execute(f"ALTER TABLE {table} ADD COLUMN {column} {definition}")
            self._conn.commit()

    @staticmethod
    def _run_index_columns(run: dict[str, Any]) -> dict[str, str]:
        opts = run.get("execution_options") or {}
        environment_snapshot = opts.get("environment_snapshot") or {}
        return {
            "status": run.get("status", "queued"),
            "project_id": opts.get("project_id", ""),
            "case_id": run.get("case_id", ""),
            "case_name": run.get("case_name", ""),
            "environment_name": environment_snapshot.get("name", ""),
            "run_at": run.get("run_at", ""),
        }

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
            self._upsert("runs", "run_id", run["run_id"], self._run_index_columns(run), run)
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
            self._upsert("runs", "run_id", run_id, self._run_index_columns(merged), merged)
            return merged

    def list_runs(
        self,
        limit: int = 20,
        status: str | None = None,
        keyword: str | None = None,
        project_id: str | None = None,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        safe_limit, safe_offset = self._safe_page(limit, offset, max_limit=200)
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
                    "(LOWER(case_name) LIKE ? OR LOWER(case_id) LIKE ? OR LOWER(run_id) LIKE ? OR LOWER(environment_name) LIKE ?)"
                )
                params.extend([f"%{kw}%", f"%{kw}%", f"%{kw}%", f"%{kw}%"])
            where = " AND ".join(conditions)
            rows = self._query(
                f"SELECT data FROM runs WHERE {where} ORDER BY run_at DESC LIMIT ? OFFSET ?",
                tuple(params) + (safe_limit, safe_offset),
            )
            return [json.loads(r["data"]) for r in rows]

    def count_runs(
        self,
        status: str | None = None,
        keyword: str | None = None,
        project_id: str | None = None,
    ) -> int:
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
                    "(LOWER(case_name) LIKE ? OR LOWER(case_id) LIKE ? OR LOWER(run_id) LIKE ? OR LOWER(environment_name) LIKE ?)"
                )
                params.extend([f"%{kw}%", f"%{kw}%", f"%{kw}%", f"%{kw}%"])
            where = " AND ".join(conditions)
            row = self._query_one(f"SELECT COUNT(*) AS count FROM runs WHERE {where}", tuple(params))
            return int(row["count"] if row else 0)

    def delete_run(self, run_id: str) -> bool:
        with self._lock:
            cursor = self._conn.execute("DELETE FROM runs WHERE run_id = ?", (run_id,))
            self._conn.commit()
            return cursor.rowcount > 0

    def delete_all_runs(self) -> int:
        with self._lock:
            cursor = self._conn.execute("DELETE FROM runs")
            self._conn.commit()
            return cursor.rowcount

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
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        safe_limit, safe_offset = self._safe_page(limit, offset, max_limit=200)
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
                f"SELECT data FROM automation_tasks WHERE {where} ORDER BY updated_at DESC LIMIT ? OFFSET ?",
                tuple(params) + (safe_limit, safe_offset),
            )
            return [json.loads(r["data"]) for r in rows]

    def count_automation_tasks(
        self,
        status: str | None = None,
        project_id: str | None = None,
    ) -> int:
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
            row = self._query_one(f"SELECT COUNT(*) AS count FROM automation_tasks WHERE {where}", tuple(params))
            return int(row["count"] if row else 0)

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
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        with self._lock:
            rows = self._query(
                "SELECT data FROM automation_definitions ORDER BY updated_at DESC LIMIT ?",
                (max((limit + offset) * 3, limit + offset),),
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
            return definitions[offset:offset + limit]

    def count_automation_definitions(
        self,
        project_id: str | None = None,
        definition_type: str | None = None,
    ) -> int:
        with self._lock:
            rows = self._query("SELECT data FROM automation_definitions", ())
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
            return len(definitions)

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
                "status": item.get("status", "") or "active",
                "created_at": item.get("created_at", ""),
            }, item)
            return item

    def list_knowledge_items(
        self,
        limit: int = 50,
        item_type: str | None = None,
        offset: int = 0,
        project_id: str | None = None,
        status: str | None = None,
    ) -> list[dict[str, Any]]:
        safe_limit, safe_offset = self._safe_page(limit, offset, max_limit=500)
        with self._lock:
            conditions = ["1=1"]
            params: list[Any] = []
            if item_type:
                conditions.append("item_type = ?")
                params.append(item_type.strip())
            if project_id:
                conditions.append("(project_id = ? OR project_id = '')")
                params.append(project_id.strip())
            if status:
                conditions.append("status = ?")
                params.append(status.strip())
            where = " AND ".join(conditions)
            rows = self._query(
                f"SELECT data FROM knowledge_items WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                tuple(params) + (safe_limit, safe_offset),
            )
            return [json.loads(r["data"]) for r in rows]

    def count_knowledge_items(
        self,
        item_type: str | None = None,
        project_id: str | None = None,
        status: str | None = None,
    ) -> int:
        with self._lock:
            conditions = ["1=1"]
            params: list[Any] = []
            if item_type:
                conditions.append("item_type = ?")
                params.append(item_type.strip())
            if project_id:
                conditions.append("(project_id = ? OR project_id = '')")
                params.append(project_id.strip())
            if status:
                conditions.append("status = ?")
                params.append(status.strip())
            where = " AND ".join(conditions)
            row = self._query_one(f"SELECT COUNT(*) AS count FROM knowledge_items WHERE {where}", tuple(params))
            return int(row["count"] if row else 0)

    def delete_knowledge_item(self, knowledge_id: str) -> bool:
        with self._lock:
            cursor = self._conn.execute("DELETE FROM knowledge_items WHERE knowledge_id = ?", (knowledge_id,))
            self._conn.commit()
            return cursor.rowcount > 0

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
            self._maybe_prune_event_logs_locked()
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
        safe_limit, safe_offset = self._safe_page(limit, offset, max_limit=200)
        where, params = self._event_log_where(project_id, module, level, event_type, trace_id, keyword, start_at, end_at)
        with self._lock:
            rows = self._query(
                f"SELECT data FROM event_logs WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                tuple(params) + (safe_limit, safe_offset),
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
        safe_limit, _ = self._safe_page(limit, max_limit=100)
        with self._lock:
            event = self._row_to_data(self._query_one("SELECT data FROM event_logs WHERE event_id = ?", (event_id,)))
            if not event:
                return []
            refs = set(event.get("refs") or [])
            trace_id = event.get("trace_id") or ""
            source_id = event.get("source_id") or ""
            candidates = self._query(
                "SELECT data FROM event_logs WHERE event_id != ? ORDER BY created_at DESC LIMIT ?",
                (event_id, max(safe_limit * 8, safe_limit)),
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
                if len(related) >= safe_limit:
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

    def delete_event_logs(
        self,
        *,
        older_than: str | None = None,
        level: str | None = None,
        project_id: str | None = None,
        module: str | None = None,
    ) -> int:
        conditions = ["1=1"]
        params: list[Any] = []
        if older_than:
            conditions.append("created_at < ?")
            params.append(older_than.strip())
        if project_id:
            conditions.append("project_id = ?")
            params.append(project_id.strip())
        if module:
            conditions.append("module = ?")
            params.append(module.strip())
        if level == "non_error":
            conditions.append("level != 'error'")
        elif level in {"info", "warning", "error"}:
            conditions.append("level = ?")
            params.append(level)
        with self._lock:
            cursor = self._conn.execute(f"DELETE FROM event_logs WHERE {' AND '.join(conditions)}", tuple(params))
            self._conn.commit()
            return int(cursor.rowcount or 0)

    def prune_event_logs(
        self,
        *,
        retention_days: int | None = None,
        max_rows: int | None = None,
    ) -> dict[str, int]:
        with self._lock:
            return self._prune_event_logs_locked(retention_days=retention_days, max_rows=max_rows)

    def _maybe_prune_event_logs_locked(self) -> None:
        now = time.monotonic()
        if now - self._last_event_log_prune_at < self._EVENT_LOG_PRUNE_INTERVAL_SECONDS:
            return
        self._last_event_log_prune_at = now
        self._prune_event_logs_locked()

    def _prune_event_logs_locked(
        self,
        *,
        retention_days: int | None = None,
        max_rows: int | None = None,
    ) -> dict[str, int]:
        retention_value = retention_days if retention_days is not None else settings.EVENT_LOG_RETENTION_DAYS
        max_rows_value = max_rows if max_rows is not None else settings.EVENT_LOG_MAX_ROWS
        safe_retention_days = max(1, int(retention_value))
        safe_max_rows = max(1000, int(max_rows_value))
        cutoff = (datetime.now(UTC) - timedelta(days=safe_retention_days)).isoformat().replace("+00:00", "Z")
        age_cursor = self._conn.execute(
            "DELETE FROM event_logs WHERE created_at < ? AND level != 'error'",
            (cutoff,),
        )
        age_deleted = int(age_cursor.rowcount or 0)
        count_row = self._query_one("SELECT COUNT(*) AS count FROM event_logs")
        total = int(count_row["count"] if count_row else 0)
        overflow_deleted = 0
        if total > safe_max_rows:
            overflow_cursor = self._conn.execute(
                """
                DELETE FROM event_logs
                WHERE level != 'error'
                  AND event_id IN (
                    SELECT event_id FROM event_logs
                    WHERE level != 'error'
                    ORDER BY created_at DESC
                    LIMIT -1 OFFSET ?
                  )
                """,
                (safe_max_rows,),
            )
            overflow_deleted = int(overflow_cursor.rowcount or 0)
        self._conn.commit()
        remaining_row = self._query_one("SELECT COUNT(*) AS count FROM event_logs")
        remaining = int(remaining_row["count"] if remaining_row else 0)
        return {"deleted": age_deleted + overflow_deleted, "age_deleted": age_deleted, "overflow_deleted": overflow_deleted, "remaining": remaining}

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
            conditions.append(
                "(LOWER(title) LIKE ? OR LOWER(message) LIKE ? OR LOWER(event_type) LIKE ? "
                "OR LOWER(trace_id) LIKE ? OR LOWER(source_id) LIKE ? OR LOWER(project_id) LIKE ?)"
            )
            params.extend([kw, kw, kw, kw, kw, kw])
        return " AND ".join(conditions), params

    # ---- AI call observability ----

    def save_ai_call_log(self, record: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("ai_call_logs", "call_id", record["call_id"], {
                "created_at": record.get("created_at", ""),
                "feature": record.get("feature", ""),
                "operation": record.get("operation", ""),
                "provider": record.get("provider", ""),
                "model": record.get("model", ""),
                "status": record.get("status", ""),
                "degraded": 1 if record.get("degraded") else 0,
                "trace_id": record.get("trace_id", ""),
                "source_id": record.get("source_id", ""),
                "latency_ms": int(record.get("latency_ms") or 0),
                "prompt_chars": int(record.get("prompt_chars") or 0),
                "response_chars": int(record.get("response_chars") or 0),
                "input_tokens": int(record.get("input_tokens") or 0),
                "output_tokens": int(record.get("output_tokens") or 0),
                "total_tokens": int(record.get("total_tokens") or 0),
                "failure_reason": record.get("failure_reason", ""),
            }, record)
            return record

    def get_ai_call_log(self, call_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one("SELECT data FROM ai_call_logs WHERE call_id = ?", (call_id,)))

    def list_ai_call_logs(
        self,
        limit: int = 50,
        offset: int = 0,
        feature: str | None = None,
        operation: str | None = None,
        model: str | None = None,
        status: str | None = None,
        degraded: bool | None = None,
        keyword: str | None = None,
        start_at: str | None = None,
        end_at: str | None = None,
    ) -> list[dict[str, Any]]:
        safe_limit, safe_offset = self._safe_page(limit, offset, max_limit=200)
        where, params = self._ai_call_where(feature, operation, model, status, degraded, keyword, start_at, end_at)
        with self._lock:
            rows = self._query(
                f"SELECT data FROM ai_call_logs WHERE {where} ORDER BY created_at DESC LIMIT ? OFFSET ?",
                tuple(params) + (safe_limit, safe_offset),
            )
            return [json.loads(r["data"]) for r in rows]

    def count_ai_call_logs(
        self,
        feature: str | None = None,
        operation: str | None = None,
        model: str | None = None,
        status: str | None = None,
        degraded: bool | None = None,
        keyword: str | None = None,
        start_at: str | None = None,
        end_at: str | None = None,
    ) -> int:
        where, params = self._ai_call_where(feature, operation, model, status, degraded, keyword, start_at, end_at)
        with self._lock:
            row = self._query_one(f"SELECT COUNT(*) AS count FROM ai_call_logs WHERE {where}", tuple(params))
            return int(row["count"] if row else 0)

    def summarize_ai_call_logs(
        self,
        feature: str | None = None,
        operation: str | None = None,
        model: str | None = None,
        status: str | None = None,
        degraded: bool | None = None,
        keyword: str | None = None,
        start_at: str | None = None,
        end_at: str | None = None,
    ) -> dict[str, Any]:
        where, params = self._ai_call_where(feature, operation, model, status, degraded, keyword, start_at, end_at)
        with self._lock:
            total_row = self._query_one(f"SELECT COUNT(*) AS count FROM ai_call_logs WHERE {where}", tuple(params))
            aggregate = self._query_one(
                f"""
                SELECT
                    AVG(latency_ms) AS avg_latency_ms,
                    SUM(prompt_chars) AS prompt_chars,
                    SUM(response_chars) AS response_chars,
                    SUM(input_tokens) AS input_tokens,
                    SUM(output_tokens) AS output_tokens,
                    SUM(total_tokens) AS total_tokens,
                    SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) AS failed_count,
                    SUM(CASE WHEN degraded = 1 THEN 1 ELSE 0 END) AS degraded_count
                FROM ai_call_logs WHERE {where}
                """,
                tuple(params),
            )
            model_rows = self._query(
                f"SELECT model, COUNT(*) AS count FROM ai_call_logs WHERE {where} GROUP BY model ORDER BY count DESC",
                tuple(params),
            )
            feature_rows = self._query(
                f"SELECT feature, COUNT(*) AS count FROM ai_call_logs WHERE {where} GROUP BY feature ORDER BY count DESC",
                tuple(params),
            )
            failure_rows = self._query(
                f"""
                SELECT failure_reason, COUNT(*) AS count
                FROM ai_call_logs
                WHERE {where} AND failure_reason != ''
                GROUP BY failure_reason
                ORDER BY count DESC
                LIMIT 8
                """,
                tuple(params),
            )
            total = int(total_row["count"] if total_row else 0)
            aggregate = dict(aggregate or {})
            failed_count = aggregate.get("failed_count") or 0
            degraded_count = aggregate.get("degraded_count") or 0
            return {
                "total": total,
                "failed_count": int(failed_count),
                "degraded_count": int(degraded_count),
                "avg_latency_ms": round(float(aggregate.get("avg_latency_ms") or 0)),
                "prompt_chars": int(aggregate.get("prompt_chars") or 0),
                "response_chars": int(aggregate.get("response_chars") or 0),
                "input_tokens": int(aggregate.get("input_tokens") or 0),
                "output_tokens": int(aggregate.get("output_tokens") or 0),
                "total_tokens": int(aggregate.get("total_tokens") or 0),
                "model_counts": [{"label": row["model"] or "unknown", "count": int(row["count"])} for row in model_rows],
                "feature_counts": [{"label": row["feature"] or "unknown", "count": int(row["count"])} for row in feature_rows],
                "failure_reason_counts": [{"label": row["failure_reason"], "count": int(row["count"])} for row in failure_rows],
            }

    def _ai_call_where(
        self,
        feature: str | None,
        operation: str | None,
        model: str | None,
        status: str | None,
        degraded: bool | None,
        keyword: str | None,
        start_at: str | None,
        end_at: str | None,
    ) -> tuple[str, list[Any]]:
        conditions = ["1=1"]
        params: list[Any] = []
        for column, value in {
            "feature": feature,
            "operation": operation,
            "model": model,
            "status": status,
        }.items():
            if value:
                conditions.append(f"{column} = ?")
                params.append(value.strip())
        if degraded is not None:
            conditions.append("degraded = ?")
            params.append(1 if degraded else 0)
        if start_at:
            conditions.append("created_at >= ?")
            params.append(start_at.strip())
        if end_at:
            conditions.append("created_at <= ?")
            params.append(end_at.strip())
        if keyword:
            kw = f"%{keyword.lower().strip()}%"
            conditions.append(
                "(LOWER(feature) LIKE ? OR LOWER(operation) LIKE ? OR LOWER(model) LIKE ? "
                "OR LOWER(status) LIKE ? OR LOWER(failure_reason) LIKE ? OR LOWER(trace_id) LIKE ? OR LOWER(source_id) LIKE ?)"
            )
            params.extend([kw, kw, kw, kw, kw, kw, kw])
        return " AND ".join(conditions), params

    def get_ai_debug_settings(self) -> dict[str, Any]:
        with self._lock:
            row = self._query_one("SELECT data FROM ai_debug_settings WHERE key = 'settings'")
            if not row:
                return {"enabled": False, "retention_minutes": 30, "max_chars": 4000, "updated_at": ""}
            data = json.loads(row["data"])
            return {
                "enabled": bool(data.get("enabled")),
                "retention_minutes": int(data.get("retention_minutes") or 30),
                "max_chars": int(data.get("max_chars") or 4000),
                "updated_at": data.get("updated_at", ""),
            }

    def save_ai_debug_settings(self, settings_data: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._conn.execute(
                "INSERT OR REPLACE INTO ai_debug_settings (key, data) VALUES ('settings', ?)",
                (json.dumps(settings_data, ensure_ascii=False),),
            )
            self._conn.commit()
            return settings_data

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
                self._upsert("runs", "run_id", row["run_id"], self._run_index_columns(run), run)
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
                self._upsert("runs", "run_id", run_id, self._run_index_columns(updated), updated)
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
