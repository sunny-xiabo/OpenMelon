"""SQLite storage backend for API execution module.

Provides indexed queries, no record limits, and pagination support.
Uses the shared SQLite connection from app.storage.sqlite_store.
"""

import json
import time
from collections.abc import Callable
from datetime import UTC, datetime, timedelta
from pathlib import Path
from typing import Any

from starlette.concurrency import run_in_threadpool

from app.config import settings
from app.api_execution.sqlite_filters import build_ai_call_where, build_event_log_where
from app.api_execution.sqlite_migration import migrate_json_seed_files
from app.api_execution.sqlite_schema import API_EXECUTION_SCHEMA_SQL
from app.storage.sqlite_store import BaseSQLiteStore


class SQLiteStore(BaseSQLiteStore):
    """SQLite-backed storage for API execution. Same public API as APIExecutionStore."""

    _EVENT_LOG_PRUNE_INTERVAL_SECONDS = 300

    def __init__(self, *args: Any, **kwargs: Any) -> None:
        self._last_event_log_prune_at = 0.0
        super().__init__(*args, **kwargs)

    def _init_schema(self) -> None:
        self._conn.executescript(API_EXECUTION_SCHEMA_SQL)
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
        if column not in self._table_columns(table):
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

    # ---- API asset catalog ----

    @staticmethod
    def _module_index_columns(module: dict[str, Any]) -> dict[str, Any]:
        return {
            "project_id": module.get("project_id", ""),
            "module_key": module.get("module_key", ""),
            "name": module.get("name", ""),
            "status": module.get("status", "active"),
            "sort_order": int(module.get("sort_order") or 100),
            "updated_at": module.get("updated_at", ""),
        }

    @staticmethod
    def _interface_index_columns(interface: dict[str, Any]) -> dict[str, Any]:
        return {
            "project_id": interface.get("project_id", ""),
            "module_id": interface.get("module_id", ""),
            "interface_key": interface.get("interface_key", ""),
            "method": interface.get("method", ""),
            "path": interface.get("path", ""),
            "operation_id": interface.get("operation_id", ""),
            "summary": interface.get("summary", ""),
            "risk_level": interface.get("risk_level", ""),
            "status": interface.get("status", "active"),
            "current_spec_id": interface.get("current_spec_id", ""),
            "current_hash": interface.get("current_hash", ""),
            "last_seen_at": interface.get("last_seen_at", ""),
        }

    @staticmethod
    def _spec_version_index_columns(version: dict[str, Any]) -> dict[str, Any]:
        return {
            "project_id": version.get("project_id", ""),
            "spec_id": version.get("spec_id", ""),
            "source_type": version.get("source_type", ""),
            "source_url": version.get("source_url", ""),
            "filename": version.get("filename", ""),
            "content_hash": version.get("content_hash", ""),
            "imported_at": version.get("imported_at", ""),
            "operation_count": int(version.get("operation_count") or 0),
        }

    def save_api_module(self, module: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert("api_modules", "module_id", module["module_id"], self._module_index_columns(module), module)
            return module

    def get_api_module(self, module_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one("SELECT data FROM api_modules WHERE module_id = ?", (module_id,)))

    def get_api_module_by_key(self, project_id: str, module_key: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._query_one(
                "SELECT data FROM api_modules WHERE project_id = ? AND module_key = ? LIMIT 1",
                (project_id, module_key),
            )
            return self._row_to_data(row)

    def list_api_modules(self, project_id: str, status: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            conditions = ["project_id = ?"]
            params: list[Any] = [project_id]
            if status:
                conditions.append("status = ?")
                params.append(status)
            rows = self._query(
                f"SELECT data FROM api_modules WHERE {' AND '.join(conditions)} ORDER BY sort_order ASC, name ASC",
                tuple(params),
            )
            return [json.loads(r["data"]) for r in rows]

    def save_api_interface(self, interface: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert(
                "api_interfaces",
                "interface_id",
                interface["interface_id"],
                self._interface_index_columns(interface),
                interface,
            )
            return interface

    def get_api_interface(self, interface_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._row_to_data(self._query_one("SELECT data FROM api_interfaces WHERE interface_id = ?", (interface_id,)))

    def get_api_interface_by_key(self, project_id: str, interface_key: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._query_one(
                "SELECT data FROM api_interfaces WHERE project_id = ? AND interface_key = ? LIMIT 1",
                (project_id, interface_key),
            )
            return self._row_to_data(row)

    def delete_api_interface(self, interface_id: str) -> bool:
        with self._lock:
            existed = self._query_one("SELECT 1 FROM api_interfaces WHERE interface_id = ?", (interface_id,)) is not None
            self._execute("DELETE FROM api_interfaces WHERE interface_id = ?", (interface_id,))
            return existed

    def list_api_interfaces(
        self,
        project_id: str,
        *,
        module_id: str | None = None,
        status: str | None = None,
        risk_level: str | None = None,
        keyword: str | None = None,
        limit: int = 500,
        offset: int = 0,
    ) -> list[dict[str, Any]]:
        safe_limit, safe_offset = self._safe_page(limit, offset, max_limit=1000)
        with self._lock:
            conditions = ["project_id = ?"]
            params: list[Any] = [project_id]
            if module_id:
                conditions.append("module_id = ?")
                params.append(module_id)
            if status:
                conditions.append("status = ?")
                params.append(status)
            if risk_level:
                conditions.append("risk_level = ?")
                params.append(risk_level)
            if keyword:
                kw = f"%{keyword.lower().strip()}%"
                conditions.append("(LOWER(interface_key) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(operation_id) LIKE ?)")
                params.extend([kw, kw, kw])
            rows = self._query(
                f"""
                SELECT data FROM api_interfaces
                WHERE {' AND '.join(conditions)}
                ORDER BY module_id ASC, method ASC, path ASC
                LIMIT ? OFFSET ?
                """,
                tuple(params) + (safe_limit, safe_offset),
            )
            return [json.loads(r["data"]) for r in rows]

    def count_api_interfaces(
        self,
        project_id: str,
        *,
        module_id: str | None = None,
        status: str | None = None,
        risk_level: str | None = None,
        keyword: str | None = None,
    ) -> int:
        with self._lock:
            conditions = ["project_id = ?"]
            params: list[Any] = [project_id]
            if module_id:
                conditions.append("module_id = ?")
                params.append(module_id)
            if status:
                conditions.append("status = ?")
                params.append(status)
            if risk_level:
                conditions.append("risk_level = ?")
                params.append(risk_level)
            if keyword:
                kw = f"%{keyword.lower().strip()}%"
                conditions.append("(LOWER(interface_key) LIKE ? OR LOWER(summary) LIKE ? OR LOWER(operation_id) LIKE ?)")
                params.extend([kw, kw, kw])
            row = self._query_one(f"SELECT COUNT(*) AS count FROM api_interfaces WHERE {' AND '.join(conditions)}", tuple(params))
            return int(row["count"] if row else 0)

    def save_api_spec_version(self, version: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            self._upsert(
                "api_spec_versions",
                "spec_version_id",
                version["spec_version_id"],
                self._spec_version_index_columns(version),
                version,
            )
            return version

    def list_api_spec_versions(self, project_id: str, limit: int = 20) -> list[dict[str, Any]]:
        safe_limit, _ = self._safe_page(limit, max_limit=100)
        with self._lock:
            rows = self._query(
                "SELECT data FROM api_spec_versions WHERE project_id = ? ORDER BY imported_at DESC LIMIT ?",
                (project_id, safe_limit),
            )
            return [json.loads(r["data"]) for r in rows]

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
            self._conn.execute("DELETE FROM api_modules WHERE project_id = ?", (project_id,))
            self._conn.execute("DELETE FROM api_interfaces WHERE project_id = ?", (project_id,))
            self._conn.execute("DELETE FROM api_spec_versions WHERE project_id = ?", (project_id,))
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
        where, params = build_event_log_where(project_id, module, level, event_type, trace_id, keyword, start_at, end_at)
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
        where, params = build_event_log_where(project_id, module, level, event_type, trace_id, keyword, start_at, end_at)
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
        where, params = build_event_log_where(project_id, module, level, event_type, trace_id, keyword, start_at, end_at)
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
        where, params = build_ai_call_where(feature, operation, model, status, degraded, keyword, start_at, end_at)
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
        where, params = build_ai_call_where(feature, operation, model, status, degraded, keyword, start_at, end_at)
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
        where, params = build_ai_call_where(feature, operation, model, status, degraded, keyword, start_at, end_at)
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
            self._replace(
                "ai_debug_settings",
                {"key": "settings", "data": json.dumps(settings_data, ensure_ascii=False)},
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

    def migrate_from_json(self, json_dir: Path) -> int:
        """Import all JSON data files into SQLite. Returns count of imported records."""
        return migrate_json_seed_files(json_dir, self._upsert, self._conn.commit)
