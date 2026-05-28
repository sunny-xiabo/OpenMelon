from __future__ import annotations

import asyncio
from types import SimpleNamespace
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Request
from pydantic import BaseModel

from app.api.deps import require_production_auth
from app.api.ai_observability_service import get_ai_debug_settings, update_ai_debug_settings
from app.api.logging_service import safe_log_event
from app.engine.rag.cache import bump_rag_cache_version, clear_rag_cache, get_rag_cache_status
from app.api_execution.storage import api_execution_store
from app.config import settings
from app.index_governance.recommendations import build_governance_recommendations
from app.index_governance.tasks import TERMINAL_STATUSES, task_manager

router = APIRouter(prefix="/index-governance", tags=["index-governance"])

ASSET_DEFINITIONS = [
    {
        "key": "documents",
        "name": "文档知识",
        "asset_type": "document",
        "source": "文档管理 / 文档解析",
        "neo4j_label": "DocumentChunk",
        "qdrant_collection": "doc_chunks",
        "description": "普通文档解析后的 chunk 索引。",
    },
    {
        "key": "test_cases",
        "name": "测试用例",
        "asset_type": "test_case",
        "source": "测试用例生成结果",
        "neo4j_label": "TestCaseVector",
        "qdrant_collection": "test_cases",
        "description": "手动点击存入向量库后的历史测试用例。",
    },
    {
        "key": "api_knowledge",
        "name": "API 自动化知识",
        "asset_type": "api_knowledge",
        "source": "成功执行候选确认沉淀",
        "neo4j_label": "DocumentChunk",
        "qdrant_collection": "doc_chunks",
        "description": "API 执行候选确认沉淀后的知识索引。",
    },
]

MAX_DETAIL_SCAN = 5000
SAMPLE_SIZE = 5


class CleanupRequest(BaseModel):
    asset_key: str
    confirm: bool = False


class TaskActionRequest(BaseModel):
    confirm: bool = False


class RecommendationActionRequest(BaseModel):
    action: str
    asset_key: str = ""
    confirm: bool = False


@router.get("/summary")
async def get_index_governance_summary(request: Request) -> dict[str, Any]:
    assets = await _build_assets(request)
    total_neo4j = sum(_safe_int(item.get("neo4j_count")) for item in assets)
    total_qdrant = sum(_safe_int(item.get("qdrant_count")) for item in assets)
    issue_count = sum(_safe_int(item.get("issue_count")) for item in assets)
    unavailable = [item for item in assets if item.get("status") == "unavailable"]
    return {
        "neo4j_available": bool(getattr(request.app.state, "neo4j_available", False)),
        "qdrant_available": _qdrant_available(request),
        "asset_type_count": len(assets),
        "total_neo4j": total_neo4j,
        "total_qdrant": total_qdrant,
        "issue_count": issue_count,
        "status": "unavailable" if unavailable else ("attention" if issue_count else "healthy"),
    }


@router.get("/assets")
async def list_index_governance_assets(request: Request) -> dict[str, Any]:
    assets = await _build_assets(request)
    return {"items": assets, "total": len(assets)}


@router.get("/assets/{asset_key}/details")
async def get_index_governance_asset_details(request: Request, asset_key: str) -> dict[str, Any]:
    asset = next((item for item in await _build_assets(request) if item["key"] == asset_key), None)
    if asset is None:
        raise HTTPException(status_code=400, detail="不支持的资产类型")
    diff = await _get_asset_diff(request, asset_key)
    return {
        "asset": asset,
        "missing_in_qdrant": sorted(diff.get("missing_in_qdrant") or [])[:100],
        "orphan_in_qdrant": sorted(diff.get("orphan_in_qdrant") or [])[:100],
        "limit": MAX_DETAIL_SCAN,
        "message": "明细最多返回前 100 条，完整对账使用一致性扫描和后台任务。",
    }


@router.get("/diagnostics")
async def list_index_governance_diagnostics(request: Request) -> dict[str, Any]:
    assets = await _build_assets(request)
    diagnostics = _build_diagnostics_from_assets(assets)
    return {"items": diagnostics, "total": len(diagnostics)}


@router.get("/recommendations")
async def list_index_governance_recommendations(request: Request) -> dict[str, Any]:
    assets = await _build_assets(request)
    diagnostics = _build_diagnostics_from_assets(assets)
    ai_summary = api_execution_store.summarize_ai_call_logs(feature="rag")
    recent_failures = [
        item for item in api_execution_store.list_ai_call_logs(feature="rag", status="failed", limit=8)
        if ((item.get("data") or {}).get("debug_snapshot"))
    ]
    result = build_governance_recommendations(
        assets=assets,
        diagnostics=diagnostics,
        ai_summary=ai_summary,
        cache_status=get_rag_cache_status(),
        recent_failures=recent_failures,
    )
    result["context"] = {
        "rag_ai_summary": ai_summary,
        "rag_cache_status": get_rag_cache_status(),
        "ai_debug_enabled": bool(get_ai_debug_settings().get("enabled")),
    }
    return result


@router.post("/recommendations/actions", dependencies=[Depends(require_production_auth)])
async def execute_index_governance_recommendation_action(request: Request, body: RecommendationActionRequest) -> dict[str, Any]:
    action = body.action.strip()
    asset_key = body.asset_key.strip()
    if action == "scan_index":
        result = await scan_index_governance(request)
    elif action == "rebuild_qdrant":
        result = await create_rebuild_qdrant_task(request, CleanupRequest(asset_key=asset_key, confirm=body.confirm))
    elif action == "cleanup_orphans":
        result = await cleanup_index_governance_orphans(request, CleanupRequest(asset_key=asset_key, confirm=body.confirm))
    elif action == "cleanup_source_orphans":
        result = await cleanup_index_governance_source_orphans(request, CleanupRequest(asset_key=asset_key, confirm=body.confirm))
    elif action == "clear_rag_cache":
        version = clear_rag_cache("index_governance_recommendation")
        result = {"success": True, "version": version, "status": get_rag_cache_status(), "message": "已清空 RAG cache"}
    elif action == "enable_debug_snapshot":
        _require_confirm(body.confirm, "开启 AI/RAG 调试快照")
        result = update_ai_debug_settings({**get_ai_debug_settings(), "enabled": True, "retention_minutes": 30, "max_chars": 4000})
    else:
        raise HTTPException(status_code=400, detail="不支持的治理建议动作")
    _log_index_governance_event(
        "warning" if body.confirm else "info",
        "index_governance_recommendation_action_executed",
        "索引治理闭环动作已执行",
        f"已执行建议动作 {action}",
        refs=[asset_key, action],
        data={"action": action, "asset_key": asset_key, "result": result},
    )
    return {"action": action, "asset_key": asset_key, "result": result, "message": "建议动作已执行"}


@router.post("/scan", dependencies=[Depends(require_production_auth)])
async def scan_index_governance(request: Request) -> dict[str, Any]:
    assets = await _build_assets(request)
    diagnostics = _build_diagnostics_from_assets(assets)
    issue_count = sum(_safe_int(item.get("issue_count")) for item in assets)
    _log_index_governance_event(
        "warning" if issue_count else "info",
        "index_governance_scanned",
        "索引治理一致性扫描",
        f"扫描完成，发现 {issue_count} 个风险项",
        refs=[item["key"] for item in assets],
        data={"issue_count": issue_count, "assets": assets, "diagnostics": diagnostics},
    )
    return {
        "summary": {
            "asset_type_count": len(assets),
            "total_neo4j": sum(_safe_int(item.get("neo4j_count")) for item in assets),
            "total_qdrant": sum(_safe_int(item.get("qdrant_count")) for item in assets),
            "issue_count": issue_count,
        },
        "assets": assets,
        "diagnostics": diagnostics,
    }


def _build_diagnostics_from_assets(assets: list[dict[str, Any]]) -> list[dict[str, Any]]:
    diagnostics: list[dict[str, Any]] = []
    for asset in assets:
        neo4j_count = _safe_int(asset.get("neo4j_count"))
        qdrant_count = _safe_int(asset.get("qdrant_count"))
        business_count = _safe_int(asset.get("business_count"))
        missing_count = _safe_int(asset.get("missing_in_qdrant_count"))
        orphan_count = _safe_int(asset.get("orphan_in_qdrant_count"))
        source_orphan_count = _safe_int(asset.get("source_orphan_count"))
        if asset.get("status") == "unavailable":
            diagnostics.append({
                "level": "warning",
                "asset_key": asset["key"],
                "title": f"{asset['name']}索引不可完整检查",
                "detail": "Neo4j 或 Qdrant 当前不可用，无法确认双库一致性。",
                "action": "检查连接",
            })
            continue
        if source_orphan_count:
            diagnostics.append({
                "level": "warning",
                "asset_key": asset["key"],
                "title": f"{asset['name']}存在业务源缺失索引",
                "detail": f"业务源少于派生索引 {source_orphan_count} 条，请确认是否需要恢复业务记录或清理索引。",
                "action": "核对来源",
            })
        if orphan_count:
            diagnostics.append({
                "level": "warning",
                "asset_key": asset["key"],
                "title": f"{asset['name']}存在孤儿向量",
                "detail": f"Qdrant 有 {orphan_count} 条 point 未匹配到 Neo4j 节点，样本：{_format_samples(asset.get('orphan_qdrant_samples'))}",
                "action": "清理孤儿",
            })
        if missing_count:
            diagnostics.append({
                "level": "warning",
                "asset_key": asset["key"],
                "title": f"{asset['name']}存在缺失向量",
                "detail": f"Neo4j 有 {missing_count} 个节点没有对应 Qdrant point，样本：{_format_samples(asset.get('missing_in_qdrant_samples'))}",
                "action": "重建索引",
            })
        if not missing_count and not orphan_count and neo4j_count != qdrant_count:
            diagnostics.append({
                "level": "info",
                "asset_key": asset["key"],
                "title": f"{asset['name']}数量不一致",
                "detail": "明细扫描未覆盖全部记录，请提高扫描上限后复核。",
                "action": "扩大扫描",
            })
        if business_count and neo4j_count == 0 and qdrant_count == 0:
            diagnostics.append({
                "level": "info",
                "asset_key": asset["key"],
                "title": f"{asset['name']}尚未建立索引",
                "detail": "业务侧存在记录，但双库索引为空。",
                "action": "启动索引",
            })
    if not diagnostics:
        diagnostics.append({
            "level": "success",
            "asset_key": "all",
            "title": "索引明细一致",
            "detail": "当前未发现 Neo4j 与 Qdrant 明细差异。",
            "action": "继续观察",
        })
    return diagnostics


@router.post("/sync-status", dependencies=[Depends(require_production_auth)])
async def sync_index_governance_status(request: Request) -> dict[str, Any]:
    """Sync governance status for API knowledge into derived indexes."""
    items = [
        item for item in api_execution_store.list_knowledge_items(limit=500)
        if str(item.get("item_type") or "").startswith("api_")
    ]
    neo4j_updated = await _sync_api_knowledge_status_to_neo4j(request, items)
    qdrant_updated = await _sync_api_knowledge_status_to_qdrant(request, items)
    _log_index_governance_event(
        "info",
        "index_governance_status_synced",
        "索引治理状态同步",
        f"同步 API 知识状态 {len(items)} 条，Neo4j {neo4j_updated}，Qdrant {qdrant_updated}",
        refs=["api_knowledge"],
        data={"synced": len(items), "neo4j_updated": neo4j_updated, "qdrant_updated": qdrant_updated},
    )
    return {
        "synced": len(items),
        "neo4j_updated": neo4j_updated,
        "qdrant_updated": qdrant_updated,
        "message": "已同步 API 知识治理状态到 Neo4j/Qdrant 检索索引",
    }


@router.post("/cleanup-orphans", dependencies=[Depends(require_production_auth)])
async def cleanup_index_governance_orphans(request: Request, body: CleanupRequest) -> dict[str, Any]:
    _require_confirm(body.confirm, "清理孤儿向量")
    asset = _get_asset_definition(body.asset_key)
    diff = await _get_asset_diff(request, body.asset_key)
    orphan_ids = sorted(diff.get("orphan_in_qdrant") or [])
    if not orphan_ids:
        _log_index_governance_event(
            "info",
            "index_governance_orphan_cleanup_skipped",
            "索引治理孤儿向量清理跳过",
            f"{asset['name']}没有可清理的孤儿向量",
            refs=[body.asset_key],
            data={"asset_key": body.asset_key, "deleted_qdrant": 0},
        )
        return {
            "asset_key": body.asset_key,
            "deleted_qdrant": 0,
            "message": f"{asset['name']}没有可清理的孤儿向量",
        }
    deleted = await _delete_qdrant_ids(request, body.asset_key, orphan_ids)
    _log_index_governance_event(
        "warning",
        "index_governance_orphans_cleaned",
        "索引治理孤儿向量清理",
        f"已清理 {asset['name']}孤儿向量 {deleted} 条",
        refs=[body.asset_key, *orphan_ids[:SAMPLE_SIZE]],
        data={"asset_key": body.asset_key, "deleted_qdrant": deleted, "sample_ids": orphan_ids[:SAMPLE_SIZE]},
    )
    return {
        "asset_key": body.asset_key,
        "deleted_qdrant": deleted,
        "message": f"已清理 {asset['name']}孤儿向量 {deleted} 条",
    }


@router.post("/cleanup-source-orphans", dependencies=[Depends(require_production_auth)])
async def cleanup_index_governance_source_orphans(request: Request, body: CleanupRequest) -> dict[str, Any]:
    _require_confirm(body.confirm, "清理源缺失索引")
    if body.asset_key != "api_knowledge":
        raise HTTPException(status_code=400, detail="当前仅支持清理 API 自动化知识的业务源缺失索引")
    local_ids = _get_api_knowledge_ids()
    neo4j_deleted = await _delete_api_knowledge_source_orphans_from_neo4j(request, local_ids)
    qdrant_deleted = await _delete_api_knowledge_source_orphans_from_qdrant(request, local_ids)
    _log_index_governance_event(
        "warning",
        "index_governance_source_orphans_cleaned",
        "索引治理源缺失索引清理",
        f"已清理 API 自动化知识源缺失索引：Neo4j {neo4j_deleted}，Qdrant {qdrant_deleted}",
        refs=[body.asset_key],
        data={"asset_key": body.asset_key, "deleted_neo4j": neo4j_deleted, "deleted_qdrant": qdrant_deleted},
    )
    return {
        "asset_key": body.asset_key,
        "deleted_neo4j": neo4j_deleted,
        "deleted_qdrant": qdrant_deleted,
        "message": f"已清理 API 自动化知识源缺失索引：Neo4j {neo4j_deleted}，Qdrant {qdrant_deleted}",
    }


@router.post("/rebuild-qdrant", dependencies=[Depends(require_production_auth)])
async def rebuild_index_governance_qdrant(request: Request, body: CleanupRequest) -> dict[str, Any]:
    return await create_rebuild_qdrant_task(request, body)


@router.post("/rebuild-qdrant/tasks", dependencies=[Depends(require_production_auth)])
async def create_rebuild_qdrant_task(request: Request, body: CleanupRequest) -> dict[str, Any]:
    _require_confirm(body.confirm, "重建 Qdrant 向量")
    asset = _get_asset_definition(body.asset_key)
    task = task_manager.create(asset_key=body.asset_key, operation="rebuild_qdrant")
    _log_index_governance_event(
        "info",
        "index_governance_qdrant_rebuild_queued",
        "索引治理 Qdrant 重建已排队",
        f"{asset['name']} Qdrant 重建任务已进入队列",
        refs=[body.asset_key, task.task_id],
        data={"asset_key": body.asset_key, "task_id": task.task_id},
    )
    asyncio.create_task(_run_rebuild_qdrant_task(SimpleNamespace(app=request.app), task.task_id))
    return {
        "asset_key": body.asset_key,
        "task": task.to_dict(),
        "message": f"{asset['name']} Qdrant 重建任务已启动",
    }


@router.get("/tasks")
async def list_index_governance_tasks(limit: int = 20) -> dict[str, Any]:
    bounded_limit = max(1, min(limit, 100))
    items = [task.to_dict() for task in task_manager.list(bounded_limit)]
    return {"items": items, "total": len(items)}


@router.get("/tasks/{task_id}")
async def get_index_governance_task(task_id: str) -> dict[str, Any]:
    task = task_manager.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    return task.to_dict()


@router.post("/tasks/{task_id}/cancel", dependencies=[Depends(require_production_auth)])
async def cancel_index_governance_task(task_id: str, body: TaskActionRequest) -> dict[str, Any]:
    _require_confirm(body.confirm, "取消索引治理任务")
    task = task_manager.get(task_id)
    if task is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if task.status in TERMINAL_STATUSES:
        return {"task": task.to_dict(), "message": "任务已结束，无需取消"}
    task = task_manager.request_cancel(task_id)
    _log_index_governance_event(
        "warning",
        "index_governance_task_cancel_requested",
        "索引治理任务请求取消",
        f"已请求取消任务 {task_id}",
        refs=[task.asset_key, task_id] if task else [task_id],
        data={"task_id": task_id},
    )
    return {"task": task.to_dict() if task else None, "message": "已请求取消任务"}


@router.post("/tasks/{task_id}/retry", dependencies=[Depends(require_production_auth)])
async def retry_index_governance_task(request: Request, task_id: str, body: TaskActionRequest) -> dict[str, Any]:
    _require_confirm(body.confirm, "重试索引治理任务")
    previous = task_manager.get(task_id)
    if previous is None:
        raise HTTPException(status_code=404, detail="任务不存在")
    if previous.operation != "rebuild_qdrant":
        raise HTTPException(status_code=400, detail="当前仅支持重试 Qdrant 重建任务")
    if previous.status not in TERMINAL_STATUSES:
        raise HTTPException(status_code=400, detail="任务尚未结束，不能重试")
    _get_asset_definition(previous.asset_key)
    task = task_manager.create(asset_key=previous.asset_key, operation=previous.operation, retry_of=task_id)
    _log_index_governance_event(
        "info",
        "index_governance_task_retried",
        "索引治理任务重试",
        f"已从任务 {task_id} 发起重试",
        refs=[previous.asset_key, task_id, task.task_id],
        data={"task_id": task.task_id, "retry_of": task_id, "asset_key": previous.asset_key},
    )
    asyncio.create_task(_run_rebuild_qdrant_task(SimpleNamespace(app=request.app), task.task_id))
    return {"task": task.to_dict(), "message": "已发起重试任务"}


async def _build_assets(request: Request) -> list[dict[str, Any]]:
    neo4j_counts = await _get_neo4j_counts(request)
    qdrant_counts = await _get_qdrant_counts(request)
    neo4j_ids = await _get_neo4j_ids(request)
    qdrant_ids = await _get_qdrant_ids(request)
    vector_ops = getattr(request.app.state, "vector_ops", None)
    business_counts = _get_business_counts(request)
    assets = []
    for definition in ASSET_DEFINITIONS:
        key = definition["key"]
        neo4j_count = neo4j_counts.get(key)
        qdrant_count = qdrant_counts.get(key)
        neo4j_id_set = neo4j_ids.get(key)
        qdrant_id_set = qdrant_ids.get(key)
        business_count = business_counts.get(key, 0)
        issue_count = 0
        missing_in_qdrant: list[str] = []
        orphan_in_qdrant: list[str] = []
        status = "healthy"
        if neo4j_count is None or qdrant_count is None or neo4j_id_set is None or qdrant_id_set is None:
            status = "unavailable"
        else:
            missing_in_qdrant = sorted(neo4j_id_set - qdrant_id_set)
            orphan_in_qdrant = sorted(qdrant_id_set - neo4j_id_set)
            issue_count = len(missing_in_qdrant) + len(orphan_in_qdrant)
            source_orphan_count = _source_orphan_count(key, business_count, neo4j_count, qdrant_count)
            issue_count += source_orphan_count
            if issue_count:
                status = "attention"
        assets.append({
            **definition,
            "business_count": business_count,
            "neo4j_count": neo4j_count,
            "qdrant_count": qdrant_count,
            "qdrant_collection_info": (
                await vector_ops.get_qdrant_collection_info(definition["qdrant_collection"])
                if vector_ops is not None and hasattr(vector_ops, "get_qdrant_collection_info")
                else None
            ),
            "active_count": min(_safe_int(neo4j_count), _safe_int(qdrant_count)),
            "issue_count": issue_count,
            "missing_in_qdrant_count": len(missing_in_qdrant),
            "orphan_in_qdrant_count": len(orphan_in_qdrant),
            "source_orphan_count": _source_orphan_count(key, business_count, neo4j_count, qdrant_count),
            "missing_in_qdrant_samples": missing_in_qdrant[:SAMPLE_SIZE],
            "orphan_qdrant_samples": orphan_in_qdrant[:SAMPLE_SIZE],
            "scan_limited": (
                _safe_int(neo4j_count) > MAX_DETAIL_SCAN
                or _safe_int(qdrant_count) > MAX_DETAIL_SCAN
            ),
            "status": status,
            "last_sync": "实时扫描",
        })
    return assets


async def _get_asset_diff(request: Request, key: str) -> dict[str, set[str]]:
    _get_asset_definition(key)
    neo4j_ids = await _get_neo4j_ids(request)
    qdrant_ids = await _get_qdrant_ids(request)
    neo4j_set = neo4j_ids.get(key)
    qdrant_set = qdrant_ids.get(key)
    if neo4j_set is None or qdrant_set is None:
        raise HTTPException(status_code=503, detail="Neo4j 或 Qdrant 当前不可用，无法清理")
    return {
        "missing_in_qdrant": neo4j_set - qdrant_set,
        "orphan_in_qdrant": qdrant_set - neo4j_set,
    }


async def _get_neo4j_counts(request: Request) -> dict[str, int | None]:
    driver = getattr(request.app.state, "neo4j_driver", None)
    if driver is None:
        return {item["key"]: None for item in ASSET_DEFINITIONS}
    counts = {item["key"]: 0 for item in ASSET_DEFINITIONS}
    try:
        async with driver.session() as session:
            doc_result = await session.run(
                """
                MATCH (c:DocumentChunk)
                WHERE c.embedding IS NOT NULL
                RETURN
                  sum(CASE WHEN c.doc_type = 'api_execution_knowledge' THEN 1 ELSE 0 END) AS api_knowledge,
                  sum(CASE WHEN c.doc_type <> 'api_execution_knowledge' OR c.doc_type IS NULL THEN 1 ELSE 0 END) AS documents
                """
            )
            doc_record = await doc_result.single()
            if doc_record:
                counts["documents"] = int(doc_record.get("documents") or 0)
                counts["api_knowledge"] = int(doc_record.get("api_knowledge") or 0)
            tc_result = await session.run("MATCH (tc:TestCaseVector) WHERE tc.embedding IS NOT NULL RETURN count(tc) AS count")
            tc_record = await tc_result.single()
            counts["test_cases"] = int(tc_record.get("count") or 0) if tc_record else 0
    except Exception:
        return {item["key"]: None for item in ASSET_DEFINITIONS}
    return counts


async def _get_neo4j_ids(request: Request) -> dict[str, set[str] | None]:
    driver = getattr(request.app.state, "neo4j_driver", None)
    vector_ops = getattr(request.app.state, "vector_ops", None)
    if driver is None:
        return {item["key"]: None for item in ASSET_DEFINITIONS}
    ids: dict[str, set[str] | None] = {item["key"]: set() for item in ASSET_DEFINITIONS}
    try:
        async with driver.session() as session:
            doc_result = await session.run(
                """
                MATCH (c:DocumentChunk)
                WHERE c.embedding IS NOT NULL
                RETURN c.chunk_id AS id, c.doc_type AS doc_type
                ORDER BY c.chunk_id
                LIMIT $limit
                """,
                limit=MAX_DETAIL_SCAN,
            )
            async for record in doc_result:
                chunk_id = str(record.get("id") or "")
                if not chunk_id:
                    continue
                if record.get("doc_type") == "api_execution_knowledge":
                    ids["api_knowledge"].add(chunk_id)
                else:
                    ids["documents"].add(chunk_id)

            tc_result = await session.run(
                "MATCH (tc:TestCaseVector) WHERE tc.embedding IS NOT NULL RETURN tc.vector_id AS vector_id ORDER BY tc.vector_id LIMIT $limit",
                limit=MAX_DETAIL_SCAN,
            )
            async for record in tc_result:
                vector_id = str(record.get("vector_id") or "")
                if not vector_id:
                    continue
                if vector_ops is not None and hasattr(vector_ops, "_generate_uuid"):
                    ids["test_cases"].add(vector_ops._generate_uuid(vector_id))
                else:
                    ids["test_cases"].add(vector_id)
    except Exception:
        return {item["key"]: None for item in ASSET_DEFINITIONS}
    return ids


async def _get_qdrant_counts(request: Request) -> dict[str, int | None]:
    vector_ops = getattr(request.app.state, "vector_ops", None)
    qdrant = getattr(vector_ops, "_qdrant_client", None)
    if qdrant is None:
        return {item["key"]: None for item in ASSET_DEFINITIONS}
    counts = {item["key"]: 0 for item in ASSET_DEFINITIONS}
    try:
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        api_filter = Filter(
            must=[FieldCondition(key="doc_type", match=MatchValue(value="api_execution_knowledge"))]
        )
        non_api_filter = Filter(
            must_not=[FieldCondition(key="doc_type", match=MatchValue(value="api_execution_knowledge"))]
        )
        counts["api_knowledge"] = await _qdrant_count(qdrant, "doc_chunks", api_filter)
        counts["documents"] = await _qdrant_count(qdrant, "doc_chunks", non_api_filter)
        counts["test_cases"] = await _qdrant_count(qdrant, "test_cases", None)
    except Exception:
        return {item["key"]: None for item in ASSET_DEFINITIONS}
    return counts


async def _get_qdrant_ids(request: Request) -> dict[str, set[str] | None]:
    vector_ops = getattr(request.app.state, "vector_ops", None)
    qdrant = getattr(vector_ops, "_qdrant_client", None)
    if qdrant is None:
        return {item["key"]: None for item in ASSET_DEFINITIONS}
    ids: dict[str, set[str] | None] = {item["key"]: set() for item in ASSET_DEFINITIONS}
    try:
        from qdrant_client.models import FieldCondition, Filter, MatchValue

        api_filter = Filter(
            must=[FieldCondition(key="doc_type", match=MatchValue(value="api_execution_knowledge"))]
        )
        non_api_filter = Filter(
            must_not=[FieldCondition(key="doc_type", match=MatchValue(value="api_execution_knowledge"))]
        )
        ids["api_knowledge"] = await _scroll_qdrant_ids(qdrant, "doc_chunks", api_filter, "chunk_id")
        ids["documents"] = await _scroll_qdrant_ids(qdrant, "doc_chunks", non_api_filter, "chunk_id")
        ids["test_cases"] = await _scroll_qdrant_ids(qdrant, "test_cases", None, None)
    except Exception:
        return {item["key"]: None for item in ASSET_DEFINITIONS}
    return ids


async def _qdrant_count(qdrant: Any, collection: str, count_filter: Any) -> int:
    result = await qdrant.count(collection_name=collection, count_filter=count_filter, exact=True)
    return int(getattr(result, "count", 0) or 0)


async def _delete_qdrant_ids(request: Request, key: str, ids: list[str]) -> int:
    vector_ops = getattr(request.app.state, "vector_ops", None)
    qdrant = getattr(vector_ops, "_qdrant_client", None)
    if qdrant is None:
        raise HTTPException(status_code=503, detail="Qdrant 当前不可用")
    try:
        from qdrant_client.models import FieldCondition, Filter, MatchValue
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Qdrant 客户端不可用: {exc}") from exc

    deleted = 0
    if key == "test_cases":
        for point_id in ids:
            try:
                await qdrant.delete(collection_name="test_cases", points_selector=[point_id])
                deleted += 1
            except Exception:
                continue
        return deleted

    if key not in {"documents", "api_knowledge"}:
        raise HTTPException(status_code=400, detail="不支持的资产类型")

    for chunk_id in ids:
        must = [FieldCondition(key="chunk_id", match=MatchValue(value=chunk_id))]
        if key == "api_knowledge":
            must.append(FieldCondition(key="doc_type", match=MatchValue(value="api_execution_knowledge")))
        try:
            await qdrant.delete(
                collection_name="doc_chunks",
                points_selector=Filter(must=must),
            )
            deleted += 1
        except Exception:
            continue
    return deleted


async def _delete_api_knowledge_source_orphans_from_neo4j(request: Request, local_ids: set[str]) -> int:
    driver = getattr(request.app.state, "neo4j_driver", None)
    if driver is None:
        raise HTTPException(status_code=503, detail="Neo4j 当前不可用")
    try:
        async with driver.session() as session:
            result = await session.run(
                """
                MATCH (c:DocumentChunk {doc_type: 'api_execution_knowledge'})
                WHERE NOT c.filename IN $local_ids
                WITH collect(c) AS chunks
                WITH chunks, size(chunks) AS deleted
                FOREACH (chunk IN chunks | DETACH DELETE chunk)
                RETURN deleted
                """,
                local_ids=sorted(local_ids),
            )
            record = await result.single()
            return int(record.get("deleted") or 0) if record else 0
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=500, detail=f"Neo4j 清理失败: {exc}") from exc


async def _delete_api_knowledge_source_orphans_from_qdrant(request: Request, local_ids: set[str]) -> int:
    vector_ops = getattr(request.app.state, "vector_ops", None)
    qdrant = getattr(vector_ops, "_qdrant_client", None)
    if qdrant is None:
        raise HTTPException(status_code=503, detail="Qdrant 当前不可用")
    try:
        from qdrant_client.models import FieldCondition, Filter, MatchValue
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Qdrant 客户端不可用: {exc}") from exc

    api_filter = Filter(must=[
        FieldCondition(key="doc_type", match=MatchValue(value="api_execution_knowledge"))
    ])
    deleted = 0
    offset = None
    while True:
        points, offset = await qdrant.scroll(
            collection_name="doc_chunks",
            scroll_filter=api_filter,
            limit=256,
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        for point in points:
            payload = getattr(point, "payload", {}) or {}
            filename = str(payload.get("filename") or "")
            if filename in local_ids:
                continue
            try:
                await qdrant.delete(collection_name="doc_chunks", points_selector=[getattr(point, "id")])
                deleted += 1
            except Exception:
                continue
        if not offset:
            break
    return deleted


async def _run_rebuild_qdrant_task(request: Any, task_id: str) -> None:
    task = task_manager.get(task_id)
    if task is None:
        return
    asset = _get_asset_definition(task.asset_key)
    task_manager.update(task_id, status="running", message="正在读取 Neo4j 索引数据")
    _log_index_governance_event(
        "info",
        "index_governance_qdrant_rebuild_started",
        "索引治理 Qdrant 重建开始",
        f"开始从 Neo4j 重建 {asset['name']} Qdrant 向量",
        refs=[task.asset_key, task_id],
        data={"asset_key": task.asset_key, "task_id": task_id},
    )
    try:
        rebuilt = await _rebuild_qdrant_from_neo4j(request, task.asset_key, task_id=task_id)
        if task_manager.is_cancel_requested(task_id):
            task_manager.update(
                task_id,
                status="cancelled",
                message=f"{asset['name']} Qdrant 重建已取消",
                result={"rebuilt": rebuilt},
            )
            _log_index_governance_event(
                "warning",
                "index_governance_qdrant_rebuild_cancelled",
                "索引治理 Qdrant 重建已取消",
                f"{asset['name']} Qdrant 重建已取消，已处理 {rebuilt} 条",
                refs=[task.asset_key, task_id],
                data={"asset_key": task.asset_key, "task_id": task_id, "rebuilt": rebuilt},
            )
            return
        task_manager.update(
            task_id,
            status="succeeded",
            total=rebuilt,
            processed=rebuilt,
            message=f"已从 Neo4j 重建 {asset['name']} Qdrant 向量 {rebuilt} 条",
            result={"rebuilt": rebuilt},
        )
        _log_index_governance_event(
            "info",
            "index_governance_qdrant_rebuilt",
            "索引治理 Qdrant 重建完成",
            f"已从 Neo4j 重建 {asset['name']} Qdrant 向量 {rebuilt} 条",
            refs=[task.asset_key, task_id],
            data={"asset_key": task.asset_key, "task_id": task_id, "rebuilt": rebuilt},
        )
        # 自动清理重建后残留的孤儿向量（Qdrant 中有但 Neo4j 中已不存在的记录）
        try:
            diff = await _get_asset_diff(request, task.asset_key)
            orphan_ids = sorted(diff.get("orphan_in_qdrant") or [])
            if orphan_ids:
                deleted = await _delete_qdrant_ids(request, task.asset_key, orphan_ids)
                task_manager.update(task_id, result={"rebuilt": rebuilt, "cleaned_orphans": deleted})
                _log_index_governance_event(
                    "warning",
                    "index_governance_qdrant_rebuild_orphans_cleaned",
                    "索引治理 Qdrant 重建孤儿清理",
                    f"重建 {asset['name']} 后自动清理孤儿向量 {deleted} 条",
                    refs=[task.asset_key, task_id, *orphan_ids[:SAMPLE_SIZE]],
                    data={"asset_key": task.asset_key, "task_id": task_id, "rebuilt": rebuilt, "cleaned_orphans": deleted},
                )
        except Exception:
            pass  # 孤儿清理失败不影响重建结果
        if rebuilt > 0:
            bump_rag_cache_version("qdrant_rebuilt")
    except Exception as exc:
        error_message = _exception_message(exc)
        task_manager.update(
            task_id,
            status="failed",
            error=error_message,
            message=f"{asset['name']} Qdrant 重建失败",
        )
        _log_index_governance_event(
            "error",
            "index_governance_qdrant_rebuild_failed",
            "索引治理 Qdrant 重建失败",
            error_message,
            refs=[task.asset_key, task_id],
            data={"asset_key": task.asset_key, "task_id": task_id, "error": error_message},
        )


async def _rebuild_qdrant_from_neo4j(request: Request, key: str, task_id: str | None = None) -> int:
    _get_asset_definition(key)
    driver = getattr(request.app.state, "neo4j_driver", None)
    vector_ops = getattr(request.app.state, "vector_ops", None)
    qdrant = getattr(vector_ops, "_qdrant_client", None)
    if driver is None:
        raise HTTPException(status_code=503, detail="Neo4j 当前不可用")
    if qdrant is None or vector_ops is None:
        raise HTTPException(status_code=503, detail="Qdrant 当前不可用")
    try:
        from qdrant_client.models import PointStruct
    except Exception as exc:
        raise HTTPException(status_code=503, detail=f"Qdrant 客户端不可用: {exc}") from exc

    collection_name = _get_asset_definition(key)["qdrant_collection"]
    if hasattr(vector_ops, "ensure_qdrant_collection"):
        await vector_ops.ensure_qdrant_collection(
            collection_name,
            recreate=bool(getattr(settings, "QDRANT_FORCE_RECREATE_ON_QUANTIZATION", False)),
        )

    if key in {"documents", "api_knowledge"}:
        records = await _load_document_chunks_for_rebuild(request, key)
        if task_id:
            task_manager.update(task_id, total=len(records), message="正在写入 Qdrant 向量点")
        if not records:
            return 0
        rebuilt = 0
        points = []
        for item in records:
            if task_id and task_manager.is_cancel_requested(task_id):
                break
            embedding = item.get("embedding")
            chunk_id = item.get("chunk_id")
            if not embedding or not chunk_id:
                continue
            payload = {k: v for k, v in item.items() if k != "embedding"}
            points.append(PointStruct(
                id=vector_ops._generate_uuid(chunk_id),
                vector=embedding,
                payload=payload,
            ))
            if len(points) >= 128:
                await qdrant.upsert(collection_name=collection_name, points=points)
                rebuilt += len(points)
                points = []
                if task_id:
                    task_manager.update(task_id, processed=rebuilt)
        if points and not (task_id and task_manager.is_cancel_requested(task_id)):
            await qdrant.upsert(collection_name=collection_name, points=points)
            rebuilt += len(points)
            if task_id:
                task_manager.update(task_id, processed=rebuilt)
        return rebuilt

    if key == "test_cases":
        records = await _load_test_case_vectors_for_rebuild(request)
        if task_id:
            task_manager.update(task_id, total=len(records), message="正在写入 Qdrant 向量点")
        if not records:
            return 0
        rebuilt = 0
        points = []
        for item in records:
            if task_id and task_manager.is_cancel_requested(task_id):
                break
            embedding = item.get("embedding")
            vector_id = item.get("vector_id")
            if not embedding or not vector_id:
                continue
            points.append(PointStruct(
                id=vector_ops._generate_uuid(vector_id),
                vector=embedding,
                payload={
                    "test_case_id": item.get("test_case_id") or vector_id,
                    "test_case_name": item.get("test_case_name", ""),
                    "description": item.get("description", ""),
                    "steps": item.get("steps", ""),
                    "module": item.get("module"),
                    "priority": item.get("priority"),
                },
            ))
            if len(points) >= 128:
                await qdrant.upsert(collection_name=collection_name, points=points)
                rebuilt += len(points)
                points = []
                if task_id:
                    task_manager.update(task_id, processed=rebuilt)
        if points and not (task_id and task_manager.is_cancel_requested(task_id)):
            await qdrant.upsert(collection_name=collection_name, points=points)
            rebuilt += len(points)
            if task_id:
                task_manager.update(task_id, processed=rebuilt)
        return rebuilt

    raise HTTPException(status_code=400, detail="不支持的资产类型")


async def _load_document_chunks_for_rebuild(request: Request, key: str) -> list[dict[str, Any]]:
    driver = getattr(request.app.state, "neo4j_driver", None)
    if driver is None:
        return []
    doc_predicate = "c.doc_type = 'api_execution_knowledge'" if key == "api_knowledge" else "(c.doc_type <> 'api_execution_knowledge' OR c.doc_type IS NULL)"
    query = f"""
        MATCH (c:DocumentChunk)
        WHERE {doc_predicate}
        RETURN c.chunk_id AS chunk_id,
               c.doc_type AS doc_type,
               c.module AS module,
               c.filename AS filename,
               c.chunk_index AS chunk_index,
               c.content AS content,
               c.section_path AS section_path,
               c.page_label AS page_label,
               c.sheet_name AS sheet_name,
               c.slide_label AS slide_label,
               c.block_type AS block_type,
               c.status AS status,
               c.embedding AS embedding
        ORDER BY c.chunk_id
        LIMIT $limit
    """
    async with driver.session() as session:
        result = await session.run(query, limit=MAX_DETAIL_SCAN)
        return [dict(record) async for record in result]


async def _load_test_case_vectors_for_rebuild(request: Request) -> list[dict[str, Any]]:
    driver = getattr(request.app.state, "neo4j_driver", None)
    if driver is None:
        return []
    query = """
        MATCH (tc:TestCaseVector)
        RETURN tc.vector_id AS vector_id,
               tc.test_case_id AS test_case_id,
               tc.test_case_name AS test_case_name,
               tc.description AS description,
               tc.steps AS steps,
               tc.module AS module,
               tc.priority AS priority,
               tc.embedding AS embedding
        ORDER BY tc.vector_id
        LIMIT $limit
    """
    async with driver.session() as session:
        result = await session.run(query, limit=MAX_DETAIL_SCAN)
        return [dict(record) async for record in result]


async def _sync_api_knowledge_status_to_neo4j(request: Request, items: list[dict[str, Any]]) -> int:
    driver = getattr(request.app.state, "neo4j_driver", None)
    if driver is None or not items:
        return 0
    payload = [
        {
            "knowledge_id": str(item.get("knowledge_id") or ""),
            "status": _normalize_status(item.get("status")),
        }
        for item in items
        if item.get("knowledge_id")
    ]
    if not payload:
        return 0
    try:
        async with driver.session() as session:
            result = await session.run(
                """
                UNWIND $items AS item
                MATCH (c:DocumentChunk {doc_type: 'api_execution_knowledge', filename: item.knowledge_id})
                SET c.status = item.status
                RETURN count(c) AS updated
                """,
                items=payload,
            )
            record = await result.single()
            return int(record.get("updated") or 0) if record else 0
    except Exception:
        return 0


async def _sync_api_knowledge_status_to_qdrant(request: Request, items: list[dict[str, Any]]) -> int:
    vector_ops = getattr(request.app.state, "vector_ops", None)
    qdrant = getattr(vector_ops, "_qdrant_client", None)
    if qdrant is None or not items:
        return 0
    try:
        from qdrant_client.models import FieldCondition, Filter, MatchValue
    except Exception:
        return 0

    updated = 0
    for item in items:
        knowledge_id = str(item.get("knowledge_id") or "")
        if not knowledge_id:
            continue
        status = _normalize_status(item.get("status"))
        try:
            await qdrant.set_payload(
                collection_name="doc_chunks",
                payload={"status": status},
                points_selector=Filter(must=[
                    FieldCondition(key="doc_type", match=MatchValue(value="api_execution_knowledge")),
                    FieldCondition(key="filename", match=MatchValue(value=knowledge_id)),
                ]),
            )
            updated += 1
        except Exception:
            continue
    return updated


async def _scroll_qdrant_ids(
    qdrant: Any,
    collection: str,
    scroll_filter: Any,
    payload_id_key: str | None,
) -> set[str]:
    ids: set[str] = set()
    offset = None
    while len(ids) < MAX_DETAIL_SCAN:
        points, offset = await qdrant.scroll(
            collection_name=collection,
            scroll_filter=scroll_filter,
            limit=min(256, MAX_DETAIL_SCAN - len(ids)),
            offset=offset,
            with_payload=True,
            with_vectors=False,
        )
        for point in points:
            payload = getattr(point, "payload", {}) or {}
            if payload_id_key:
                candidate = payload.get(payload_id_key)
            else:
                candidate = getattr(point, "id", None)
            if candidate:
                ids.add(str(candidate))
        if not offset:
            break
    return ids


def _get_business_counts(request: Request) -> dict[str, int]:
    file_tracker = getattr(request.app.state, "file_tracker", None)
    document_count = 0
    if file_tracker is not None:
        try:
            document_count = len(file_tracker.get_all_records())
        except Exception:
            document_count = 0
    try:
        api_knowledge_count = len(_get_api_knowledge_ids())
    except Exception:
        api_knowledge_count = 0
    return {
        "documents": document_count,
        "test_cases": 0,
        "api_knowledge": api_knowledge_count,
    }


def _qdrant_available(request: Request) -> bool:
    vector_ops = getattr(request.app.state, "vector_ops", None)
    return getattr(vector_ops, "_qdrant_client", None) is not None


def _get_api_knowledge_ids() -> set[str]:
    knowledge_items = api_execution_store.list_knowledge_items(limit=500)
    return {
        str(item.get("knowledge_id") or "")
        for item in knowledge_items
        if str(item.get("item_type") or "").startswith("api_") and item.get("knowledge_id")
    }


def _get_asset_definition(key: str) -> dict[str, Any]:
    for item in ASSET_DEFINITIONS:
        if item["key"] == key:
            return item
    raise HTTPException(status_code=400, detail="不支持的资产类型")


def _require_confirm(confirmed: bool, action: str) -> None:
    if not confirmed:
        raise HTTPException(status_code=400, detail=f"{action}需要显式确认")


def _log_index_governance_event(
    level: str,
    event_type: str,
    title: str,
    message: str = "",
    *,
    refs: list[Any] | None = None,
    data: dict[str, Any] | None = None,
) -> None:
    safe_log_event(
        level,
        "index_governance",
        event_type,
        title,
        message,
        source_id="index_governance",
        refs=refs,
        data=data,
    )


def _safe_int(value: Any) -> int:
    try:
        return int(value or 0)
    except Exception:
        return 0


def _exception_message(exc: Exception) -> str:
    detail = getattr(exc, "detail", None)
    return str(detail or exc or exc.__class__.__name__)


def _normalize_status(value: Any) -> str:
    status = str(value or "active").strip()
    return status if status in {"active", "invalid", "revoked", "deleted"} else "active"


def _source_orphan_count(
    key: str,
    business_count: int,
    neo4j_count: int | None,
    qdrant_count: int | None,
) -> int:
    if key != "api_knowledge":
        return 0
    indexed_count = max(_safe_int(neo4j_count), _safe_int(qdrant_count))
    return max(0, indexed_count - _safe_int(business_count))


def _format_samples(samples: Any) -> str:
    if not samples:
        return "无样本"
    return "、".join(str(item) for item in list(samples)[:SAMPLE_SIZE])
