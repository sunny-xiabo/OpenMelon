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


def test_index_governance_task_manager_persists_between_instances():
    manager = IndexGovernanceTaskManager()
    task = manager.create(asset_key="api_knowledge", operation="rebuild_qdrant")
    manager.update(task.task_id, status="running", processed=3)

    restored = IndexGovernanceTaskManager().get(task.task_id)

    assert restored is not None
    assert restored.task_id == task.task_id
    assert restored.status == "running"
    assert restored.processed == 3


def test_index_governance_task_manager_recovers_stale_tasks():
    manager = IndexGovernanceTaskManager()
    queued = manager.create(asset_key="api_knowledge", operation="rebuild_qdrant")
    running = manager.create(asset_key="documents", operation="rebuild_qdrant")
    manager.update(running.task_id, status="running")
    done = manager.create(asset_key="test_cases", operation="rebuild_qdrant")
    manager.update(done.task_id, status="succeeded")

    recovered = IndexGovernanceTaskManager().recover_stale_tasks()

    assert set(recovered) == {queued.task_id, running.task_id}
    assert IndexGovernanceTaskManager().get(queued.task_id).status == "failed"
    assert IndexGovernanceTaskManager().get(running.task_id).message == "服务重启后未自动恢复，请手动重试"
    assert IndexGovernanceTaskManager().get(done.task_id).status == "succeeded"
