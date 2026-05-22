#!/usr/bin/env python3
"""PostgreSQL runtime smoke checks for the PG-only runtime."""

from __future__ import annotations

import argparse
import asyncio
import json
import sys
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.api.routers.system import _check_postgres_health
from app.api_execution.storage import api_execution_store
from app.config import settings
from app.models import graph_types
from app.services.file_tracker import file_tracker
from app.services.prompt_hub_tracker import prompt_hub_tracker

SMOKE_PREFIX = "pg-runtime-smoke"


def _now() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _pass(name: str, **details: Any) -> dict[str, Any]:
    return {"name": name, "ok": True, **details}


def _table_counts() -> dict[str, int]:
    rows = api_execution_store._query(
        """
        SELECT table_name AS name
        FROM information_schema.tables
        WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
        ORDER BY table_name
        """
    )
    counts: dict[str, int] = {}
    for row in rows:
        table = row["name"]
        count_row = api_execution_store._query_one(f'SELECT COUNT(*) AS count FROM "{table}"')
        counts[table] = int(count_row["count"] if count_row else 0)
    return counts


async def _check_health() -> dict[str, Any]:
    postgres = await _check_postgres_health()
    if getattr(api_execution_store, "storage_engine", None) != "postgres":
        raise AssertionError("API execution store is not using PostgreSQL")
    if getattr(file_tracker, "storage_engine", None) != "postgres":
        raise AssertionError("FileTracker is not using PostgreSQL")
    if getattr(prompt_hub_tracker, "storage_engine", None) != "postgres":
        raise AssertionError("Prompt Hub is not using PostgreSQL")
    if getattr(graph_types.node_type_store, "storage_engine", None) != "postgres":
        raise AssertionError("NodeTypeStore is not using PostgreSQL")
    if postgres["status"] != "ok":
        raise AssertionError(f"PostgreSQL health is not ok: {postgres}")
    return _pass(
        "system_health",
        postgres_health=postgres["status"],
    )


async def _check_api_execution() -> dict[str, Any]:
    run_id = f"{SMOKE_PREFIX}-run"
    api_execution_store.delete_run(run_id)
    run = {
        "run_id": run_id,
        "case_id": f"{SMOKE_PREFIX}-case",
        "case_name": "PG runtime smoke case",
        "status": "queued",
        "run_at": _now(),
        "updated_at": _now(),
        "execution_options": {
            "project_id": SMOKE_PREFIX,
            "environment_snapshot": {"name": "PG Smoke"},
        },
    }
    api_execution_store.save_run(run)
    assert api_execution_store.get_run(run_id)["case_name"] == "PG runtime smoke case"
    assert api_execution_store.count_runs(project_id=SMOKE_PREFIX) >= 1
    assert any(item["run_id"] == run_id for item in api_execution_store.list_runs(project_id=SMOKE_PREFIX))

    updated = api_execution_store.update_run(run_id, {"status": "running", "updated_at": _now()})
    assert updated and updated["status"] == "running"

    atomic = await api_execution_store.async_update_run_atomic(
        run_id,
        lambda item: {**item, "status": "passed", "finished_at": _now()},
    )
    assert atomic and atomic["status"] == "passed"
    assert api_execution_store.delete_run(run_id) is True
    return _pass("api_execution")


def _check_file_tracker() -> dict[str, Any]:
    for item in file_tracker.get_all_records():
        if item.get("filename") == f"{SMOKE_PREFIX}.md":
            file_tracker.delete_record(item["id"])
    record = file_tracker.add_record(f"{SMOKE_PREFIX}.md", "PG Smoke", "runtime", 1)
    assert file_tracker.get_record(record["id"])["filename"] == f"{SMOKE_PREFIX}.md"
    assert any(item["id"] == record["id"] for item in file_tracker.get_all_records())
    assert file_tracker.update_record(record["id"], status="verified")["status"] == "verified"
    assert file_tracker.delete_record(record["id"]) is True
    return _pass("file_tracker")


def _check_prompt_hub() -> dict[str, Any]:
    template_id = f"{SMOKE_PREFIX}-template"
    category_id = f"{SMOKE_PREFIX}-category"
    skill_id = f"{SMOKE_PREFIX}-skill"
    original_data = prompt_hub_tracker.load_data()
    for cleanup in (
        lambda: prompt_hub_tracker.delete_skill(skill_id),
        lambda: prompt_hub_tracker.delete_template(template_id),
        lambda: prompt_hub_tracker.delete_skill_category(category_id),
    ):
        try:
            cleanup()
        except Exception:
            pass

    try:
        category = prompt_hub_tracker.create_skill_category(
            {"id": category_id, "name": "PG Runtime Smoke", "is_default": False, "sort_order": 999}
        )
        assert category["record"]["id"] == category_id
        skill = prompt_hub_tracker.create_skill(
            {
                "id": skill_id,
                "name": "PG Runtime Smoke Skill",
                "description": "temporary smoke record",
                "content": "请补充 PG runtime smoke 场景。",
                "review_summary": "temporary smoke record",
                "enabled": True,
                "category": category_id,
                "sort_order": 999,
            }
        )
        assert skill["record"]["id"] == skill_id
        template = prompt_hub_tracker.create_template(
            {
                "id": template_id,
                "name": "PG Runtime Smoke Template",
                "description": "temporary smoke record",
                "content": "请输出 PG runtime smoke 测试用例。",
                "review_summary": "temporary smoke record",
                "enabled": True,
                "is_default": False,
                "sort_order": 999,
            }
        )
        assert template["record"]["id"] == template_id
        assert prompt_hub_tracker.update_template(
            template_id,
            {
                "id": template_id,
                "name": "PG Runtime Smoke Template",
                "description": "temporary smoke record updated",
                "content": "请输出 PG runtime smoke 测试用例。",
                "review_summary": "temporary smoke record",
                "enabled": True,
                "is_default": False,
                "sort_order": 999,
            },
        )["record"]["description"].endswith("updated")
        assert prompt_hub_tracker.delete_skill(skill_id)["record"]["id"] == skill_id
        assert prompt_hub_tracker.delete_template(template_id)["record"]["id"] == template_id
        assert prompt_hub_tracker.delete_skill_category(category_id)["record"]["id"] == category_id
    finally:
        with prompt_hub_tracker._lock:
            prompt_hub_tracker._replace_data_no_lock(original_data)
    return _pass("prompt_hub")


def _check_node_types() -> dict[str, Any]:
    node_type = "PgRuntimeSmoke"
    graph_types.reload_node_type_configs()
    try:
        graph_types.delete_node_type_config(node_type)
    except Exception:
        pass
    created = graph_types.create_node_type_config(
        {
            "type": node_type,
            "category": "extendable",
            "color": {"bg": "#14b8a6", "border": "#0f766e"},
            "size": 20,
        }
    )
    assert created["type"] == node_type
    updated = graph_types.update_node_type_config(
        node_type,
        {"color": {"bg": "#0ea5e9", "border": "#0284c7"}, "size": 22},
    )
    assert updated["size"] == 22
    graph_types.reload_node_type_configs()
    assert any(item["type"] == node_type for item in graph_types.list_node_type_configs())
    graph_types.delete_node_type_config(node_type)
    assert all(item["type"] != node_type for item in graph_types.list_node_type_configs())
    return _pass("node_type_store")


def _check_logs() -> dict[str, Any]:
    event_id = f"{SMOKE_PREFIX}-event"
    related_id = f"{SMOKE_PREFIX}-event-related"
    ai_call_id = f"{SMOKE_PREFIX}-ai-call"
    trace_id = f"{SMOKE_PREFIX}-trace"

    api_execution_store._conn.execute("DELETE FROM event_logs WHERE event_id IN (?, ?)", (event_id, related_id))
    api_execution_store._conn.execute("DELETE FROM ai_call_logs WHERE call_id = ?", (ai_call_id,))
    api_execution_store._conn.commit()

    event = {
        "event_id": event_id,
        "created_at": _now(),
        "level": "info",
        "module": "pg_runtime_smoke",
        "event_type": "smoke",
        "project_id": SMOKE_PREFIX,
        "trace_id": trace_id,
        "source_id": SMOKE_PREFIX,
        "title": "PG runtime smoke event",
        "message": "temporary smoke event",
        "refs": ["pg-runtime-smoke"],
    }
    related = {**event, "event_id": related_id, "title": "PG runtime smoke related event"}
    api_execution_store.save_event_log(event)
    api_execution_store.save_event_log(related)
    assert api_execution_store.get_event_log(event_id)["trace_id"] == trace_id
    assert api_execution_store.count_event_logs(module="pg_runtime_smoke") >= 2
    assert len(api_execution_store.list_event_logs(module="pg_runtime_smoke", limit=5)) >= 2
    assert api_execution_store.summarize_event_logs(module="pg_runtime_smoke")["total"] >= 2
    assert any(item["event_id"] == related_id for item in api_execution_store.list_related_event_logs(event_id))

    ai_call = {
        "call_id": ai_call_id,
        "created_at": _now(),
        "feature": "pg_runtime_smoke",
        "operation": "smoke",
        "provider": "openai_compat",
        "model": "smoke-model",
        "status": "success",
        "degraded": False,
        "trace_id": trace_id,
        "source_id": SMOKE_PREFIX,
        "latency_ms": 12,
        "prompt_chars": 10,
        "response_chars": 20,
        "input_tokens": 3,
        "output_tokens": 4,
        "total_tokens": 7,
    }
    api_execution_store.save_ai_call_log(ai_call)
    assert api_execution_store.get_ai_call_log(ai_call_id)["feature"] == "pg_runtime_smoke"
    assert len(api_execution_store.list_ai_call_logs(feature="pg_runtime_smoke", limit=5)) >= 1
    assert api_execution_store.summarize_ai_call_logs(feature="pg_runtime_smoke")["total"] >= 1

    api_execution_store._conn.execute("DELETE FROM event_logs WHERE event_id IN (?, ?)", (event_id, related_id))
    api_execution_store._conn.execute("DELETE FROM ai_call_logs WHERE call_id = ?", (ai_call_id,))
    api_execution_store._conn.commit()
    return _pass("logs")


async def run_smoke() -> dict[str, Any]:
    checks: list[dict[str, Any]] = []
    before_counts = _table_counts()
    checks.append(await _check_health())
    checks.append(await _check_api_execution())
    checks.append(_check_file_tracker())
    checks.append(_check_prompt_hub())
    checks.append(_check_node_types())
    checks.append(_check_logs())
    after_counts = _table_counts()
    return {
        "ok": all(item["ok"] for item in checks),
        "checked_at": _now(),
        "checks": checks,
        "table_counts": after_counts,
        "table_count_delta": {
            table: after_counts.get(table, 0) - before_counts.get(table, 0)
            for table in sorted(set(before_counts) | set(after_counts))
            if after_counts.get(table, 0) != before_counts.get(table, 0)
        },
        "observation_notes": [
            "Investigate event_logs, ai_call_logs, and runs first if query latency or table growth becomes visible.",
        ],
    }


def main() -> int:
    parser = argparse.ArgumentParser(description="Run PostgreSQL runtime smoke checks")
    parser.add_argument("--pretty", action="store_true", help="Pretty-print JSON output")
    args = parser.parse_args()
    try:
        result = asyncio.run(run_smoke())
    except Exception as exc:
        result = {"ok": False, "checked_at": _now(), "error": f"{type(exc).__name__}: {exc}"}
        print(json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None))
        return 1
    print(json.dumps(result, ensure_ascii=False, indent=2 if args.pretty else None))
    return 0 if result["ok"] else 1


if __name__ == "__main__":
    raise SystemExit(main())
