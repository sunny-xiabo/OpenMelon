from app.api_execution.sqlite_filters import build_ai_call_where, build_event_log_where
from app.api_execution.sqlite_migration import extract_indexed_columns


def test_event_log_where_strips_filters_and_expands_keyword():
    where, params = build_event_log_where(
        project_id=" project-1 ",
        module="api",
        level="warning",
        event_type=None,
        trace_id="trace-1",
        keyword=" Timeout ",
        start_at="2026-05-01T00:00:00Z",
        end_at="2026-05-02T00:00:00Z",
    )

    assert "project_id = ?" in where
    assert "LOWER(title) LIKE ?" in where
    assert params[:5] == [
        "project-1",
        "api",
        "warning",
        "trace-1",
        "2026-05-01T00:00:00Z",
    ]
    assert params[-6:] == ["%timeout%"] * 6


def test_ai_call_where_handles_degraded_and_keyword():
    where, params = build_ai_call_where(
        feature="embedding",
        operation=None,
        model="qwen",
        status="failed",
        degraded=True,
        keyword=" Rate Limit ",
        start_at=None,
        end_at="2026-05-02T00:00:00Z",
    )

    assert "degraded = ?" in where
    assert "LOWER(failure_reason) LIKE ?" in where
    assert params[:5] == ["embedding", "qwen", "failed", 1, "2026-05-02T00:00:00Z"]
    assert params[-7:] == ["%rate limit%"] * 7


def test_migration_extracts_run_index_columns():
    columns = extract_indexed_columns(
        "runs",
        {
            "status": "passed",
            "case_id": "case-1",
            "case_name": "Checkout",
            "run_at": "2026-05-01T00:00:00Z",
            "execution_options": {"project_id": "project-1"},
        },
    )

    assert columns == {
        "status": "passed",
        "project_id": "project-1",
        "case_id": "case-1",
        "case_name": "Checkout",
        "run_at": "2026-05-01T00:00:00Z",
    }
