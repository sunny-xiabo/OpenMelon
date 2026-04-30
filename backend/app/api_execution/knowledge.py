import asyncio
import logging
import uuid
from typing import Any

from app.api_execution.utils import now_iso as _now_iso

logger = logging.getLogger(__name__)


def build_run_knowledge_items(run: dict[str, Any]) -> list[dict[str, Any]]:
    now = _now_iso()
    items = [
        {
            "knowledge_id": f"api-run-summary:{run.get('run_id')}",
            "item_type": "api_run_summary",
            "source_run_id": run.get("run_id", ""),
            "project_id": _project_id(run),
            "created_at": now,
            "summary": _run_summary_text(run),
            "payload": {
                "case_id": run.get("case_id", ""),
                "case_name": run.get("case_name", ""),
                "status": run.get("status", ""),
                "passed": run.get("passed", 0),
                "failed": run.get("failed", 0),
                "duration_ms": run.get("duration_ms", 0),
                "automation_summary": run.get("automation_summary") or {},
            },
        }
    ]
    for diagnostic in run.get("failure_diagnostics") or []:
        items.append(
            {
                "knowledge_id": f"api-failure:{run.get('run_id')}:{diagnostic.get('step_id') or uuid.uuid4()}",
                "item_type": "api_failure",
                "source_run_id": run.get("run_id", ""),
                "project_id": _project_id(run),
                "created_at": now,
                "summary": diagnostic.get("explanation", ""),
                "payload": diagnostic,
            }
        )
    for repair in run.get("repair_history") or []:
        items.append(
            {
                "knowledge_id": f"api-repair:{run.get('run_id')}:{repair.get('created_at') or uuid.uuid4()}",
                "item_type": "api_repair",
                "source_run_id": run.get("run_id", ""),
                "project_id": _project_id(run),
                "created_at": now,
                "summary": _repair_summary_text(repair),
                "payload": repair,
            }
        )
    return items


async def write_run_to_graph(graph_ops: Any, run: dict[str, Any]) -> int:
    if graph_ops is None or not hasattr(graph_ops, "run_cypher"):
        return 0
    script = run.get("script") or {}
    steps = script.get("steps") or []
    project_name = _project_name(run)
    case_name = run.get("case_name") or script.get("name") or run.get("case_id") or "API TestCase"
    run_name = run.get("run_id") or str(uuid.uuid4())
    written = 0
    await graph_ops.run_cypher(
        """
        MERGE (m:Module {name: $project_name})
        SET m.source = 'api_execution', m.updated_at = $updated_at
        MERGE (tc:TestCase {name: $case_name})
        SET tc.case_id = $case_id, tc.source = 'api_execution', tc.updated_at = $updated_at
        MERGE (r:APIRun {name: $run_name})
        SET r.status = $status, r.run_at = $run_at, r.passed = $passed, r.failed = $failed, r.duration_ms = $duration_ms
        MERGE (m)-[:CONTAINS]->(tc)
        MERGE (tc)-[:EXECUTED_AS]->(r)
        """,
        {
            "project_name": project_name,
            "case_name": case_name,
            "case_id": run.get("case_id", ""),
            "run_name": run_name,
            "status": run.get("status", ""),
            "run_at": run.get("run_at", ""),
            "passed": run.get("passed", 0),
            "failed": run.get("failed", 0),
            "duration_ms": run.get("duration_ms", 0),
            "updated_at": _now_iso(),
        },
    )
    written += 3
    results_by_step = {
        str(result.get("step_id")): result
        for result in run.get("results") or []
        if result.get("step_id")
    }
    for step in steps:
        step_id = str(step.get("id", ""))
        operation_name = _operation_name(step)
        feature_name = f"{project_name} {operation_name}"
        result = results_by_step.get(step_id, {})
        await graph_ops.run_cypher(
            """
            MATCH (m:Module {name: $project_name})
            MATCH (tc:TestCase {name: $case_name})
            MATCH (r:APIRun {name: $run_name})
            MERGE (api:APIOperation {name: $operation_name})
            SET api.method = $method, api.path = $path, api.operation_id = $operation_id, api.source = 'api_execution'
            MERGE (f:Feature {name: $feature_name})
            SET f.module = $project_name, f.source = 'api_execution', f.operation_id = $operation_id
            MERGE (s:APIStep {name: $step_name})
            SET s.step_id = $step_id, s.status = $step_status, s.status_code = $status_code
            MERGE (m)-[:CONTAINS]->(f)
            MERGE (m)-[:CONTAINS]->(api)
            MERGE (api)-[:HAS_FEATURE]->(f)
            MERGE (tc)-[:COVERS]->(f)
            MERGE (tc)-[:CALLS]->(api)
            MERGE (r)-[:HAS_STEP]->(s)
            MERGE (s)-[:TARGETS]->(api)
            WITH r, s, api
            FOREACH (_ IN CASE WHEN $step_status = 'passed' THEN [] ELSE [1] END |
                MERGE (r)-[:FAILED_AT]->(s)
                MERGE (r)-[:FAILED_AT]->(api)
            )
            """,
            {
                "project_name": project_name,
                "case_name": case_name,
                "run_name": run_name,
                "operation_name": operation_name,
                "feature_name": feature_name,
                "method": str(step.get("method", "")).upper(),
                "path": step.get("path", ""),
                "operation_id": step.get("operation_id", ""),
                "step_name": f"{case_name}::{step_id or operation_name}",
                "step_id": step_id,
                "step_status": result.get("status", "unknown"),
                "status_code": result.get("status_code"),
            },
        )
        written += 4
    return written


async def write_run_to_graph_with_retry(
    graph_ops: Any,
    run: dict[str, Any],
    *,
    max_retries: int = 3,
    retry_delay: float = 1.0,
) -> dict[str, Any]:
    run_id = run.get("run_id", "<unknown>")
    last_error = None
    for attempt in range(1, max_retries + 1):
        try:
            written = await write_run_to_graph(graph_ops, run)
            return {"success": True, "written": written, "attempt": attempt}
        except Exception as exc:
            last_error = exc
            logger.warning("图谱写入失败 (run_id=%s, attempt=%d/%d): %s", run_id, attempt, max_retries, exc)
            if attempt < max_retries:
                await asyncio.sleep(retry_delay * attempt)
    return {
        "success": False,
        "error": str(last_error),
        "attempt": max_retries,
    }


def build_graph_write_failure_task(run: dict[str, Any], error: str, attempt: int) -> dict[str, Any]:
    now = _now_iso()
    return {
        "task_id": f"graph-write-failure:{run.get('run_id', uuid.uuid4())}",
        "created_at": now,
        "updated_at": now,
        "task_type": "knowledge_write_failure",
        "status": "pending",
        "run_id": run.get("run_id"),
        "project_id": (run.get("execution_options") or {}).get("project_id", ""),
        "environment_id": (run.get("execution_options") or {}).get("environment_id", ""),
        "risk_level": "low",
        "reason": f"图谱写入失败 {attempt} 次: {error}",
        "summary": {
            "run_id": run.get("run_id"),
            "case_name": run.get("case_name", ""),
            "error": error,
            "attempt": attempt,
        },
        "decision": {},
        "result_run_id": None,
        "resolved_at": None,
        "resolution_note": "",
    }


def _run_summary_text(run: dict[str, Any]) -> str:
    return (
        f"{run.get('case_name') or run.get('case_id') or 'API 用例'}执行{run.get('status', '')}，"
        f"通过 {run.get('passed', 0)}，失败 {run.get('failed', 0)}，耗时 {run.get('duration_ms', 0)}ms。"
    )


def _repair_summary_text(repair: dict[str, Any]) -> str:
    before = repair.get("before") or {}
    after = repair.get("after") or {}
    return (
        f"自动修复重跑：失败数 {before.get('failed', 0)} -> {after.get('failed', 0)}，"
        f"状态 {before.get('status', '')} -> {after.get('status', '')}。"
    )


def _operation_name(step: dict[str, Any]) -> str:
    return f"{str(step.get('method', '')).upper()} {step.get('path', '')}".strip()


def _project_id(run: dict[str, Any]) -> str:
    return (run.get("execution_options") or {}).get("project_id", "")


def _project_name(run: dict[str, Any]) -> str:
    return (
        ((run.get("execution_options") or {}).get("project_policy_snapshot") or {}).get("name")
        or run.get("target_project")
        or ((run.get("script") or {}).get("target_project"))
        or "API 自动化"
    )
