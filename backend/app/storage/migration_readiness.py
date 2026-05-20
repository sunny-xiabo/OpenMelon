"""Read-only SQLite migration readiness checks for a future PostgreSQL cutover."""

from __future__ import annotations

import hashlib
import json
from datetime import datetime
from typing import Any

from app.storage.sqlite_store import BaseSQLiteStore


SENSITIVE_KEYWORDS = ("password", "secret", "token", "api_key", "apikey", "authorization", "auth")
TIME_COLUMN_SUFFIXES = ("_at", "_time")
LARGE_JSON_BYTES = 1_000_000


def build_sqlite_to_pg_readiness(store: BaseSQLiteStore, generated_at: str) -> dict[str, Any]:
    """Inspect the active SQLite database without mutating it."""
    tables = _list_user_tables(store)
    table_profiles = [_profile_table(store, table) for table in tables]
    json_field_risks = _build_json_risks(table_profiles)
    retention_plan = _build_retention_plan(table_profiles)
    recommended_steps = _build_recommended_steps(table_profiles, json_field_risks, retention_plan)

    return {
        "generated_at": generated_at,
        "storage_engine": "sqlite",
        "database_path": str(store.db_path),
        "journal_mode": _journal_mode(store),
        "pg_readiness": "ready_with_jsonb_mapping" if not _has_blocking_risk(table_profiles) else "needs_cleanup",
        "table_profiles": table_profiles,
        "json_field_risks": json_field_risks,
        "retention_plan": retention_plan,
        "recommended_steps": recommended_steps,
    }


def _list_user_tables(store: BaseSQLiteStore) -> list[str]:
    rows = store._query(
        """
        SELECT name
        FROM sqlite_master
        WHERE type = 'table'
          AND name NOT LIKE 'sqlite_%'
        ORDER BY name
        """
    )
    return [row["name"] for row in rows]


def _profile_table(store: BaseSQLiteStore, table: str) -> dict[str, Any]:
    quoted = _quote_identifier(table)
    columns = store._query(f"PRAGMA table_info({quoted})")
    column_names = [row["name"] for row in columns]
    primary_columns = [row["name"] for row in sorted(columns, key=lambda item: item["pk"]) if row["pk"]]
    index_rows = store._query(f"PRAGMA index_list({quoted})")
    indexed_columns = _indexed_columns(store, table, index_rows)
    row_count = int(store._query_one(f"SELECT COUNT(*) AS count FROM {quoted}")["count"])

    data_bytes = 0
    max_data_bytes = 0
    invalid_json_rows = 0
    sensitive_hits: set[str] = set()
    json_hash = ""
    if "data" in column_names:
        data_stats = _scan_json_payloads(store, table)
        data_bytes = data_stats["data_bytes"]
        max_data_bytes = data_stats["max_data_bytes"]
        invalid_json_rows = data_stats["invalid_json_rows"]
        sensitive_hits = data_stats["sensitive_hits"]
        json_hash = data_stats["json_hash"]

    empty_primary_keys = _count_empty_primary_keys(store, table, primary_columns)
    duplicate_primary_keys = _count_duplicate_primary_keys(store, table, primary_columns)
    time_format_issues = _count_time_format_issues(store, table, column_names)

    return {
        "table": table,
        "label": _label_for(table),
        "row_count": row_count,
        "data_bytes": data_bytes,
        "indexed_columns": indexed_columns,
        "pg_strategy": "indexed columns + data JSONB" if "data" in column_names else "plain relational table",
        "pg_jsonb_column": "data" if "data" in column_names else "",
        "invalid_json_rows": invalid_json_rows,
        "empty_primary_keys": empty_primary_keys,
        "duplicate_primary_keys": duplicate_primary_keys,
        "time_format_issues": time_format_issues,
        "max_data_bytes": max_data_bytes,
        "sensitive_keys": sorted(sensitive_hits),
        "json_hash": json_hash,
    }


def _indexed_columns(store: BaseSQLiteStore, table: str, index_rows: list[Any]) -> list[str]:
    indexed: set[str] = set()
    for index in index_rows:
        index_name = index["name"]
        for info in store._query(f"PRAGMA index_info({_quote_string(index_name)})"):
            if info["name"]:
                indexed.add(info["name"])
    return sorted(indexed)


def _scan_json_payloads(store: BaseSQLiteStore, table: str) -> dict[str, Any]:
    digest = hashlib.sha256()
    invalid_json_rows = 0
    data_bytes = 0
    max_data_bytes = 0
    sensitive_hits: set[str] = set()
    rows = store._query(f"SELECT data FROM {_quote_identifier(table)}")
    for row in rows:
        raw = row["data"]
        if raw is None:
            invalid_json_rows += 1
            continue
        raw_text = str(raw)
        raw_bytes = len(raw_text.encode("utf-8"))
        data_bytes += raw_bytes
        max_data_bytes = max(max_data_bytes, raw_bytes)
        digest.update(raw_text.encode("utf-8"))
        try:
            payload = json.loads(raw_text)
        except Exception:
            invalid_json_rows += 1
            continue
        sensitive_hits.update(_find_sensitive_keys(payload))
    return {
        "invalid_json_rows": invalid_json_rows,
        "data_bytes": data_bytes,
        "max_data_bytes": max_data_bytes,
        "sensitive_hits": sensitive_hits,
        "json_hash": digest.hexdigest() if rows else "",
    }


def _find_sensitive_keys(value: Any, prefix: str = "") -> set[str]:
    hits: set[str] = set()
    if isinstance(value, dict):
        for key, item in value.items():
            key_text = str(key)
            path = f"{prefix}.{key_text}" if prefix else key_text
            lowered = key_text.lower()
            if any(keyword in lowered for keyword in SENSITIVE_KEYWORDS):
                hits.add(path)
            hits.update(_find_sensitive_keys(item, path))
    elif isinstance(value, list):
        for item in value:
            hits.update(_find_sensitive_keys(item, prefix))
    return hits


def _count_empty_primary_keys(store: BaseSQLiteStore, table: str, primary_columns: list[str]) -> int:
    if not primary_columns:
        return 0
    conditions = [f"{_quote_identifier(col)} IS NULL OR TRIM(CAST({_quote_identifier(col)} AS TEXT)) = ''" for col in primary_columns]
    row = store._query_one(f"SELECT COUNT(*) AS count FROM {_quote_identifier(table)} WHERE {' OR '.join(conditions)}")
    return int(row["count"] if row else 0)


def _count_duplicate_primary_keys(store: BaseSQLiteStore, table: str, primary_columns: list[str]) -> int:
    if not primary_columns:
        return 0
    cols = ", ".join(_quote_identifier(col) for col in primary_columns)
    row = store._query_one(
        f"""
        SELECT COUNT(*) AS count
        FROM (
            SELECT {cols}
            FROM {_quote_identifier(table)}
            GROUP BY {cols}
            HAVING COUNT(*) > 1
        ) duplicates
        """
    )
    return int(row["count"] if row else 0)


def _count_time_format_issues(store: BaseSQLiteStore, table: str, column_names: list[str]) -> int:
    time_columns = [
        name for name in column_names
        if name.endswith(TIME_COLUMN_SUFFIXES) or name in {"run_at", "parsed_at", "imported_at", "indexed_at"}
    ]
    if not time_columns:
        return 0
    rows = store._query(
        "SELECT "
        + ", ".join(_quote_identifier(column) for column in time_columns)
        + f" FROM {_quote_identifier(table)}"
    )
    issues = 0
    for row in rows:
        for column in time_columns:
            value = row[column]
            if value in (None, ""):
                continue
            if not _is_iso_like_datetime(str(value)):
                issues += 1
    return issues


def _is_iso_like_datetime(value: str) -> bool:
    try:
        datetime.fromisoformat(value.replace("Z", "+00:00"))
        return True
    except ValueError:
        return False


def _build_json_risks(table_profiles: list[dict[str, Any]]) -> list[dict[str, Any]]:
    risks: list[dict[str, Any]] = []
    for profile in table_profiles:
        table = profile["table"]
        if profile["invalid_json_rows"]:
            risks.append({
                "area": table,
                "risk_level": "high",
                "detail": f"{profile['invalid_json_rows']} rows contain invalid JSON payloads",
                "mitigation": "Fix or remove invalid rows before loading data into PostgreSQL JSONB.",
            })
        if profile["sensitive_keys"]:
            risks.append({
                "area": table,
                "risk_level": "medium",
                "detail": "Sensitive-looking keys found: " + ", ".join(profile["sensitive_keys"][:8]),
                "mitigation": "Move secrets to secret references or encrypted storage before production PG migration.",
            })
        if profile["max_data_bytes"] > LARGE_JSON_BYTES:
            risks.append({
                "area": table,
                "risk_level": "medium",
                "detail": f"Largest JSON payload is {profile['max_data_bytes']} bytes",
                "mitigation": "Consider external artifact storage for oversized payloads before migration.",
            })
    return risks


def _build_retention_plan(table_profiles: list[dict[str, Any]]) -> dict[str, Any]:
    counts = {profile["table"]: profile["row_count"] for profile in table_profiles}
    run_count = counts.get("runs", 0)
    event_log_count = counts.get("event_logs", 0)
    ai_call_log_count = counts.get("ai_call_logs", 0)
    archive_strategy = [
        "Archive passed execution runs by project and month before PG cutover when history grows large.",
        "Keep failed, policy-blocked, and knowledge-linked runs online for troubleshooting.",
        "Apply EVENT_LOG_RETENTION_DAYS and EVENT_LOG_MAX_ROWS before exporting event logs.",
    ]
    return {
        "run_count": run_count,
        "event_log_count": event_log_count,
        "ai_call_log_count": ai_call_log_count,
        "recommendation": "Current schema can map indexed columns to relational fields and data to JSONB.",
        "archive_strategy": archive_strategy,
    }


def _build_recommended_steps(
    table_profiles: list[dict[str, Any]],
    json_field_risks: list[dict[str, Any]],
    retention_plan: dict[str, Any],
) -> list[str]:
    steps = [
        "Keep SQLite as the active runtime store until the PostgreSQL migration window.",
        "Create PostgreSQL tables with current indexed columns plus data JSONB.",
        "Export each SQLite table in primary-key order and verify row counts, key sets, indexed columns, and json_hash.",
    ]
    if json_field_risks:
        steps.insert(1, "Resolve high-risk JSON and secret findings before production migration.")
    if retention_plan.get("event_log_count", 0) > 0:
        steps.append("Prune or archive observability logs according to retention policy before bulk import.")
    if any(profile["time_format_issues"] for profile in table_profiles):
        steps.append("Normalize non-ISO timestamp values before loading them into PostgreSQL timestamp columns.")
    return steps


def _has_blocking_risk(table_profiles: list[dict[str, Any]]) -> bool:
    return any(
        profile["invalid_json_rows"] or profile["empty_primary_keys"] or profile["duplicate_primary_keys"]
        for profile in table_profiles
    )


def _journal_mode(store: BaseSQLiteStore) -> str:
    row = store._query_one("PRAGMA journal_mode")
    return str(row[0] if row else "")


def _label_for(table: str) -> str:
    return table.replace("_", " ").title()


def _quote_identifier(identifier: str) -> str:
    return '"' + identifier.replace('"', '""') + '"'


def _quote_string(value: str) -> str:
    return "'" + value.replace("'", "''") + "'"
