import pytest
from app.storage.qa_feedback_store import QaFeedbackStore


@pytest.fixture
def store(tmp_path):
    s = QaFeedbackStore(db_path=str(tmp_path / "test_feedback.db"))
    return s


def test_set_and_get_feedback(store):
    store.set_feedback("sess_1", 0, "up")
    store.set_feedback("sess_1", 2, "down")
    results = store.get_feedbacks("sess_1")
    assert len(results) == 2
    assert {"message_index": 0, "feedback": "up"} in results
    assert {"message_index": 2, "feedback": "down"} in results


def test_update_feedback(store):
    store.set_feedback("sess_1", 0, "up")
    store.set_feedback("sess_1", 0, "down")
    results = store.get_feedbacks("sess_1")
    assert len(results) == 1
    assert results[0]["feedback"] == "down"


def test_delete_feedback(store):
    store.set_feedback("sess_1", 0, "up")
    store.delete_feedback("sess_1", 0)
    results = store.get_feedbacks("sess_1")
    assert len(results) == 0


def test_get_feedbacks_empty(store):
    results = store.get_feedbacks("nonexistent")
    assert results == []


# ---------------------------------------------------------------------------
# Endpoint tests
# ---------------------------------------------------------------------------

from fastapi import FastAPI
from fastapi.testclient import TestClient
from app.api.routers.query import router as query_router
from app.api.errors import setup_exception_handlers


@pytest.fixture
def feedback_client(tmp_path):
    """Create a lightweight test client with only the feedback endpoints."""
    test_app = FastAPI()
    setup_exception_handlers(test_app)
    test_app.include_router(query_router, prefix="/api")
    test_app.state.qa_feedback_store = QaFeedbackStore(
        db_path=str(tmp_path / "endpoint_feedback.db")
    )
    return TestClient(test_app)


def test_set_feedback_endpoint(feedback_client):
    resp = feedback_client.post("/api/query/feedback", json={
        "session_id": "test_sess", "message_index": 0, "feedback": "up"
    })
    assert resp.status_code == 200
    assert resp.json()["success"] is True


def test_get_feedback_endpoint(feedback_client):
    feedback_client.post("/api/query/feedback", json={
        "session_id": "test_sess2", "message_index": 1, "feedback": "down"
    })
    resp = feedback_client.get("/api/query/feedback/test_sess2")
    assert resp.status_code == 200
    data = resp.json()
    assert any(f["message_index"] == 1 and f["feedback"] == "down" for f in data["feedbacks"])


def test_delete_feedback_endpoint(feedback_client):
    feedback_client.post("/api/query/feedback", json={
        "session_id": "test_sess3", "message_index": 0, "feedback": "up"
    })
    resp = feedback_client.post("/api/query/feedback", json={
        "session_id": "test_sess3", "message_index": 0, "feedback": None
    })
    assert resp.status_code == 200
    get_resp = feedback_client.get("/api/query/feedback/test_sess3")
    assert len(get_resp.json()["feedbacks"]) == 0
