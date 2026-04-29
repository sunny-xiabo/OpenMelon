import json
import os
import tempfile
from pathlib import Path
from threading import Lock
from typing import Any

MAX_SAVED_SPECS = 20
MAX_SAVED_RUNS = 50
MAX_SAVED_AUDITS = 200
MAX_SAVED_AUTOMATION_TASKS = 200
MAX_SAVED_AUTOMATION_RECORDS = 300
MAX_SAVED_KNOWLEDGE_ITEMS = 500


class APIExecutionStore:
    def __init__(self, data_dir: Path | None = None) -> None:
        self._lock = Lock()
        self._data_dir = data_dir or Path(__file__).resolve().parent.parent / "data" / "api_execution"
        self._specs_file = self._data_dir / "api_specs.json"
        self._runs_file = self._data_dir / "api_runs.json"
        self._projects_file = self._data_dir / "projects.json"
        self._environments_file = self._data_dir / "environments.json"
        self._audits_file = self._data_dir / "policy_audits.json"
        self._automation_tasks_file = self._data_dir / "automation_tasks.json"
        self._automation_definitions_file = self._data_dir / "automation_definitions.json"
        self._automation_runs_file = self._data_dir / "automation_runs.json"
        self._run_stage_events_file = self._data_dir / "run_stage_events.json"
        self._artifact_meta_file = self._data_dir / "artifact_meta.json"
        self._knowledge_items_file = self._data_dir / "knowledge_items.json"

    def save_spec(self, spec: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_specs_no_lock()
            data[spec["spec_id"]] = spec
            data = self._trim_specs(data)
            self._write_json_atomic(self._specs_file, data)
            return spec

    def get_spec(self, spec_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._read_specs_no_lock().get(spec_id)

    def get_spec_by_content_hash(self, content_hash: str) -> dict[str, Any] | None:
        with self._lock:
            for spec in self._read_specs_no_lock().values():
                if spec.get("content_hash") == content_hash:
                    return spec
            return None

    def get_latest_spec_by_source_url(self, source_url: str) -> dict[str, Any] | None:
        with self._lock:
            matches = [
                spec
                for spec in self._read_specs_no_lock().values()
                if spec.get("source_url") == source_url
            ]
            if not matches:
                return None
            return max(matches, key=lambda item: item.get("parsed_at", ""))

    def save_run(self, run: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_runs_no_lock()
            data[run["run_id"]] = run
            data = self._trim_runs(data)
            self._write_json_atomic(self._runs_file, data)
            return run

    def save_project(self, project: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_projects_no_lock()
            data[project["project_id"]] = project
            self._write_json_atomic(self._projects_file, data)
            return project

    def get_project(self, project_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._read_projects_no_lock().get(project_id)

    def list_projects(self) -> list[dict[str, Any]]:
        with self._lock:
            return sorted(
                self._read_projects_no_lock().values(),
                key=lambda item: item.get("updated_at") or item.get("created_at") or "",
                reverse=True,
            )

    def delete_project(self, project_id: str) -> bool:
        with self._lock:
            projects = self._read_projects_no_lock()
            if project_id not in projects:
                return False
            del projects[project_id]
            environments = {
                env_id: env
                for env_id, env in self._read_environments_no_lock().items()
                if env.get("project_id") != project_id
            }
            self._write_json_atomic(self._projects_file, projects)
            self._write_json_atomic(self._environments_file, environments)
            return True

    def save_environment(self, environment: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_environments_no_lock()
            data[environment["environment_id"]] = environment
            self._write_json_atomic(self._environments_file, data)
            return environment

    def get_environment(self, environment_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._read_environments_no_lock().get(environment_id)

    def list_environments(self, project_id: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            environments = [
                env
                for env in self._read_environments_no_lock().values()
                if not project_id or env.get("project_id") == project_id
            ]
            return sorted(
                environments,
                key=lambda item: item.get("updated_at") or item.get("created_at") or "",
                reverse=True,
            )

    def delete_environment(self, environment_id: str) -> bool:
        with self._lock:
            data = self._read_environments_no_lock()
            if environment_id not in data:
                return False
            del data[environment_id]
            self._write_json_atomic(self._environments_file, data)
            return True

    def get_run(self, run_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._read_runs_no_lock().get(run_id)

    def update_run(self, run_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            data = self._read_runs_no_lock()
            if run_id not in data:
                return None
            data[run_id] = {**data[run_id], **patch}
            data = self._trim_runs(data)
            self._write_json_atomic(self._runs_file, data)
            return data.get(run_id)

    def list_runs(
        self,
        limit: int = 20,
        status: str | None = None,
        keyword: str | None = None,
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            lowered_keyword = keyword.lower().strip() if keyword else ""
            scoped_project_id = project_id.strip() if project_id else ""
            runs = sorted(
                [
                    run
                    for run in self._read_runs_no_lock().values()
                    if (not status or run.get("status") == status)
                    and (
                        not scoped_project_id
                        or (run.get("execution_options") or {}).get("project_id") == scoped_project_id
                    )
                    and (
                        not lowered_keyword
                        or lowered_keyword in str(run.get("case_name", "")).lower()
                        or lowered_keyword in str(run.get("case_id", "")).lower()
                        or lowered_keyword in str(run.get("target_project", "")).lower()
                        or lowered_keyword in str(run.get("mode", "")).lower()
                        or lowered_keyword in str((run.get("execution_options") or {}).get("environment_snapshot", {}).get("name", "")).lower()
                    )
                ],
                key=lambda item: item.get("run_at", ""),
                reverse=True,
            )
            return runs[:limit]

    def delete_run(self, run_id: str) -> bool:
        with self._lock:
            data = self._read_runs_no_lock()
            if run_id not in data:
                return False
            del data[run_id]
            self._write_json_atomic(self._runs_file, data)
            return True

    def save_policy_audit(self, audit: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_audits_no_lock()
            data[audit["audit_id"]] = audit
            data = self._trim_audits(data)
            self._write_json_atomic(self._audits_file, data)
            return audit

    def list_policy_audits(
        self,
        limit: int = 20,
        project_id: str | None = None,
        action: str | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            scoped_project_id = project_id.strip() if project_id else ""
            scoped_action = action.strip() if action else ""
            audits = sorted(
                [
                    audit
                    for audit in self._read_audits_no_lock().values()
                    if (not scoped_project_id or audit.get("project_id") == scoped_project_id)
                    and (not scoped_action or audit.get("action") == scoped_action)
                ],
                key=lambda item: item.get("created_at", ""),
                reverse=True,
            )
            return audits[:limit]

    def save_automation_task(self, task: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_automation_tasks_no_lock()
            data[task["task_id"]] = task
            data = self._trim_automation_tasks(data)
            self._write_json_atomic(self._automation_tasks_file, data)
            return task

    def get_automation_task(self, task_id: str) -> dict[str, Any] | None:
        with self._lock:
            return self._read_automation_tasks_no_lock().get(task_id)

    def list_automation_tasks(
        self,
        limit: int = 20,
        status: str | None = None,
        project_id: str | None = None,
    ) -> list[dict[str, Any]]:
        with self._lock:
            scoped_status = status.strip() if status else ""
            scoped_project_id = project_id.strip() if project_id else ""
            tasks = sorted(
                [
                    task
                    for task in self._read_automation_tasks_no_lock().values()
                    if (not scoped_status or task.get("status") == scoped_status)
                    and (not scoped_project_id or task.get("project_id") == scoped_project_id)
                ],
                key=lambda item: item.get("updated_at") or item.get("created_at") or "",
                reverse=True,
            )
            return tasks[:limit]

    def update_automation_task(self, task_id: str, patch: dict[str, Any]) -> dict[str, Any] | None:
        with self._lock:
            data = self._read_automation_tasks_no_lock()
            if task_id not in data:
                return None
            data[task_id] = {**data[task_id], **patch}
            data = self._trim_automation_tasks(data)
            self._write_json_atomic(self._automation_tasks_file, data)
            return data.get(task_id)

    def save_automation_definition(self, definition: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_generic_no_lock(self._automation_definitions_file)
            data[definition["definition_id"]] = definition
            self._write_json_atomic(self._automation_definitions_file, self._trim_generic(data, "updated_at", "definition_id"))
            return definition

    def save_automation_run(self, run: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_generic_no_lock(self._automation_runs_file)
            data[run["automation_run_id"]] = run
            self._write_json_atomic(self._automation_runs_file, self._trim_generic(data, "run_at", "automation_run_id"))
            return run

    def list_automation_runs(self, limit: int = 50) -> list[dict[str, Any]]:
        with self._lock:
            runs = sorted(
                self._read_generic_no_lock(self._automation_runs_file).values(),
                key=lambda item: item.get("run_at", ""),
                reverse=True,
            )
            return runs[:limit]

    def save_run_stage_event(self, event: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_generic_no_lock(self._run_stage_events_file)
            data[event["event_id"]] = event
            self._write_json_atomic(self._run_stage_events_file, self._trim_generic(data, "created_at", "event_id"))
            return event

    def save_artifact_meta(self, artifact: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_generic_no_lock(self._artifact_meta_file)
            data[artifact["artifact_id"]] = artifact
            self._write_json_atomic(self._artifact_meta_file, self._trim_generic(data, "created_at", "artifact_id"))
            return artifact

    def save_knowledge_item(self, item: dict[str, Any]) -> dict[str, Any]:
        with self._lock:
            data = self._read_generic_no_lock(self._knowledge_items_file)
            data[item["knowledge_id"]] = item
            self._write_json_atomic(
                self._knowledge_items_file,
                self._trim_generic(data, "created_at", "knowledge_id", MAX_SAVED_KNOWLEDGE_ITEMS),
            )
            return item

    def list_knowledge_items(self, limit: int = 50, item_type: str | None = None) -> list[dict[str, Any]]:
        with self._lock:
            scoped_type = item_type.strip() if item_type else ""
            items = sorted(
                [
                    item
                    for item in self._read_generic_no_lock(self._knowledge_items_file).values()
                    if not scoped_type or item.get("item_type") == scoped_type
                ],
                key=lambda item: item.get("created_at", ""),
                reverse=True,
            )
            return items[:limit]

    def _read_specs_no_lock(self) -> dict[str, Any]:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._specs_file.exists():
            return {}
        try:
            data = json.loads(self._specs_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _read_runs_no_lock(self) -> dict[str, Any]:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._runs_file.exists():
            return {}
        try:
            data = json.loads(self._runs_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _read_projects_no_lock(self) -> dict[str, Any]:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._projects_file.exists():
            return {}
        try:
            data = json.loads(self._projects_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _read_environments_no_lock(self) -> dict[str, Any]:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._environments_file.exists():
            return {}
        try:
            data = json.loads(self._environments_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _read_audits_no_lock(self) -> dict[str, Any]:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._audits_file.exists():
            return {}
        try:
            data = json.loads(self._audits_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _read_automation_tasks_no_lock(self) -> dict[str, Any]:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not self._automation_tasks_file.exists():
            return {}
        try:
            data = json.loads(self._automation_tasks_file.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _read_generic_no_lock(self, path: Path) -> dict[str, Any]:
        self._data_dir.mkdir(parents=True, exist_ok=True)
        if not path.exists():
            return {}
        try:
            data = json.loads(path.read_text(encoding="utf-8"))
            return data if isinstance(data, dict) else {}
        except Exception:
            return {}

    def _trim_specs(self, data: dict[str, Any]) -> dict[str, Any]:
        if len(data) <= MAX_SAVED_SPECS:
            return data
        specs = sorted(
            data.values(),
            key=lambda item: item.get("parsed_at", ""),
            reverse=True,
        )
        return {item["spec_id"]: item for item in specs[:MAX_SAVED_SPECS] if item.get("spec_id")}

    def _trim_runs(self, data: dict[str, Any]) -> dict[str, Any]:
        if len(data) <= MAX_SAVED_RUNS:
            return data
        runs = sorted(
            data.values(),
            key=lambda item: item.get("run_at", ""),
            reverse=True,
        )
        return {item["run_id"]: item for item in runs[:MAX_SAVED_RUNS] if item.get("run_id")}

    def _trim_audits(self, data: dict[str, Any]) -> dict[str, Any]:
        if len(data) <= MAX_SAVED_AUDITS:
            return data
        audits = sorted(
            data.values(),
            key=lambda item: item.get("created_at", ""),
            reverse=True,
        )
        return {item["audit_id"]: item for item in audits[:MAX_SAVED_AUDITS] if item.get("audit_id")}

    def _trim_automation_tasks(self, data: dict[str, Any]) -> dict[str, Any]:
        if len(data) <= MAX_SAVED_AUTOMATION_TASKS:
            return data
        tasks = sorted(
            data.values(),
            key=lambda item: item.get("updated_at") or item.get("created_at") or "",
            reverse=True,
        )
        return {item["task_id"]: item for item in tasks[:MAX_SAVED_AUTOMATION_TASKS] if item.get("task_id")}

    def _trim_generic(
        self,
        data: dict[str, Any],
        sort_key: str,
        id_key: str,
        limit: int = MAX_SAVED_AUTOMATION_RECORDS,
    ) -> dict[str, Any]:
        if len(data) <= limit:
            return data
        records = sorted(
            data.values(),
            key=lambda item: item.get(sort_key) or item.get("created_at") or "",
            reverse=True,
        )
        return {item[id_key]: item for item in records[:limit] if item.get(id_key)}

    def _write_json_atomic(self, path: Path, payload: dict[str, Any]) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        fd, tmp_name = tempfile.mkstemp(prefix=f".{path.name}.", suffix=".tmp", dir=path.parent)
        try:
            with os.fdopen(fd, "w", encoding="utf-8") as f:
                json.dump(payload, f, ensure_ascii=False, separators=(",", ":"))
                f.write("\n")
            os.replace(tmp_name, path)
        finally:
            if os.path.exists(tmp_name):
                os.unlink(tmp_name)


api_execution_store = APIExecutionStore()
