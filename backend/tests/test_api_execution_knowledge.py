import asyncio
from types import SimpleNamespace

from fastapi import FastAPI
from fastapi.testclient import TestClient

from app.api_execution import routers
from app.api_execution.routes import knowledge as knowledge_routes
from app.api_execution.knowledge import build_run_knowledge_items, write_run_to_graph
from app.api_execution.storage import APIExecutionStore


class FakeGraphOps:
    def __init__(self):
        self.queries = []

    async def run_cypher(self, cypher, params=None):
        self.queries.append((cypher, params or {}))
        return []


def test_build_run_knowledge_items_includes_summary_failure_and_repair():
    run = _run(status="failed")
    run["failure_diagnostics"] = [{"step_id": "s1", "explanation": "状态码不符合预期"}]
    run["repair_history"] = [{"created_at": "2026-04-29T00:00:00Z", "before": {"failed": 1}, "after": {"failed": 0}}]

    items = build_run_knowledge_items(run)

    assert {item["item_type"] for item in items} == {"api_run_summary", "api_failure", "api_repair"}
    assert items[0]["source_run_id"] == "run-1"


def test_write_run_to_graph_creates_coverage_relationships():
    graph_ops = FakeGraphOps()

    written = asyncio.run(write_run_to_graph(graph_ops, _run(status="failed")))

    assert written > 0
    cypher_text = "\n".join(query for query, _params in graph_ops.queries)
    assert "MERGE (tc)-[:COVERS]->(f)" in cypher_text
    assert "FAILED_AT" in cypher_text


def test_ingest_runs_to_knowledge_saves_unified_records(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_run(_run(status="passed"))
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(graph_ops=FakeGraphOps())))

    response = asyncio.run(routers.ingest_runs_to_knowledge(request, limit=10))

    assert response["run_count"] == 1
    assert response["knowledge_count"] >= 1
    assert response["graph_written"] > 0
    assert store.list_automation_runs()[0]["source_run_id"] == "run-1"
    assert store.list_knowledge_items()[0]["source_run_id"] == "run-1"


def test_search_repair_knowledge_falls_back_to_local_store(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_knowledge_item(
        {
            "knowledge_id": "repair-1",
            "item_type": "api_repair",
            "source_run_id": "run-1",
            "project_id": "project-1",
            "created_at": "2026-04-29T00:00:00Z",
            "summary": "GET /health 状态码 201 扩展到 status_code_in",
            "payload": {"path": "/health"},
        }
    )
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(vector_ops=None, llm_client=None)))

    response = asyncio.run(routers.search_repair_knowledge(request, query="health 201", project_id="project-1"))

    assert response["items"][0]["knowledge_id"] == "repair-1"


def test_search_repair_knowledge_ignores_invalid_items(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    routers._invalidate_knowledge_index()
    store.save_knowledge_item(
        {
            "knowledge_id": "repair-invalid",
            "item_type": "api_repair",
            "source_run_id": "run-1",
            "project_id": "project-1",
            "status": "invalid",
            "created_at": "2026-04-29T00:01:00Z",
            "summary": "GET /health 状态码 201 扩展到 status_code_in",
            "payload": {"path": "/health"},
        }
    )
    store.save_knowledge_item(
        {
            "knowledge_id": "repair-active",
            "item_type": "api_repair",
            "source_run_id": "run-2",
            "project_id": "project-1",
            "status": "active",
            "created_at": "2026-04-29T00:00:00Z",
            "summary": "GET /health 状态码 201 扩展到 status_code_in",
            "payload": {"path": "/health"},
        }
    )
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(vector_ops=None, llm_client=None)))

    response = asyncio.run(routers.search_repair_knowledge(request, query="health 201", project_id="project-1"))

    assert [item["knowledge_id"] for item in response["items"]] == ["repair-active"]


def test_knowledge_review_and_status_update(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_knowledge_item(
        {
            "knowledge_id": "repair-1",
            "item_type": "api_repair",
            "source_run_id": "run-1",
            "project_id": "project-1",
            "created_at": "2026-04-29T00:00:00Z",
            "summary": "修复经验",
            "payload": {"repair_effect_score": {"score": 90}},
        }
    )

    review = asyncio.run(routers.list_knowledge_review_items(project_id="project-1", status="active"))
    assert review["items"][0]["status"] == "active"

    response = asyncio.run(
        routers.update_knowledge_item_status(
            "repair-1",
            routers.KnowledgeStatusUpdateRequest(status="invalid", note="接口已下线"),
        )
    )

    assert response["status"] == "invalid"
    assert response["governance_note"] == "接口已下线"
    assert store.list_knowledge_items()[0]["invalidated_at"]


def test_knowledge_review_route_accepts_governance_asset_limit(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    app = FastAPI()
    app.include_router(knowledge_routes.router, prefix="/api/api-execution")
    client = TestClient(app)

    response = client.get("/api/api-execution/knowledge/review?limit=500&offset=0")

    assert response.status_code == 200
    assert response.json()["limit"] == 500


def test_delete_knowledge_item_requires_non_active_status(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_knowledge_item(
        {
            "knowledge_id": "repair-1",
            "item_type": "api_repair",
            "source_run_id": "run-1",
            "project_id": "project-1",
            "created_at": "2026-04-29T00:00:00Z",
            "status": "active",
            "summary": "修复经验",
            "payload": {},
        }
    )

    try:
        asyncio.run(routers.delete_knowledge_item("repair-1"))
    except Exception as exc:
        assert "先标记失效或撤回使用" in str(exc)
    else:
        raise AssertionError("active knowledge item should not be deleted directly")

    asyncio.run(
        routers.update_knowledge_item_status(
            "repair-1",
            routers.KnowledgeStatusUpdateRequest(status="invalid"),
        )
    )
    response = asyncio.run(routers.delete_knowledge_item("repair-1"))

    assert response == {"deleted": True}
    assert store.list_knowledge_items() == []


def test_ingest_runs_indexes_knowledge_when_vector_available(tmp_path, monkeypatch):
    class FakeVectorOps:
        def __init__(self):
            self.created = []

        async def create_document_chunk(self, **kwargs):
            self.created.append(kwargs)
            return True

    class FakeEmbeddingClient:
        class Embeddings:
            async def create(self, **kwargs):
                return SimpleNamespace(data=[SimpleNamespace(embedding=[0.1] * 1024)])

        embeddings = Embeddings()

    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_run(_run(status="passed"))
    vector_ops = FakeVectorOps()
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(graph_ops=None, vector_ops=vector_ops, llm_client=FakeEmbeddingClient())))

    response = asyncio.run(routers.ingest_runs_to_knowledge(request, limit=10))

    assert response["vector_written"] >= 1
    assert vector_ops.created[0]["doc_type"] == "api_execution_knowledge"


def test_save_run_report_creates_knowledge_candidate(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)

    saved = routers._save_run_report(_run(status="passed"))

    tasks = store.list_automation_tasks(status="pending")
    assert saved["run_id"] == "run-1"
    assert tasks[0]["task_type"] == "knowledge_ingest_candidate"
    assert tasks[0]["run_id"] == "run-1"
    assert "可确认沉淀" in tasks[0]["reason"]


def test_approve_knowledge_candidate_ingests_and_resolves_task(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_run(_run(status="passed"))
    store.save_automation_task(
        {
            "task_id": "knowledge-candidate:run-1",
            "created_at": "2026-04-29T00:00:00Z",
            "updated_at": "2026-04-29T00:00:00Z",
            "task_type": "knowledge_ingest_candidate",
            "status": "pending",
            "run_id": "run-1",
            "project_id": "project-1",
            "environment_id": "env-1",
            "risk_level": "low",
            "reason": "可确认沉淀",
            "summary": {},
            "decision": {},
        }
    )
    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace(graph_ops=None, vector_ops=None, llm_client=None)))

    response = asyncio.run(routers.approve_knowledge_candidate(request, "knowledge-candidate:run-1"))

    assert response["knowledge_count"] >= 1
    task = store.get_automation_task("knowledge-candidate:run-1")
    assert task["status"] == "resolved"
    assert task["resolution_note"] == "已确认沉淀到知识库"


def test_create_run_knowledge_candidate_for_manual_repair_deposit(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    run = _run(status="passed")
    run["repair_history"] = [
        {
            "type": "controlled_repair_rerun",
            "created_at": "2026-04-29T00:01:00Z",
            "patched_fields": [{"step_id": "s1", "field": "assertions"}],
        }
    ]
    store.save_run(run)

    response = asyncio.run(routers.create_run_knowledge_candidate("run-1"))

    assert response["task_id"] == "knowledge-candidate:run-1"
    assert response["status"] == "pending"
    assert response["has_repair_history"] is True
    assert response["candidate_item_count"] >= 2
    task = store.get_automation_task("knowledge-candidate:run-1")
    assert task["decision"]["trigger_source"] == "manual_repair_deposit"
    assert task["summary"]["repair_count"] == 1


def test_create_run_knowledge_candidate_keeps_resolved_candidate(tmp_path, monkeypatch):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(routers, "api_execution_store", store)
    store.save_run(_run(status="passed"))
    store.save_automation_task(
        {
            "task_id": "knowledge-candidate:run-1",
            "created_at": "2026-04-29T00:00:00Z",
            "updated_at": "2026-04-29T00:00:00Z",
            "task_type": "knowledge_ingest_candidate",
            "status": "resolved",
            "run_id": "run-1",
            "project_id": "project-1",
            "environment_id": "env-1",
            "risk_level": "low",
            "reason": "已确认沉淀",
            "summary": {"candidate_item_count": 1},
            "decision": {},
        }
    )

    response = asyncio.run(routers.create_run_knowledge_candidate("run-1"))

    assert response["already_resolved"] is True
    assert store.get_automation_task("knowledge-candidate:run-1")["status"] == "resolved"


def _run(status: str) -> dict:
    return {
        "run_id": "run-1",
        "run_at": "2026-04-29T00:00:00Z",
        "case_id": "case-1",
        "case_name": "API smoke",
        "target_project": "Demo",
        "status": status,
        "passed": 0 if status == "failed" else 1,
        "failed": 1 if status == "failed" else 0,
        "duration_ms": 20,
        "execution_options": {
            "project_id": "project-1",
            "environment_id": "env-1",
            "project_policy_snapshot": {"name": "Demo"},
        },
        "script": {
            "case_id": "case-1",
            "name": "API smoke",
            "target_project": "Demo",
            "steps": [
                {
                    "id": "s1",
                    "name": "Health",
                    "method": "GET",
                    "path": "/health",
                    "operation_id": "health",
                }
            ],
        },
        "results": [
            {
                "step_id": "s1",
                "status": status,
                "status_code": 500 if status == "failed" else 200,
            }
        ],
    }
