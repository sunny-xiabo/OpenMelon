import asyncio

from app.api_execution import run_queue
from app.api_execution.services import run_service
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
        queued = await run_queue.enqueue_run(_request(), {"base_url": "http://127.0.0.1:8000"})

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
                "url": "http://127.0.0.1:8000/one",
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
            second_result = {**first_result, "step_id": "s2", "name": "Step 2", "url": "http://127.0.0.1:8000/two"}
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
        queued = await run_queue.enqueue_run(_request(step_count=2), {"base_url": "http://127.0.0.1:8000"})
        saved = await _wait_for_status(store, queued["run_id"], {"passed", "failed", "cancelled"})

        assert saved["status"] == "passed"
        assert saved["progress_total"] == 2
        assert saved["progress_completed"] == 2
        assert [result["step_id"] for result in saved["results"]] == ["s1", "s2"]

    asyncio.run(scenario())


def test_background_run_tracks_three_get_steps_progress(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)

        async def fake_run_all_steps(*args, **kwargs):
            progress_callback = kwargs.get("progress_callback")
            results = []
            for index in range(1, 4):
                await progress_callback(
                    {
                        "progress_total": 3,
                        "progress_completed": len(results),
                        "current_step_id": f"s{index}",
                        "current_step_name": f"Step {index}",
                        "results": list(results),
                    }
                )
                results.append(
                    {
                        "step_id": f"s{index}",
                        "name": f"Step {index}",
                        "method": "GET",
                        "url": f"http://127.0.0.1:8000/step-{index}",
                        "status": "passed",
                        "status_code": 200,
                        "duration_ms": index,
                        "assertions": [],
                        "extracted": {},
                        "request": {},
                        "response": {},
                        "error": None,
                        "diagnostics": [],
                    }
                )
                await progress_callback(
                    {
                        "progress_total": 3,
                        "progress_completed": len(results),
                        "current_step_id": None,
                        "current_step_name": None,
                        "results": list(results),
                    }
                )
            return {
                "status": "passed",
                "duration_ms": 12,
                "total": 3,
                "passed": 3,
                "failed": 0,
                "skipped": 0,
                "progress_total": 3,
                "progress_completed": 3,
                "current_step_id": None,
                "current_step_name": None,
                "results": results,
            }

        monkeypatch.setattr(run_queue, "run_all_steps", fake_run_all_steps)
        queued = await run_queue.enqueue_run(_request(step_count=3), {"base_url": "http://127.0.0.1:8000"})
        saved = await _wait_for_status(store, queued["run_id"], {"passed"})

        assert saved["status"] == "passed"
        assert saved["progress_total"] == 3
        assert saved["progress_completed"] == 3
        assert saved["total"] == 3
        assert saved["passed"] == 3
        assert [result["method"] for result in saved["results"]] == ["GET", "GET", "GET"]

    asyncio.run(scenario())


def test_background_run_passes_cancel_check_to_runner(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)
        seen = {}

        async def fake_run_all_steps(*args, **kwargs):
            seen["cancel_check"] = kwargs.get("cancel_check")
            await run_queue._mark_cancelled(
                queued["run_id"],
                {
                    "status": "cancelled",
                    "failure_reason": "用户取消执行",
                    "current_step_id": None,
                    "current_step_name": None,
                },
            )
            assert seen["cancel_check"]() is True
            raise asyncio.CancelledError()

        monkeypatch.setattr(run_queue, "run_all_steps", fake_run_all_steps)
        queued = await run_queue.enqueue_run(_request(), {"base_url": "http://127.0.0.1:8000"})
        saved = await _wait_for_status(store, queued["run_id"], {"cancelled"})

        assert callable(seen["cancel_check"])
        assert saved["status"] == "cancelled"
        assert saved["failure_reason"] == "用户取消执行"

    asyncio.run(scenario())


def test_background_run_can_be_cancelled(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)

        async def slow_run_all_steps(*args, **kwargs):
            await asyncio.sleep(10)

        monkeypatch.setattr(run_queue, "run_all_steps", slow_run_all_steps)
        queued = await run_queue.enqueue_run(_request(), {"base_url": "http://127.0.0.1:8000"})
        await asyncio.sleep(0)

        cancelled = await run_queue.cancel_run(queued["run_id"])
        await asyncio.sleep(0)

        assert cancelled["status"] == "cancelled"
        assert store.get_run(queued["run_id"])["status"] == "cancelled"

    asyncio.run(scenario())


def test_background_run_timeout_finishes_failed(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)

        async def slow_run_all_steps(*args, **kwargs):
            await asyncio.sleep(1)

        monkeypatch.setattr(run_queue, "run_all_steps", slow_run_all_steps)
        queued = await run_queue.enqueue_run(
            _request().model_copy(update={"run_timeout_ms": 1}),
            {"base_url": "http://127.0.0.1:8000"},
        )
        saved = await _wait_for_status(store, queued["run_id"], {"failed"})

        assert saved["status"] == "failed"
        assert "后台执行超时（1 ms）" in saved["failure_reason"]
        assert saved["current_step_id"] is None
        assert saved["current_step_name"] is None

    asyncio.run(scenario())


def test_cancelled_run_is_not_overwritten_by_late_finish(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)

        store.save_run({
            "run_id": "run-late",
            "run_at": "2026-05-26T00:00:00Z",
            "status": "running",
            "duration_ms": 0,
            "results": [],
        })

        cancelled = await run_queue.cancel_run("run-late")
        finished = await run_queue._mark_finished(
            "run-late",
            {
                "status": "passed",
                "duration_ms": 12,
                "total": 1,
                "passed": 1,
                "failed": 0,
                "results": [],
            },
        )

        assert cancelled["status"] == "cancelled"
        assert finished["status"] == "cancelled"
        assert store.get_run("run-late")["status"] == "cancelled"

    asyncio.run(scenario())


def test_direct_run_cancel_persists_cancelled_report(monkeypatch, tmp_path):
    async def scenario():
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_service, "api_execution_store", store)

        async def fake_run_all_steps(*args, **kwargs):
            await asyncio.sleep(10)

        monkeypatch.setattr(run_service, "run_all_steps", fake_run_all_steps)
        task = asyncio.create_task(run_service.run_all_steps_service(_request().model_copy(update={"execution_id": "direct-test"})))
        await asyncio.sleep(0)

        cancelled = await run_service.cancel_direct_run_service("direct-test")
        assert cancelled["status"] == "cancelled"
        report = await task

        assert report["status"] == "cancelled"
        assert report["failure_reason"] == "用户强制结束执行"
        assert store.list_runs(limit=1)[0]["status"] == "cancelled"

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
            first = await run_queue.enqueue_run(_request(case_id="case_slow"), {"base_url": "http://127.0.0.1:8000"})
            await started.wait()
            second = await run_queue.enqueue_run(_request(case_id="case_waiting"), {"base_url": "http://127.0.0.1:8000"})
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
        base_url="http://127.0.0.1:8000",
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
    return RunScriptRequest(script=script, base_url="http://127.0.0.1:8000")
