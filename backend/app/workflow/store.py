"""PostgreSQL persistence layer for workflow definitions and runs."""
from __future__ import annotations

import json
import uuid
from datetime import datetime
from typing import Any

from app.storage.postgres_store import get_pg_connection
from app.workflow.models import (
    CreateWorkflowRequest,
    NodeRunResult,
    UpdateWorkflowRequest,
    WorkflowDef,
    WorkflowRunResult,
    WorkflowTemplate,
)
from app.utils.logger import logger

log = logger.getChild("workflow.store")


# ── Helpers ────────────────────────────────────────────────────────

def _now_iso() -> str:
    return datetime.utcnow().isoformat() + "Z"


def _row_to_workflow(row: tuple) -> WorkflowDef:
    wf_id, name, desc, icon, status, version, data_json, created, updated = row
    data = json.loads(data_json) if isinstance(data_json, str) else data_json
    return WorkflowDef(
        id=wf_id,
        name=name,
        description=desc,
        icon=icon,
        status=status,
        version=version,
        nodes=data.get("nodes", []),
        edges=data.get("edges", []),
        variables=data.get("variables", []),
        environment_variables=data.get("environment_variables", []),
        created_at=created,
        updated_at=updated,
    )


def _row_to_run(row: tuple) -> WorkflowRunResult:
    (run_id, wf_id, wf_ver, status, inputs, outputs,
     node_results, error, started, finished, created) = row
    return WorkflowRunResult(
        run_id=run_id,
        workflow_id=wf_id,
        status=status,
        inputs=inputs if isinstance(inputs, dict) else json.loads(inputs or "{}"),
        outputs=outputs if isinstance(outputs, dict) else json.loads(outputs or "{}"),
        node_results=node_results if isinstance(node_results, dict) else json.loads(node_results or "{}"),
        error=error or None,
        started_at=started,
        finished_at=finished,
    )


# ── Workflow CRUD ──────────────────────────────────────────────────

def create_workflow(req: CreateWorkflowRequest) -> WorkflowDef:
    wf_id = str(uuid.uuid4())
    now = _now_iso()
    data = {
        "nodes": [n.model_dump() for n in req.nodes],
        "edges": [e.model_dump() for e in req.edges],
        "variables": [v.model_dump() for v in req.variables],
        "environment_variables": [v.model_dump() for v in req.environment_variables],
    }
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO workflows
                   (workflow_id, name, description, icon, status, version, data, created_at, updated_at)
                   VALUES (%s, %s, %s, %s, 'draft', 1, %s, %s, %s)""",
                (wf_id, req.name, req.description, req.icon,
                 json.dumps(data, ensure_ascii=False), now, now),
            )
        conn.commit()
    finally:
        conn.close()
    log.info("Created workflow %s (%s)", wf_id, req.name)
    return WorkflowDef(
        id=wf_id, name=req.name, description=req.description,
        icon=req.icon, nodes=req.nodes, edges=req.edges,
        variables=req.variables, environment_variables=req.environment_variables,
        created_at=datetime.fromisoformat(now.rstrip("Z")),
        updated_at=datetime.fromisoformat(now.rstrip("Z")),
    )


def list_workflows(status: str | None = None, limit: int = 50, offset: int = 0) -> tuple[list[WorkflowDef], int]:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            where = ""
            params: list[Any] = []
            if status:
                where = "WHERE status = %s"
                params.append(status)

            cur.execute(f"SELECT COUNT(*) FROM workflows {where}", params)
            total = cur.fetchone()[0]

            cur.execute(
                f"""SELECT workflow_id, name, description, icon, status, version,
                           data, created_at, updated_at
                    FROM workflows {where}
                    ORDER BY updated_at DESC
                    LIMIT %s OFFSET %s""",
                params + [limit, offset],
            )
            rows = cur.fetchall()
        return [_row_to_workflow(r) for r in rows], total
    finally:
        conn.close()


def get_workflow(workflow_id: str) -> WorkflowDef | None:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT workflow_id, name, description, icon, status, version,
                          data, created_at, updated_at
                   FROM workflows WHERE workflow_id = %s""",
                (workflow_id,),
            )
            row = cur.fetchone()
        return _row_to_workflow(row) if row else None
    finally:
        conn.close()


def update_workflow(workflow_id: str, req: UpdateWorkflowRequest) -> WorkflowDef | None:
    existing = get_workflow(workflow_id)
    if not existing:
        return None

    updates: dict[str, Any] = {}
    if req.name is not None:
        updates["name"] = req.name
    if req.description is not None:
        updates["description"] = req.description
    if req.icon is not None:
        updates["icon"] = req.icon

    data_updates: dict[str, Any] = {}
    if req.nodes is not None:
        data_updates["nodes"] = [n.model_dump() for n in req.nodes]
    if req.edges is not None:
        data_updates["edges"] = [e.model_dump() for e in req.edges]
    if req.variables is not None:
        data_updates["variables"] = [v.model_dump() for v in req.variables]
    if req.environment_variables is not None:
        data_updates["environment_variables"] = [v.model_dump() for v in req.environment_variables]

    now = _now_iso()
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            if data_updates:
                # Merge with existing data
                existing_data = {
                    "nodes": [n.model_dump() for n in existing.nodes],
                    "edges": [e.model_dump() for e in existing.edges],
                    "variables": [v.model_dump() for v in existing.variables],
                    "environment_variables": [v.model_dump() for v in existing.environment_variables],
                }
                existing_data.update(data_updates)
                cur.execute(
                    """UPDATE workflows
                       SET data = %s, updated_at = %s,
                           name = COALESCE(%s, name),
                           description = COALESCE(%s, description),
                           icon = COALESCE(%s, icon)
                       WHERE workflow_id = %s""",
                    (json.dumps(existing_data, ensure_ascii=False), now,
                     updates.get("name"), updates.get("description"),
                     updates.get("icon"), workflow_id),
                )
            else:
                set_clauses = ["updated_at = %s"]
                params: list[Any] = [now]
                for k, v in updates.items():
                    set_clauses.append(f"{k} = %s")
                    params.append(v)
                params.append(workflow_id)
                cur.execute(
                    f"UPDATE workflows SET {', '.join(set_clauses)} WHERE workflow_id = %s",
                    params,
                )
        conn.commit()
    finally:
        conn.close()
    log.info("Updated workflow %s", workflow_id)
    return get_workflow(workflow_id)


def delete_workflow(workflow_id: str) -> bool:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute("DELETE FROM workflows WHERE workflow_id = %s", (workflow_id,))
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()


def set_workflow_status(workflow_id: str, status: str) -> bool:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "UPDATE workflows SET status = %s, updated_at = %s WHERE workflow_id = %s",
                (status, _now_iso(), workflow_id),
            )
            ok = cur.rowcount > 0
        conn.commit()
        return ok
    finally:
        conn.close()


# ── Workflow Runs ──────────────────────────────────────────────────

def create_run(workflow_id: str, workflow_version: int, inputs: dict) -> WorkflowRunResult:
    run_id = str(uuid.uuid4())
    now = _now_iso()
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO workflow_runs
                   (run_id, workflow_id, workflow_version, status, inputs, created_at)
                   VALUES (%s, %s, %s, 'queued', %s, %s)""",
                (run_id, workflow_id, workflow_version,
                 json.dumps(inputs, ensure_ascii=False), now),
            )
        conn.commit()
    finally:
        conn.close()
    return WorkflowRunResult(
        run_id=run_id, workflow_id=workflow_id, status="queued", inputs=inputs,
    )


def get_run(run_id: str) -> WorkflowRunResult | None:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """SELECT run_id, workflow_id, workflow_version, status,
                          inputs, outputs, node_results, error,
                          started_at, finished_at, created_at
                   FROM workflow_runs WHERE run_id = %s""",
                (run_id,),
            )
            row = cur.fetchone()
        return _row_to_run(row) if row else None
    finally:
        conn.close()


def update_run_status(
    run_id: str,
    status: str,
    outputs: dict | None = None,
    node_results: dict | None = None,
    error: str | None = None,
    started_at: str | None = None,
    finished_at: str | None = None,
) -> None:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            sets = ["status = %s"]
            params: list[Any] = [status]
            if outputs is not None:
                sets.append("outputs = %s")
                params.append(json.dumps(outputs, ensure_ascii=False))
            if node_results is not None:
                sets.append("node_results = %s")
                params.append(json.dumps(node_results, ensure_ascii=False))
            if error is not None:
                sets.append("error = %s")
                params.append(error)
            if started_at is not None:
                sets.append("started_at = %s")
                params.append(started_at)
            if finished_at is not None:
                sets.append("finished_at = %s")
                params.append(finished_at)
            params.append(run_id)
            cur.execute(
                f"UPDATE workflow_runs SET {', '.join(sets)} WHERE run_id = %s",
                params,
            )
        conn.commit()
    finally:
        conn.close()


def update_run_node_result(run_id: str, node_id: str, result: dict) -> None:
    """Update a single node's result inside the run's node_results JSONB."""
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE workflow_runs
                   SET node_results = jsonb_set(
                       COALESCE(node_results, '{}'::jsonb),
                       %s, %s::jsonb, true
                   )
                   WHERE run_id = %s""",
                (f"{{{node_id}}}", json.dumps(result, ensure_ascii=False), run_id),
            )
        conn.commit()
    finally:
        conn.close()


def list_runs(
    workflow_id: str, limit: int = 20, offset: int = 0
) -> tuple[list[WorkflowRunResult], int]:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "SELECT COUNT(*) FROM workflow_runs WHERE workflow_id = %s",
                (workflow_id,),
            )
            total = cur.fetchone()[0]
            cur.execute(
                """SELECT run_id, workflow_id, workflow_version, status,
                          inputs, outputs, node_results, error,
                          started_at, finished_at, created_at
                   FROM workflow_runs
                   WHERE workflow_id = %s
                   ORDER BY created_at DESC
                   LIMIT %s OFFSET %s""",
                (workflow_id, limit, offset),
            )
            rows = cur.fetchall()
        return [_row_to_run(r) for r in rows], total
    finally:
        conn.close()


def recover_stale_runs() -> list[str]:
    """Mark runs stuck in queued/running as failed (call on startup)."""
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """UPDATE workflow_runs
                   SET status = 'failed', error = 'Service restart, run interrupted',
                       finished_at = NOW()
                   WHERE status IN ('queued', 'running')
                   RETURNING run_id"""
            )
            ids = [r[0] for r in cur.fetchall()]
            conn.commit()
        return ids
    except Exception:
        conn.rollback()
        return []
    finally:
        conn.close()


# ── Templates ──────────────────────────────────────────────────────

def list_templates(category: str | None = None) -> list[WorkflowTemplate]:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            if category:
                cur.execute(
                    "SELECT template_id, name, description, category, tags, data, created_at "
                    "FROM workflow_templates WHERE category = %s ORDER BY name",
                    (category,),
                )
            else:
                cur.execute(
                    "SELECT template_id, name, description, category, tags, data, created_at "
                    "FROM workflow_templates ORDER BY name"
                )
            rows = cur.fetchall()
        return [
            WorkflowTemplate(
                template_id=r[0], name=r[1], description=r[2],
                category=r[3],
                tags=r[4] if isinstance(r[4], list) else json.loads(r[4] or "[]"),
                data=r[5] if isinstance(r[5], dict) else json.loads(r[5] or "{}"),
                created_at=r[6],
            )
            for r in rows
        ]
    finally:
        conn.close()


def create_template(tmpl: WorkflowTemplate) -> WorkflowTemplate:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                """INSERT INTO workflow_templates
                   (template_id, name, description, category, tags, data, created_at)
                   VALUES (%s, %s, %s, %s, %s, %s, %s)""",
                (tmpl.template_id, tmpl.name, tmpl.description,
                 tmpl.category, json.dumps(tmpl.tags),
                 json.dumps(tmpl.data, ensure_ascii=False), _now_iso()),
            )
        conn.commit()
    finally:
        conn.close()
    return tmpl


def delete_template(template_id: str) -> bool:
    conn = get_pg_connection()
    try:
        with conn.cursor() as cur:
            cur.execute(
                "DELETE FROM workflow_templates WHERE template_id = %s",
                (template_id,),
            )
            deleted = cur.rowcount > 0
        conn.commit()
        return deleted
    finally:
        conn.close()
