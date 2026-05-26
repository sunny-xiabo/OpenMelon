from __future__ import annotations

from datetime import UTC, datetime
from typing import Any


RAG_FAILURE_RATE_WARN = 0.1
RAG_DEGRADED_RATE_WARN = 0.2
RAG_LATENCY_WARN_MS = 8000


def _safe_int(value: Any) -> int:
    try:
        return max(0, int(value or 0))
    except (TypeError, ValueError):
        return 0


def _safe_float(value: Any) -> float:
    try:
        return max(0.0, float(value or 0))
    except (TypeError, ValueError):
        return 0.0


def _now_iso() -> str:
    return datetime.now(UTC).replace(microsecond=0).isoformat().replace("+00:00", "Z")


def _action(
    action_id: str,
    label: str,
    *,
    kind: str,
    risk: str = "low",
    asset_key: str = "",
    requires_confirm: bool = False,
) -> dict[str, Any]:
    return {
        "id": action_id,
        "label": label,
        "kind": kind,
        "risk": risk,
        "asset_key": asset_key,
        "requires_confirm": requires_confirm,
    }


def _link(label: str, page: str, params: dict[str, Any] | None = None) -> dict[str, Any]:
    return {"label": label, "page": page, "params": params or {}}


def _recommendation(
    rec_id: str,
    title: str,
    *,
    severity: str,
    reason: str,
    evidence: list[dict[str, Any]],
    actions: list[dict[str, Any]],
    related_links: list[dict[str, Any]],
    domain: str = "rag_index_governance",
) -> dict[str, Any]:
    return {
        "id": rec_id,
        "title": title,
        "severity": severity,
        "status": "open",
        "domain": domain,
        "reason": reason,
        "evidence": evidence,
        "actions": actions,
        "related_links": related_links,
        "created_at": _now_iso(),
    }


def build_governance_recommendations(
    *,
    assets: list[dict[str, Any]],
    diagnostics: list[dict[str, Any]],
    ai_summary: dict[str, Any],
    cache_status: dict[str, Any],
    recent_failures: list[dict[str, Any]] | None = None,
) -> dict[str, Any]:
    recommendations: list[dict[str, Any]] = []
    issue_assets = [asset for asset in assets if _safe_int(asset.get("issue_count")) > 0]

    for asset in assets:
        asset_key = str(asset.get("key") or "")
        asset_name = str(asset.get("name") or asset_key)
        missing_count = _safe_int(asset.get("missing_in_qdrant_count"))
        orphan_count = _safe_int(asset.get("orphan_in_qdrant_count"))
        source_orphan_count = _safe_int(asset.get("source_orphan_count"))
        if missing_count:
            recommendations.append(_recommendation(
                f"missing_qdrant:{asset_key}",
                f"{asset_name}存在缺失向量",
                severity="error" if missing_count >= 100 else "warning",
                reason="Neo4j 中已有可检索节点，但 Qdrant 缺少对应 point，RAG 可能召回不完整。",
                evidence=[
                    {"label": "缺失向量", "value": missing_count},
                    {"label": "Neo4j 节点", "value": _safe_int(asset.get("neo4j_count"))},
                    {"label": "Qdrant points", "value": _safe_int(asset.get("qdrant_count"))},
                ],
                actions=[
                    _action("rebuild_qdrant", f"重建 {asset_name} Qdrant", kind="rebuild_qdrant", risk="high", asset_key=asset_key, requires_confirm=True),
                    _action("scan_index", "重新扫描", kind="scan_index"),
                ],
                related_links=[_link("查看治理明细", "index_governance", {"asset_key": asset_key})],
            ))
        if orphan_count:
            recommendations.append(_recommendation(
                f"orphan_qdrant:{asset_key}",
                f"{asset_name}存在孤儿向量",
                severity="warning",
                reason="Qdrant 中存在未匹配 Neo4j 节点的 point，可能造成过期内容被召回。",
                evidence=[
                    {"label": "孤儿向量", "value": orphan_count},
                    {"label": "样本", "value": ", ".join(map(str, asset.get("orphan_qdrant_samples") or [])) or "-"},
                ],
                actions=[
                    _action("cleanup_orphans", f"清理 {asset_name} 孤儿向量", kind="cleanup_orphans", risk="high", asset_key=asset_key, requires_confirm=True),
                    _action("scan_index", "重新扫描", kind="scan_index"),
                ],
                related_links=[_link("查看治理明细", "index_governance", {"asset_key": asset_key})],
            ))
        if source_orphan_count and asset_key == "api_knowledge":
            recommendations.append(_recommendation(
                f"source_orphan:{asset_key}",
                "API 自动化知识存在源缺失索引",
                severity="warning",
                reason="派生索引中存在业务源已不存在的 API 知识，可能污染 RAG 或修复经验召回。",
                evidence=[{"label": "源缺失索引", "value": source_orphan_count}],
                actions=[
                    _action("cleanup_source_orphans", "清理源缺失索引", kind="cleanup_source_orphans", risk="high", asset_key=asset_key, requires_confirm=True),
                    _action("scan_index", "重新扫描", kind="scan_index"),
                ],
                related_links=[_link("查看 API 知识治理", "index_governance", {"asset_key": asset_key})],
            ))

    total_ai_calls = _safe_int(ai_summary.get("total"))
    failed_count = _safe_int(ai_summary.get("failed_count"))
    degraded_count = _safe_int(ai_summary.get("degraded_count"))
    avg_latency = _safe_int(ai_summary.get("avg_latency_ms"))
    failure_rate = failed_count / total_ai_calls if total_ai_calls else 0
    degraded_rate = degraded_count / total_ai_calls if total_ai_calls else 0
    if total_ai_calls and (failure_rate >= RAG_FAILURE_RATE_WARN or degraded_rate >= RAG_DEGRADED_RATE_WARN):
        actions = [_action("scan_index", "扫描索引一致性", kind="scan_index")]
        if issue_assets:
            actions.append(_action("clear_rag_cache", "清空 RAG cache", kind="clear_rag_cache", risk="low"))
        recommendations.append(_recommendation(
            "rag_stability:index_scan",
            "RAG 失败或降级率升高",
            severity="error" if failure_rate >= RAG_FAILURE_RATE_WARN else "warning",
            reason="近期 RAG 调用出现失败/降级，建议先复查索引一致性，再处理派生索引问题。",
            evidence=[
                {"label": "RAG 调用", "value": total_ai_calls},
                {"label": "失败率", "value": f"{failure_rate * 100:.1f}%"},
                {"label": "降级率", "value": f"{degraded_rate * 100:.1f}%"},
            ],
            actions=actions,
            related_links=[
                _link("查看 AI/RAG 观测", "ai_observability", {"feature": "rag", "status": "failed" if failed_count else "degraded"}),
                _link("查看索引治理", "index_governance"),
            ],
        ))

    if total_ai_calls and avg_latency >= RAG_LATENCY_WARN_MS:
        recommendations.append(_recommendation(
            "rag_latency:cache_or_index",
            "RAG 平均耗时偏高",
            severity="warning",
            reason="RAG 平均耗时超过内部阈值，建议结合索引状态和缓存命中情况排查。",
            evidence=[
                {"label": "平均耗时", "value": f"{avg_latency} ms"},
                {"label": "检索缓存命中", "value": cache_status.get("retrieval_cache", {}).get("hits", 0)},
                {"label": "回答缓存命中", "value": cache_status.get("answer_cache", {}).get("hits", 0)},
            ],
            actions=[
                _action("scan_index", "扫描索引一致性", kind="scan_index"),
                _action("clear_rag_cache", "清空 RAG cache", kind="clear_rag_cache", risk="low"),
            ],
            related_links=[_link("查看 RAG 调用日志", "ai_observability", {"feature": "rag"})],
        ))

    if (failed_count or degraded_count) and not recent_failures:
        recommendations.append(_recommendation(
            "rag_debug:enable_snapshot",
            "RAG 异常缺少调试快照",
            severity="info",
            reason="近期存在 RAG 异常，但没有可用于定位 prompt/context 的快照，建议短期开启调试快照。",
            evidence=[{"label": "失败/降级次数", "value": failed_count + degraded_count}],
            actions=[
                _action("enable_debug_snapshot", "开启 30 分钟调试快照", kind="enable_debug_snapshot", risk="medium", requires_confirm=True),
            ],
            related_links=[_link("查看 AI/RAG 观测", "ai_observability", {"feature": "rag"})],
        ))

    severity_order = {"error": 0, "warning": 1, "info": 2}
    recommendations.sort(key=lambda item: (severity_order.get(item["severity"], 9), item["id"]))
    return {
        "items": recommendations,
        "total": len(recommendations),
        "summary": {
            "open_count": len(recommendations),
            "error_count": sum(1 for item in recommendations if item["severity"] == "error"),
            "warning_count": sum(1 for item in recommendations if item["severity"] == "warning"),
            "info_count": sum(1 for item in recommendations if item["severity"] == "info"),
            "diagnostic_count": len([item for item in diagnostics if item.get("level") != "success"]),
        },
    }
