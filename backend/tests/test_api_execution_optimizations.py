import asyncio
from unittest.mock import AsyncMock, patch

from app.api_execution.runner import _read_path, _run_assertions, _build_step_levels, _detect_cycle, _needs_dag_execution
from app.api_execution.storage import APIExecutionStore
from app.api_execution import run_queue
from app.api_execution.knowledge import write_run_to_graph_with_retry, build_graph_write_failure_task
from app.api_execution.schemas import APIAssertion, APITestCaseDsl, APITestStep, RunScriptRequest


class TestReadPathBracketNotation:
    def test_dot_notation_basic(self):
        data = {"items": [{"name": "a"}, {"name": "b"}]}
        assert _read_path(data, "$.items.0.name") == "a"

    def test_bracket_notation(self):
        data = {"items": [{"name": "a"}, {"name": "b"}]}
        assert _read_path(data, "$.items[0].name") == "a"

    def test_bracket_notation_second_item(self):
        data = {"items": [{"name": "a"}, {"name": "b"}]}
        assert _read_path(data, "$.items[1].name") == "b"

    def test_bracket_notation_out_of_range(self):
        data = {"items": [{"name": "a"}]}
        assert _read_path(data, "$.items[5].name") is None

    def test_bracket_notation_on_dict(self):
        data = {"items": {"name": "a"}}
        assert _read_path(data, "$.items[name]") is None

    def test_missing_key_returns_none(self):
        data = {"items": [{}]}
        assert _read_path(data, "$.items.0.missing") is None

    def test_empty_path_returns_none(self):
        data = {"a": 1}
        assert _read_path(data, "$.") is None


class TestUnknownAssertionType:
    def test_unknown_type_fails(self):
        step = APITestStep(
            id="s1",
            name="test",
            method="GET",
            path="/test",
            operation_id="test_op",
            assertions=[APIAssertion(type="nonexistent_check", expected="foo")],
        )

        class FakeResponse:
            status_code = 200
            text = "ok"
            headers = {}

        results = _run_assertions(step, FakeResponse(), 100)
        assert len(results) == 1
        assert results[0].passed is False
        assert "未知断言类型" in results[0].message


class TestRecoverStaleRuns:
    def test_recover_stale_runs_marks_queued_and_running_as_failed(self, tmp_path):
        store = APIExecutionStore(tmp_path)
        store.save_run({"run_id": "r1", "status": "queued", "run_at": "2026-01-01T00:00:00Z"})
        store.save_run({"run_id": "r2", "status": "running", "run_at": "2026-01-01T00:00:00Z"})
        store.save_run({"run_id": "r3", "status": "passed", "run_at": "2026-01-01T00:00:00Z"})
        store.save_run({"run_id": "r4", "status": "failed", "run_at": "2026-01-01T00:00:00Z"})

        recovered = store.recover_stale_runs()
        assert set(recovered) == {"r1", "r2"}
        assert store.get_run("r1")["status"] == "failed"
        assert store.get_run("r1")["failure_reason"] == "服务重启，执行中断"
        assert store.get_run("r2")["status"] == "failed"
        assert store.get_run("r3")["status"] == "passed"
        assert store.get_run("r4")["status"] == "failed"

    def test_recover_stale_runs_returns_empty_when_no_stale(self, tmp_path):
        store = APIExecutionStore(tmp_path)
        store.save_run({"run_id": "r1", "status": "passed", "run_at": "2026-01-01T00:00:00Z"})
        assert store.recover_stale_runs() == []


class TestRunQueueRecoverStaleRuns:
    def test_recover_stale_runs_delegates_to_store(self, tmp_path, monkeypatch):
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)
        store.save_run({"run_id": "r1", "status": "queued", "run_at": "2026-01-01T00:00:00Z"})

        recovered = run_queue.recover_stale_runs()
        assert recovered == ["r1"]
        assert store.get_run("r1")["status"] == "failed"


def _make_rerun_request(max_reruns: int = 1) -> RunScriptRequest:
    return RunScriptRequest(
        script=APITestCaseDsl(
            case_id="c1",
            name="test case",
            steps=[
                APITestStep(
                    id="s1",
                    name="step1",
                    method="GET",
                    path="/api",
                    operation_id="op1",
                )
            ],
        ),
        project_policy_snapshot={"max_reruns": max_reruns},
    )


class TestAutoRerun:
    def test_auto_rerun_not_triggered_when_max_reruns_zero(self, tmp_path, monkeypatch):
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)
        store.save_run({"run_id": "r1", "status": "failed", "attempt": 1})

        request = _make_rerun_request(max_reruns=0)
        enqueue_mock = AsyncMock()
        monkeypatch.setattr(run_queue, "enqueue_run", enqueue_mock)

        asyncio.run(
            run_queue._maybe_auto_rerun("r1", request, None)
        )
        enqueue_mock.assert_not_called()

    def test_auto_rerun_triggered_on_failed_run(self, tmp_path, monkeypatch):
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)
        store.save_run({"run_id": "r1", "status": "failed", "attempt": 1, "execution_options": {}})

        request = _make_rerun_request(max_reruns=2)
        enqueue_mock = AsyncMock()
        monkeypatch.setattr(run_queue, "enqueue_run", enqueue_mock)

        asyncio.run(
            run_queue._maybe_auto_rerun("r1", request, None)
        )
        enqueue_mock.assert_called_once()
        call_kwargs = enqueue_mock.call_args
        assert call_kwargs.kwargs["attempt"] == 2
        assert call_kwargs.kwargs["parent_run_id"] == "r1"

    def test_auto_rerun_not_triggered_when_attempt_exceeds_max(self, tmp_path, monkeypatch):
        store = APIExecutionStore(tmp_path)
        monkeypatch.setattr(run_queue, "api_execution_store", store)
        store.save_run({"run_id": "r1", "status": "failed", "attempt": 2, "execution_options": {}})

        request = _make_rerun_request(max_reruns=1)
        enqueue_mock = AsyncMock()
        monkeypatch.setattr(run_queue, "enqueue_run", enqueue_mock)

        asyncio.run(
            run_queue._maybe_auto_rerun("r1", request, None)
        )
        enqueue_mock.assert_not_called()


class TestSSEChannels:
    def test_subscribe_creates_queue(self):
        q = run_queue.subscribe_sse("run-1")
        assert isinstance(q, asyncio.Queue)
        assert "run-1" in run_queue._sse_channels
        run_queue._sse_channels.pop("run-1", None)

    def test_unsubscribe_removes_queue(self):
        q = run_queue.subscribe_sse("run-2")
        run_queue.unsubscribe_sse("run-2", q)
        assert "run-2" not in run_queue._sse_channels

    def test_unsubscribe_nonexistent_is_noop(self):
        run_queue.unsubscribe_sse("no-such-run", asyncio.Queue())

    def test_broadcast_sends_to_all_subscribers(self):
        q1 = run_queue.subscribe_sse("run-3")
        q2 = run_queue.subscribe_sse("run-3")
        asyncio.run(run_queue._broadcast_sse("run-3", "progress", {"step": 1}))
        assert not q1.empty()
        assert not q2.empty()
        msg = q1.get_nowait()
        assert msg["event"] == "progress"
        assert msg["data"]["step"] == 1
        run_queue._sse_channels.pop("run-3", None)

    def test_broadcast_noop_when_no_subscribers(self):
        asyncio.run(run_queue._broadcast_sse("no-subscribers", "progress", {}))


class TestGraphWriteRetry:
    def test_success_on_first_attempt(self):
        class FakeGraphOps:
            async def run_cypher(self, *a, **kw):
                return None

        run = {"run_id": "r1", "script": {"steps": []}, "execution_options": {}}
        result = asyncio.run(write_run_to_graph_with_retry(FakeGraphOps(), run, max_retries=3, retry_delay=0))
        assert result["success"] is True
        assert result["attempt"] == 1

    def test_retries_on_failure_then_succeeds(self):
        call_count = 0

        class FlakeyGraphOps:
            async def run_cypher(self, *a, **kw):
                nonlocal call_count
                call_count += 1
                if call_count < 3:
                    raise ConnectionError("neo4j down")

        run = {"run_id": "r2", "script": {"steps": []}, "execution_options": {}}
        result = asyncio.run(write_run_to_graph_with_retry(FlakeyGraphOps(), run, max_retries=3, retry_delay=0))
        assert result["success"] is True
        assert result["attempt"] == 3

    def test_returns_failure_after_max_retries(self):
        class BadGraphOps:
            async def run_cypher(self, *a, **kw):
                raise RuntimeError("permanent failure")

        run = {"run_id": "r3", "script": {"steps": []}, "execution_options": {}}
        result = asyncio.run(write_run_to_graph_with_retry(BadGraphOps(), run, max_retries=2, retry_delay=0))
        assert result["success"] is False
        assert result["attempt"] == 2
        assert "permanent failure" in result["error"]

    def test_build_graph_write_failure_task(self):
        run = {"run_id": "r4", "case_name": "test", "execution_options": {"project_id": "p1"}}
        task = build_graph_write_failure_task(run, "timeout", 3)
        assert task["task_type"] == "knowledge_write_failure"
        assert task["run_id"] == "r4"
        assert task["project_id"] == "p1"
        assert "timeout" in task["reason"]


def _step(sid: str, depends_on: list[str] | None = None) -> APITestStep:
    return APITestStep(
        id=sid, name=f"step-{sid}", method="GET", path=f"/{sid}",
        operation_id=f"op_{sid}", depends_on=depends_on or [],
    )


class TestBuildStepLevels:
    def test_no_dependencies_single_level(self):
        steps = [_step("a"), _step("b"), _step("c")]
        levels = _build_step_levels(steps)
        assert len(levels) == 1
        assert {s.id for s in levels[0]} == {"a", "b", "c"}

    def test_linear_chain(self):
        steps = [_step("a"), _step("b", ["a"]), _step("c", ["b"])]
        levels = _build_step_levels(steps)
        assert len(levels) == 3
        assert [s.id for s in levels[0]] == ["a"]
        assert [s.id for s in levels[1]] == ["b"]
        assert [s.id for s in levels[2]] == ["c"]

    def test_diamond_dependency(self):
        steps = [
            _step("a"),
            _step("b", ["a"]),
            _step("c", ["a"]),
            _step("d", ["b", "c"]),
        ]
        levels = _build_step_levels(steps)
        assert len(levels) == 3
        assert {s.id for s in levels[0]} == {"a"}
        assert {s.id for s in levels[1]} == {"b", "c"}
        assert {s.id for s in levels[2]} == {"d"}

    def test_missing_dependency_raises(self):
        steps = [_step("a", ["nonexistent"])]
        try:
            _build_step_levels(steps)
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "nonexistent" in str(e)

    def test_empty_steps(self):
        assert _build_step_levels([]) == []


class TestCycleDetection:
    def test_direct_cycle(self):
        steps = [_step("a", ["b"]), _step("b", ["a"])]
        step_map = {s.id: s for s in steps}
        try:
            _detect_cycle(steps, step_map)
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "循环依赖" in str(e)

    def test_indirect_cycle(self):
        steps = [_step("a", ["c"]), _step("b", ["a"]), _step("c", ["b"])]
        step_map = {s.id: s for s in steps}
        try:
            _detect_cycle(steps, step_map)
            assert False, "Should have raised ValueError"
        except ValueError as e:
            assert "循环依赖" in str(e)

    def test_no_cycle(self):
        steps = [_step("a"), _step("b", ["a"]), _step("c", ["a"])]
        step_map = {s.id: s for s in steps}
        _detect_cycle(steps, step_map)  # Should not raise


class TestNeedsDagExecution:
    def test_no_depends_on_returns_false(self):
        steps = [_step("a"), _step("b")]
        assert _needs_dag_execution(steps) is False

    def test_with_depends_on_returns_true(self):
        steps = [_step("a"), _step("b", ["a"])]
        assert _needs_dag_execution(steps) is True
