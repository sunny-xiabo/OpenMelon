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
