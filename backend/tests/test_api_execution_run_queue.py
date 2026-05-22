import asyncio

from app.api_execution import run_queue
from app.api_execution.schemas import APITestCaseDsl, RunScriptRequest
from app.api_execution.storage import APIExecutionStore, override_api_execution_store
from app.config import settings


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
        queued = await run_queue.enqueue_run(_request(), {"base_url": "http://example.test"})

        assert queued["status"] == "queued"
        saved = await _wait_for_status(store, queued["run_id"], {"passed", "failed", "cancelled"})
        assert saved["status"] == "passed"
        assert saved["mode"] == "background"
        assert saved["passed"] == 1

    asyncio.run(scenario())


def test_background_run_updates_step_progress(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)

        async def fake_run_all_steps(*args, **kwargs):
            progress_callback = kwargs.get("progress_callback")
            first_result = {
                "step_id": "s1",
                "name": "Step 1",
                "method": "GET",
                "url": "http://example.test/one",
                "status": "passed",
                "status_code": 200,
                "duration_ms": 3,
                "assertions": [],
                "extracted": {},
                "request": {},
                "response": {},
                "error": None,
                "diagnostics": [],
            }
            second_result = {**first_result, "step_id": "s2", "name": "Step 2", "url": "http://example.test/two"}
            await progress_callback(
                {
                    "progress_total": 2,
                    "progress_completed": 0,
                    "current_step_id": "s1",
                    "current_step_name": "Step 1",
                    "results": [],
                }
            )
            running = store.get_run(queued["run_id"])
            assert running["current_step_id"] == "s1"
            await progress_callback(
                {
                    "progress_total": 2,
                    "progress_completed": 1,
                    "current_step_id": None,
                    "current_step_name": None,
                    "results": [first_result],
                }
            )
            updated = store.get_run(queued["run_id"])
            assert updated["progress_completed"] == 1
            assert updated["results"][0]["step_id"] == "s1"
            await progress_callback(
                {
                    "progress_total": 2,
                    "progress_completed": 2,
                    "current_step_id": None,
                    "current_step_name": None,
                    "results": [first_result, second_result],
                }
            )
            return {
                "status": "passed",
                "duration_ms": 12,
                "total": 2,
                "passed": 2,
                "failed": 0,
                "skipped": 0,
                "progress_total": 2,
                "progress_completed": 2,
                "current_step_id": None,
                "current_step_name": None,
                "results": [first_result, second_result],
            }

        monkeypatch.setattr(run_queue, "run_all_steps", fake_run_all_steps)
        queued = await run_queue.enqueue_run(_request(step_count=2), {"base_url": "http://example.test"})
        saved = await _wait_for_status(store, queued["run_id"], {"passed", "failed", "cancelled"})

        assert saved["status"] == "passed"
        assert saved["progress_total"] == 2
        assert saved["progress_completed"] == 2
        assert [result["step_id"] for result in saved["results"]] == ["s1", "s2"]

    asyncio.run(scenario())


def test_background_run_can_be_cancelled(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)

        async def slow_run_all_steps(*args, **kwargs):
            await asyncio.sleep(10)

        monkeypatch.setattr(run_queue, "run_all_steps", slow_run_all_steps)
        queued = await run_queue.enqueue_run(_request(), {"base_url": "http://example.test"})
        await asyncio.sleep(0)

        cancelled = await run_queue.cancel_run(queued["run_id"])
        await asyncio.sleep(0)

        assert cancelled["status"] == "cancelled"
        assert store.get_run(queued["run_id"])["status"] == "cancelled"

    asyncio.run(scenario())


def test_queue_status_uses_provider_store_and_config(monkeypatch, tmp_path):
    store = APIExecutionStore(tmp_path)
    monkeypatch.setattr(settings, "API_EXECUTION_MAX_CONCURRENT_RUNS", 3)
    monkeypatch.setattr(settings, "API_EXECUTION_QUEUE_WAIT_TIMEOUT_S", 7)
    monkeypatch.setattr(settings, "API_EXECUTION_SSE_QUEUE_SIZE", 1)
    run_queue.reset_queue_state_for_tests()
    store.save_run({"run_id": "queued-1", "run_at": "2026-05-21T00:00:00Z", "status": "queued"})
    store.save_run({"run_id": "running-1", "run_at": "2026-05-21T00:00:01Z", "status": "running"})

    with override_api_execution_store(store):
        queue = run_queue.subscribe_sse("queued-1")
        try:
            status = run_queue.get_queue_status()
        finally:
            run_queue.unsubscribe_sse("queued-1", queue)
            monkeypatch.setattr(settings, "API_EXECUTION_MAX_CONCURRENT_RUNS", 2)
            monkeypatch.setattr(settings, "API_EXECUTION_QUEUE_WAIT_TIMEOUT_S", 60)
            monkeypatch.setattr(settings, "API_EXECUTION_SSE_QUEUE_SIZE", 100)
            run_queue.reset_queue_state_for_tests()

    assert status["queue_mode"] == "single_process"
    assert status["max_concurrent_runs"] == 3
    assert status["queue_wait_timeout_s"] == 7
    assert status["sse_queue_size"] == 1
    assert status["storage_queued_count"] == 1
    assert status["storage_running_count"] == 1
    assert status["sse_subscriber_count"] == 1
    assert status["available_slots"] == 3


def test_sse_bounded_queue_drops_stale_progress(monkeypatch):
    monkeypatch.setattr(settings, "API_EXECUTION_SSE_QUEUE_SIZE", 1)
    run_queue.reset_queue_state_for_tests()
    queue = run_queue.subscribe_sse("run-1")
    try:
        asyncio.run(run_queue._broadcast_sse("run-1", "progress", {"seq": 1}))
        asyncio.run(run_queue._broadcast_sse("run-1", "progress", {"seq": 2}))
        message = queue.get_nowait()
    finally:
        run_queue.unsubscribe_sse("run-1", queue)
        monkeypatch.setattr(settings, "API_EXECUTION_SSE_QUEUE_SIZE", 100)
        run_queue.reset_queue_state_for_tests()

    assert message["data"]["seq"] == 2


def test_background_run_uses_configured_queue_timeout(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(settings, "API_EXECUTION_MAX_CONCURRENT_RUNS", 1)
        monkeypatch.setattr(settings, "API_EXECUTION_QUEUE_WAIT_TIMEOUT_S", 1)
        run_queue.reset_queue_state_for_tests()
        started = asyncio.Event()

        async def fake_run_all_steps(script, *args, **kwargs):
            if script.case_id == "case_slow":
                started.set()
                await asyncio.sleep(2)
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
        with override_api_execution_store(store):
            first = await run_queue.enqueue_run(_request(case_id="case_slow"), {"base_url": "http://example.test"})
            await started.wait()
            second = await run_queue.enqueue_run(_request(case_id="case_waiting"), {"base_url": "http://example.test"})
            saved = await _wait_for_status(store, second["run_id"], {"failed"})
            await run_queue.cancel_run(first["run_id"])
            monkeypatch.setattr(settings, "API_EXECUTION_MAX_CONCURRENT_RUNS", 2)
            monkeypatch.setattr(settings, "API_EXECUTION_QUEUE_WAIT_TIMEOUT_S", 60)
            run_queue.reset_queue_state_for_tests()

        assert "排队等待超时（1秒）" in saved["failure_reason"]

    asyncio.run(scenario())


async def _wait_for_status(store, run_id, statuses, attempts=200):
    for _ in range(attempts):
        saved = store.get_run(run_id)
        if saved and saved.get("status") in statuses:
            return saved
        await asyncio.sleep(0.01)
    raise AssertionError(f"run {run_id} did not reach {statuses}")


def _request(step_count=1, case_id="case_queue"):
    script = APITestCaseDsl(
        case_id=case_id,
        name="后台执行 smoke",
        base_url="http://example.test",
        steps=[
            {
                "id": f"s{index}",
                "name": f"Step {index}",
                "method": "GET",
                "path": f"/step-{index}",
                "operation_id": f"step_{index}",
            }
            for index in range(1, step_count + 1)
        ],
    )
    return RunScriptRequest(script=script, base_url="http://example.test")
