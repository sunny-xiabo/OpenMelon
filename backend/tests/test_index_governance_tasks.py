from types import SimpleNamespace

from app.index_governance import router
from app.index_governance.tasks import IndexGovernanceTaskManager


def test_create_rebuild_qdrant_task_schedules_background_job(monkeypatch):
    manager = IndexGovernanceTaskManager()
    scheduled = []

    async def fake_rebuild(*_args, **_kwargs):
        return 0

    def fake_create_task(coro):
        scheduled.append(coro)
        coro.close()
        return SimpleNamespace(task_name="fake-task")

    monkeypatch.setattr(router, "task_manager", manager)
    monkeypatch.setattr(router, "_get_asset_definition", lambda _key: {"name": "API 知识"})
    monkeypatch.setattr(router, "_log_index_governance_event", lambda *args, **kwargs: None)
    monkeypatch.setattr(router.asyncio, "create_task", fake_create_task)
    monkeypatch.setattr(router, "_run_rebuild_qdrant_task", fake_rebuild)

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))
    body = router.CleanupRequest(asset_key="api_knowledge", confirm=True)

    response = router.asyncio.run(router.create_rebuild_qdrant_task(request, body))

    assert response["task"]["operation"] == "rebuild_qdrant"
    assert response["task"]["status"] == "queued"
    assert len(scheduled) == 1


def test_run_rebuild_qdrant_task_marks_task_succeeded(monkeypatch):
    manager = IndexGovernanceTaskManager()
    task = manager.create(asset_key="api_knowledge", operation="rebuild_qdrant")

    async def fake_rebuild(*_args, **_kwargs):
        return 42

    monkeypatch.setattr(router, "task_manager", manager)
    monkeypatch.setattr(router, "_get_asset_definition", lambda _key: {"name": "API 知识"})
    monkeypatch.setattr(router, "_log_index_governance_event", lambda *args, **kwargs: None)
    monkeypatch.setattr(router, "_rebuild_qdrant_from_neo4j", fake_rebuild)

    request = SimpleNamespace(app=SimpleNamespace(state=SimpleNamespace()))

    router.asyncio.run(router._run_rebuild_qdrant_task(request, task.task_id))

    updated = manager.get(task.task_id)
    assert updated is not None
    assert updated.status == "succeeded"
    assert updated.processed == 42
    assert updated.result["rebuilt"] == 42
