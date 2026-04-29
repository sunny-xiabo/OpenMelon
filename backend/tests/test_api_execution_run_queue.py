import asyncio

from app.api_execution import run_queue
from app.api_execution.schemas import APITestCaseDsl, RunScriptRequest
from app.api_execution.storage import APIExecutionStore


def test_background_run_finishes_and_persists_report(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)

        async def fake_run_all_steps(*args, **kwargs):
            return {
                "status": "passed",
                "duration_ms": 12,
                "total": 1,
                "passed": 1,
                "failed": 0,
                "skipped": 0,
                "results": [],
            }

        monkeypatch.setattr(run_queue, "run_all_steps", fake_run_all_steps)
        queued = run_queue.enqueue_run(_request(), {"base_url": "http://example.test"})

        assert queued["status"] == "queued"
        saved = await _wait_for_status(store, queued["run_id"], {"passed", "failed", "cancelled"})
        assert saved["status"] == "passed"
        assert saved["mode"] == "background"
        assert saved["passed"] == 1

    asyncio.run(scenario())


def test_background_run_can_be_cancelled(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)

        async def slow_run_all_steps(*args, **kwargs):
            await asyncio.sleep(10)

        monkeypatch.setattr(run_queue, "run_all_steps", slow_run_all_steps)
        queued = run_queue.enqueue_run(_request(), {"base_url": "http://example.test"})
        await asyncio.sleep(0)

        cancelled = run_queue.cancel_run(queued["run_id"])
        await asyncio.sleep(0)

        assert cancelled["status"] == "cancelled"
        assert store.get_run(queued["run_id"])["status"] == "cancelled"

    asyncio.run(scenario())


async def _wait_for_status(store, run_id, statuses):
    for _ in range(50):
        saved = store.get_run(run_id)
        if saved and saved.get("status") in statuses:
            return saved
        await asyncio.sleep(0.01)
    raise AssertionError(f"run {run_id} did not reach {statuses}")


def _request():
    script = APITestCaseDsl(
        case_id="case_queue",
        name="后台执行 smoke",
        base_url="http://example.test",
        steps=[
            {
                "id": "s1",
                "name": "Ping",
                "method": "GET",
                "path": "/ping",
                "operation_id": "ping",
            }
        ],
    )
    return RunScriptRequest(script=script, base_url="http://example.test")
