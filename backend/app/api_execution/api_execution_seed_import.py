"""Legacy JSON seed import helpers for API execution storage."""

from __future__ import annotations

import json
import logging
from collections.abc import Callable
from pathlib import Path
from typing import Any

logger = logging.getLogger(__name__)

TableSeed = tuple[str, str, str]
UpsertFn = Callable[[str, str, str, dict[str, Any], dict[str, Any]], None]

TABLE_FILE_MAP: tuple[TableSeed, ...] = (
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
)


def extract_indexed_columns(table: str, entity: dict[str, Any]) -> dict[str, Any]:
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


def import_json_seed_files(
    json_dir: Path,
    upsert: UpsertFn,
    commit: Callable[[], None],
) -> int:
    """Import API execution JSON seed files into the active storage backend."""
    total = 0
    for table, filename, id_col in TABLE_FILE_MAP:
        filepath = json_dir / filename
        if not filepath.exists():
            continue
        try:
            data = json.loads(filepath.read_text(encoding="utf-8"))
            if not isinstance(data, dict):
                continue
            for entity_id, entity in data.items():
                upsert(table, id_col, entity_id, extract_indexed_columns(table, entity), entity)
                total += 1
            commit()
            logger.info("Imported %d records from %s", len(data), filename)
        except Exception as exc:
            logger.warning("Failed to import %s: %s", filename, exc)
    return total
