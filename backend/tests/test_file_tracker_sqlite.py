import json
from pathlib import Path
import sys

BACKEND_ROOT = Path(__file__).resolve().parents[1]
if str(BACKEND_ROOT) not in sys.path:
    sys.path.insert(0, str(BACKEND_ROOT))

from app.services.file_tracker import FileTracker


def test_file_tracker_add_update_and_delete(tmp_path: Path):
    tracker = FileTracker(db_path=tmp_path / "openmelon.db", json_path=tmp_path / "missing.json")

    record = tracker.add_record("requirements.pdf", "需求文档", "支付", 12)

    assert record["id"]
    assert record["status"] == "indexed"
    assert tracker.get_record(record["id"])["filename"] == "requirements.pdf"

    updated = tracker.update_record(record["id"], status="reindexing", chunk_count=18)

    assert updated["status"] == "reindexing"
    assert updated["chunk_count"] == 18
    assert tracker.get_record(record["id"])["chunk_count"] == 18

    assert tracker.delete_record(record["id"]) is True
    assert tracker.get_record(record["id"]) is None
    assert tracker.delete_record(record["id"]) is False


def test_file_tracker_delete_by_filename(tmp_path: Path):
    tracker = FileTracker(db_path=tmp_path / "openmelon.db", json_path=tmp_path / "missing.json")
    tracker.add_record("api.md", "接口文档", "API", 5)
    tracker.add_record("api.md", "接口文档", "API", 6)
    tracker.add_record("design.md", "设计文档", "设计", 3)

    assert tracker.delete_by_filename("api.md") == 2
    assert [item["filename"] for item in tracker.get_all_records()] == ["design.md"]


def test_file_tracker_migrates_legacy_json_when_sqlite_empty(tmp_path: Path):
    json_path = tmp_path / "file_tracker.json"
    json_path.write_text(
        json.dumps(
            {
                "r1": {
                    "id": "r1",
                    "filename": "old.pdf",
                    "doc_type": "需求文档",
                    "module": "会员",
                    "chunk_count": 9,
                    "indexed_at": "2026-04-30T01:00:00Z",
                    "status": "indexed",
                    "file_path": "/tmp/old.pdf",
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    tracker = FileTracker(db_path=tmp_path / "openmelon.db", json_path=json_path)

    migrated = tracker.get_record("r1")
    assert migrated["filename"] == "old.pdf"
    assert migrated["module"] == "会员"
    assert migrated["file_path"] == "/tmp/old.pdf"


def test_file_tracker_does_not_remigrate_when_sqlite_has_records(tmp_path: Path):
    db_path = tmp_path / "openmelon.db"
    json_path = tmp_path / "file_tracker.json"
    json_path.write_text(
        json.dumps(
            {
                "legacy": {
                    "id": "legacy",
                    "filename": "legacy.md",
                    "doc_type": "文档",
                    "module": "旧模块",
                    "chunk_count": 1,
                }
            },
            ensure_ascii=False,
        ),
        encoding="utf-8",
    )

    tracker = FileTracker(db_path=db_path, json_path=tmp_path / "missing.json")
    current = tracker.add_record("current.md", "文档", "当前模块", 2)
    tracker = FileTracker(db_path=db_path, json_path=json_path)

    assert tracker.get_record(current["id"]) is not None
    assert tracker.get_record("legacy") is None
