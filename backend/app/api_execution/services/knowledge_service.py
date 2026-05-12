from app.api_execution.router_deps import *

def _save_knowledge_ingest_candidate(run: dict[str, Any], trigger_source: str = "run_completed") -> dict[str, Any] | None:
    from app.api_execution.services.run_service import _log_task_event

    run_id = run.get("run_id")
    if not run_id:
        return None
    task_id = f"knowledge-candidate:{run_id}"
    existing = api_execution_store.get_automation_task(task_id)
    if existing and existing.get("status") == "resolved":
        return existing
    now = _now_iso()
    decision = {
        "allowed": False,
        "risk_level": _knowledge_candidate_risk(run),
        "project_id": (run.get("execution_options") or {}).get("project_id", ""),
        "environment_id": (run.get("execution_options") or {}).get("environment_id", ""),
        "trigger_source": trigger_source,
    }
    task = api_execution_store.save_automation_task(
        {
            "task_id": task_id,
            "created_at": (existing or {}).get("created_at") or now,
            "updated_at": now,
            "task_type": "knowledge_ingest_candidate",
            "status": "pending",
            "run_id": run_id,
            "project_id": decision["project_id"],
            "environment_id": decision["environment_id"],
            "risk_level": decision["risk_level"],
            "reason": _knowledge_candidate_reason(run),
            "summary": {
                "status": run.get("status", ""),
                "passed": run.get("passed", 0),
                "failed": run.get("failed", 0),
                "has_repair_history": bool(run.get("repair_history")),
                "repair_count": len(run.get("repair_history") or []),
                "automation_summary_type": (run.get("automation_summary") or {}).get("type", ""),
                "candidate_item_count": len(build_run_knowledge_items(run)),
            },
            "decision": decision,
            "result_run_id": None,
            "resolved_at": None,
            "resolution_note": "",
        }
    )
    _log_task_event(task, "knowledge_candidate_created")
    return task


def _knowledge_candidate_risk(run: dict[str, Any]) -> str:
    if run.get("repair_history"):
        return "medium"
    if run.get("status") == "passed":
        return "low"
    return "medium"


def _knowledge_candidate_reason(run: dict[str, Any]) -> str:
    if run.get("repair_history"):
        return "执行包含自动修复历史，请确认修复有效后再沉淀到知识库/向量库"
    if run.get("status") == "passed":
        return "执行已通过，可确认沉淀为接口覆盖与运行摘要知识"
    return "执行失败，请确认失败原因有效后再沉淀，避免污染 AI 修复知识"


async def _ingest_single_run_to_knowledge(request: Request, run: dict[str, Any]) -> dict[str, Any]:
    from app.api_execution.services.run_service import _log_task_event, _save_unified_automation_records

    ingested_at = _now_iso()
    graph_ops = getattr(request.app.state, "graph_ops", None)
    vector_ops = getattr(request.app.state, "vector_ops", None)
    llm_client = getattr(request.app.state, "llm_client", None)
    response = {
        "ingested_at": ingested_at,
        "run_count": 0,
        "knowledge_count": 0,
        "graph_written": 0,
        "vector_written": 0,
        "graph_available": graph_ops is not None,
        "vector_available": vector_ops is not None and llm_client is not None,
        "errors": [],
    }
    try:
        _save_unified_automation_records(run)
        for item in build_run_knowledge_items(run):
            api_execution_store.save_knowledge_item(item)
            response["knowledge_count"] += 1
            if vector_ops is not None and llm_client is not None:
                response["vector_written"] += await _index_knowledge_item(vector_ops, llm_client, item)
        if response["knowledge_count"]:
            _invalidate_knowledge_index()
        if graph_ops is not None:
            graph_result = await write_run_to_graph_with_retry(graph_ops, run)
            if graph_result["success"]:
                response["graph_written"] += graph_result["written"]
            else:
                response["errors"].append(f"图谱写入失败: {graph_result['error']}")
                task = api_execution_store.save_automation_task(
                    build_graph_write_failure_task(run, graph_result["error"], graph_result["attempt"])
                )
                _log_task_event(task, "knowledge_write_failed")
        response["run_count"] += 1
    except Exception as exc:
        response["errors"].append(f"{run.get('run_id', '<unknown>')}: {exc}")
    return response


async def _index_knowledge_item(vector_ops: Any, llm_client: Any, item: dict[str, Any]) -> int:
    try:
        embedding = await _generate_embedding(llm_client, _knowledge_item_text(item))
        ok = await vector_ops.create_document_chunk(
            doc_type="api_execution_knowledge",
            module=item.get("project_id", "") or "api_execution",
            filename=item.get("knowledge_id", ""),
            chunk_index=0,
            content=_knowledge_item_text(item),
            section_path=item.get("source_run_id", ""),
            page_label=None,
            sheet_name=None,
            slide_label=None,
            block_type=item.get("item_type", ""),
            embedding=embedding,
        )
        return 1 if ok else 0
    except Exception:
        return 0


async def _search_historical_repair_context(
    request: Request,
    query: str,
    *,
    project_id: str = "",
    top_k: int = 3,
) -> list[dict[str, Any]]:
    vector_ops = getattr(request.app.state, "vector_ops", None)
    llm_client = getattr(request.app.state, "llm_client", None)
    if vector_ops is not None and llm_client is not None and query.strip():
        try:
            embedding = await _generate_embedding(llm_client, query)
            vector_results = await vector_ops.similarity_search(
                embedding,
                top_k=top_k,
                filters={"doc_type": "api_execution_knowledge"},
            )
            items = [_knowledge_item_from_vector(result) for result in vector_results]
            filtered = [
                item
                for item in items
                if item.get("item_type") in {"api_repair", "api_failure"}
                and (not project_id or item.get("project_id") in {"", project_id})
                and _vector_knowledge_item_is_active(item)
            ]
            if filtered:
                return filtered[:top_k]
        except Exception:
            pass
    return _search_local_repair_knowledge(query, project_id=project_id, top_k=top_k)


_KNOWLEDGE_INDEX: dict[str, Any] = {"items": None, "index": None, "ts": 0.0}
_KNOWLEDGE_INDEX_TTL = 60.0  # seconds


def _tokenize(text: str) -> list[str]:
    """Normalize text into searchable tokens, stripping punctuation."""
    import re
    cleaned = re.sub(r"[^\w\s]", " ", text)
    return [t for t in cleaned.lower().split() if t]


def _build_knowledge_index() -> tuple[list[dict[str, Any]], dict[str, list[int]]]:
    items = [
        item
        for item in api_execution_store.list_knowledge_items(limit=200)
        if item.get("item_type") in {"api_repair", "api_failure"}
        and _knowledge_status(item) == "active"
    ]
    index: dict[str, list[int]] = {}
    for i, item in enumerate(items):
        text = _knowledge_item_text(item).lower()
        for token in set(_tokenize(text)):
            index.setdefault(token, []).append(i)
    return items, index


def _get_knowledge_index() -> tuple[list[dict[str, Any]], dict[str, list[int]]]:
    import time as _time

    now = _time.monotonic()
    if _KNOWLEDGE_INDEX["items"] is None or now - _KNOWLEDGE_INDEX["ts"] > _KNOWLEDGE_INDEX_TTL:
        items, index = _build_knowledge_index()
        _KNOWLEDGE_INDEX["items"] = items
        _KNOWLEDGE_INDEX["index"] = index
        _KNOWLEDGE_INDEX["ts"] = now
    return _KNOWLEDGE_INDEX["items"], _KNOWLEDGE_INDEX["index"]


def _invalidate_knowledge_index() -> None:
    _KNOWLEDGE_INDEX["items"] = None
    _KNOWLEDGE_INDEX["index"] = None
    _KNOWLEDGE_INDEX["ts"] = 0.0


def _search_local_repair_knowledge(query: str, *, project_id: str = "", top_k: int = 3) -> list[dict[str, Any]]:
    tokens = _tokenize(query)
    items, index = _get_knowledge_index()

    if not tokens:
        filtered = [item for item in items if not project_id or item.get("project_id") in {"", project_id}]
        return filtered[:top_k]

    # score using inverted index: count how many query tokens appear in item text
    # apply project_id filter during scoring to keep indices aligned with the cached list
    candidate_scores: dict[int, int] = {}
    for token in tokens:
        for idx in index.get(token, []):
            if idx < len(items) and (not project_id or items[idx].get("project_id") in {"", project_id}):
                candidate_scores[idx] = candidate_scores.get(idx, 0) + 1

    scored = [
        (score, items[idx])
        for idx, score in candidate_scores.items()
    ]
    scored.sort(key=lambda pair: (pair[0], pair[1].get("created_at", "")), reverse=True)
    return [item for _score, item in scored[:top_k]]


def _get_knowledge_item(knowledge_id: str) -> dict[str, Any] | None:
    for item in api_execution_store.list_knowledge_items(limit=500):
        if item.get("knowledge_id") == knowledge_id:
            return item
    return None


def _vector_knowledge_item_is_active(item: dict[str, Any]) -> bool:
    knowledge_id = item.get("knowledge_id", "")
    if not knowledge_id:
        return True
    local_item = _get_knowledge_item(knowledge_id)
    return not local_item or _knowledge_status(local_item) == "active"


def _knowledge_status(item: dict[str, Any]) -> str:
    status = str(item.get("status") or "active").strip()
    return status if status in {"active", "invalid", "revoked"} else "active"


def _normalize_knowledge_item(item: dict[str, Any]) -> dict[str, Any]:
    return {
        **item,
        "status": _knowledge_status(item),
        "invalidated_at": item.get("invalidated_at"),
        "revoked_at": item.get("revoked_at"),
        "governance_note": item.get("governance_note", ""),
    }


async def _generate_embedding(llm_client: Any, text: str) -> list[float]:
    model_name = settings.EMBEDDING_MODEL or "text-embedding-3-small"
    kwargs = {
        "model": model_name,
        "input": text[:6000],
    }
    if settings.EMBEDDING_DIM and "text-embedding-3" in model_name:
        kwargs["dimensions"] = settings.EMBEDDING_DIM
    response = await llm_client.embeddings.create(**kwargs)
    return response.data[0].embedding


def _knowledge_item_text(item: dict[str, Any]) -> str:
    return json.dumps(
        {
            "type": item.get("item_type", ""),
            "summary": item.get("summary", ""),
            "payload": item.get("payload") or {},
        },
        ensure_ascii=False,
    )


def _knowledge_item_from_vector(result: dict[str, Any]) -> dict[str, Any]:
    item_type = result.get("block_type", "")
    project_id = result.get("module", "")
    source_run_id = result.get("section_path", "")
    content = result.get("content", "")
    payload: dict[str, Any] = {}
    summary = content
    try:
        parsed = json.loads(content)
        if isinstance(parsed, dict):
            summary = str(parsed.get("summary") or content)
            payload = parsed.get("payload") or {}
            item_type = item_type or str(parsed.get("type") or "")
    except Exception:
        pass
    return {
        "knowledge_id": result.get("filename", ""),
        "item_type": item_type,
        "source_run_id": source_run_id,
        "project_id": project_id,
        "created_at": "",
        "summary": summary,
        "payload": payload,
    }


def _repair_context_query(script: APITestCaseDsl, report: dict[str, Any]) -> str:
    failed_results = [
        result
        for result in report.get("results", []) or []
        if result.get("status") != "passed"
    ]
    failed_step_ids = {str(result.get("step_id")) for result in failed_results if result.get("step_id")}
    failed_steps = [
        step
        for step in script.steps or []
        if not failed_step_ids or step.id in failed_step_ids
    ]
    return json.dumps(
        {
            "case": script.name,
            "failed_steps": [
                {
                    "id": step.id,
                    "method": step.method,
                    "path": step.path,
                    "operation_id": step.operation_id,
                }
                for step in failed_steps
            ],
            "errors": [
                {
                    "step_id": result.get("step_id"),
                    "status_code": result.get("status_code"),
                    "error": result.get("error"),
                    "assertions": result.get("assertions", []),
                }
                for result in failed_results
            ],
        },
        ensure_ascii=False,
    )


__all__ = [name for name in globals() if not name.startswith("__")]
