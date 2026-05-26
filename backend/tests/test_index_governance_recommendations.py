from types import SimpleNamespace

import pytest
from fastapi import HTTPException

from app.index_governance import router
from app.index_governance.recommendations import build_governance_recommendations


def test_build_recommendations_for_missing_and_orphan_vectors():
    response = build_governance_recommendations(
        assets=[
            {
                "key": "documents",
                "name": "文档知识",
                "neo4j_count": 10,
                "qdrant_count": 7,
                "missing_in_qdrant_count": 3,
                "orphan_in_qdrant_count": 2,
                "issue_count": 5,
                "orphan_qdrant_samples": ["old-1"],
            }
        ],
        diagnostics=[],
        ai_summary={"total": 0},
        cache_status={},
    )

    ids = {item["id"] for item in response["items"]}
    assert "missing_qdrant:documents" in ids
    assert "orphan_qdrant:documents" in ids
    missing = next(item for item in response["items"] if item["id"] == "missing_qdrant:documents")
    assert missing["actions"][0]["kind"] == "rebuild_qdrant"
    assert missing["actions"][0]["requires_confirm"] is True


def test_build_recommendations_for_rag_failure_rate():
    response = build_governance_recommendations(
        assets=[],
        diagnostics=[],
        ai_summary={"total": 10, "failed_count": 2, "degraded_count": 0, "avg_latency_ms": 300},
        cache_status={},
    )

    item = next(item for item in response["items"] if item["id"] == "rag_stability:index_scan")
    assert item["severity"] == "error"
    assert item["actions"][0]["kind"] == "scan_index"
    assert item["related_links"][0]["page"] == "ai_observability"


def test_unknown_recommendation_action_is_rejected():
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    body = router.RecommendationActionRequest(action="drop_everything", confirm=True)

    with pytest.raises(HTTPException) as exc:
        router.asyncio.run(router.execute_index_governance_recommendation_action(request, body))

    assert exc.value.status_code == 400


def test_rebuild_recommendation_requires_confirm(monkeypatch):
    monkeypatch.setattr(router, "_get_asset_definition", lambda _key: {"name": "文档知识"})

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    body = router.RecommendationActionRequest(action="rebuild_qdrant", asset_key="documents", confirm=False)

    with pytest.raises(HTTPException) as exc:
        router.asyncio.run(router.execute_index_governance_recommendation_action(request, body))

    assert exc.value.status_code == 400


def test_scan_recommendation_action_logs_event(monkeypatch):
    events = []

    async def fake_scan(_request):
        return {"summary": {"issue_count": 0}}

    monkeypatch.setattr(router, "scan_index_governance", fake_scan)
    monkeypatch.setattr(router, "_log_index_governance_event", lambda *args, **kwargs: events.append((args, kwargs)))

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    body = router.RecommendationActionRequest(action="scan_index")

    response = router.asyncio.run(router.execute_index_governance_recommendation_action(request, body))

    assert response["action"] == "scan_index"
    assert events
    assert events[-1][0][1] == "index_governance_recommendation_action_executed"
