"""PostgreSQL table initialization for the workflow module."""
from __future__ import annotations

import json

from app.storage.postgres_store import get_pg_connection


_CREATE_WORKFLOWS = """
CREATE TABLE IF NOT EXISTS workflows (
    workflow_id   TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT DEFAULT '',
    icon          TEXT DEFAULT 'workflow',
    status        TEXT DEFAULT 'draft',
    version       INTEGER DEFAULT 1,
    data          TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW(),
    updated_at    TIMESTAMPTZ DEFAULT NOW()
);
"""

_CREATE_WORKFLOWS_IDX_STATUS = """
CREATE INDEX IF NOT EXISTS idx_workflows_status
    ON workflows(status);
"""

_CREATE_WORKFLOWS_IDX_UPDATED = """
CREATE INDEX IF NOT EXISTS idx_workflows_updated
    ON workflows(updated_at DESC);
"""

_CREATE_WORKFLOW_RUNS = """
CREATE TABLE IF NOT EXISTS workflow_runs (
    run_id            TEXT PRIMARY KEY,
    workflow_id       TEXT NOT NULL REFERENCES workflows(workflow_id) ON DELETE CASCADE,
    workflow_version  INTEGER DEFAULT 1,
    status            TEXT DEFAULT 'queued',
    inputs            JSONB DEFAULT '{}',
    outputs           JSONB DEFAULT '{}',
    node_results      JSONB DEFAULT '{}',
    error             TEXT DEFAULT '',
    started_at        TIMESTAMPTZ,
    finished_at       TIMESTAMPTZ,
    created_at        TIMESTAMPTZ DEFAULT NOW()
);
"""

_CREATE_WORKFLOW_RUNS_IDX_WF = """
CREATE INDEX IF NOT EXISTS idx_workflow_runs_workflow
    ON workflow_runs(workflow_id, created_at DESC);
"""

_CREATE_WORKFLOW_RUNS_IDX_STATUS = """
CREATE INDEX IF NOT EXISTS idx_workflow_runs_status
    ON workflow_runs(status);
"""

_CREATE_WORKFLOW_TEMPLATES = """
CREATE TABLE IF NOT EXISTS workflow_templates (
    template_id   TEXT PRIMARY KEY,
    name          TEXT NOT NULL,
    description   TEXT DEFAULT '',
    category      TEXT DEFAULT 'custom',
    tags          JSONB DEFAULT '[]',
    data          TEXT NOT NULL,
    created_at    TIMESTAMPTZ DEFAULT NOW()
);
"""

_ALL_STATEMENTS = [
    _CREATE_WORKFLOWS,
    _CREATE_WORKFLOWS_IDX_STATUS,
    _CREATE_WORKFLOWS_IDX_UPDATED,
    _CREATE_WORKFLOW_RUNS,
    _CREATE_WORKFLOW_RUNS_IDX_WF,
    _CREATE_WORKFLOW_RUNS_IDX_STATUS,
    _CREATE_WORKFLOW_TEMPLATES,
]


def init_workflow_tables() -> None:
    """Create workflow tables and indexes if they do not exist."""
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            for stmt in _ALL_STATEMENTS:
                cur.execute(stmt)
        conn.commit()
    finally:
        conn.close()

    # Seed built-in templates if the table is empty
    _seed_builtin_templates()


def _seed_builtin_templates() -> None:
    """Insert built-in templates on first run."""
    from app.workflow.builtin_templates import BUILTIN_TEMPLATES

    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("SELECT COUNT(*) FROM workflow_templates WHERE category = 'builtin'")
            count = cur.fetchone()[0]
            if count > 0:
                return

            for tmpl in BUILTIN_TEMPLATES:
                cur.execute(
                    """INSERT INTO workflow_templates
                       (template_id, name, description, category, tags, data, created_at)
                       VALUES (%s, %s, %s, %s, %s, %s, NOW())
                       ON CONFLICT (template_id) DO NOTHING""",
                    (tmpl["template_id"], tmpl["name"], tmpl["description"],
                     tmpl["category"], json.dumps(tmpl["tags"]),
                     json.dumps(tmpl["data"], ensure_ascii=False)),
                )
        conn.commit()
    except Exception:
        conn.rollback()
    finally:
        conn.close()
