import os

import pytest

try:
    import psycopg
except Exception:  # pragma: no cover - optional during local linting
    psycopg = None


os.environ.setdefault("APP_ENV", "test")
os.environ.setdefault("DATABASE_URL", "postgresql://openmelon:openmelon@localhost:5432/openmelon")


_PG_TABLES = (
    "runs",
    "projects",
    "environments",
    "specs",
    "api_spec_versions",
    "api_modules",
    "api_interfaces",
    "policy_audits",
    "automation_tasks",
    "automation_definitions",
    "automation_runs",
    "run_stage_events",
    "artifact_meta",
    "knowledge_items",
    "event_logs",
    "ai_call_logs",
    "ai_debug_settings",
    "file_records",
    "prompt_hub_meta",
    "prompt_templates",
    "prompt_skill_categories",
    "prompt_skills",
    "graph_node_types",
)


def _reset_runtime_tables() -> None:
    if psycopg is None:
        return
    database_url = os.environ.get("DATABASE_URL", "")
    if not database_url:
        return
    with psycopg.connect(database_url, autocommit=True) as conn:
        rows = conn.execute(
            """
            SELECT tablename
            FROM pg_tables
            WHERE schemaname = 'public'
            """
        ).fetchall()
        existing = [row[0] for row in rows if row[0] in _PG_TABLES]
        if existing:
            quoted = ", ".join(f'"{table}"' for table in existing)
            conn.execute(f"TRUNCATE TABLE {quoted} RESTART IDENTITY CASCADE")


@pytest.fixture(autouse=True)
def reset_pg_runtime_state():
    _reset_runtime_tables()
    yield
    _reset_runtime_tables()
