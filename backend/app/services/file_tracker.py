import uuid
import datetime
import json
import os
from typing import List, Optional


class FileTracker:
    _FILE = os.path.join(
        os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
        "data",
        "file_tracker.json",
    )

    def __init__(self):
        self.records = {}
        self._load()

    def _load(self):
        if os.path.isfile(self._FILE):
            try:
                with open(self._FILE, "r", encoding="utf-8") as f:
                    data = json.load(f)
                if isinstance(data, dict):
                    self.records = data
            except Exception:
                pass

    def _save(self):
        os.makedirs(os.path.dirname(self._FILE), exist_ok=True)
        with open(self._FILE, "w", encoding="utf-8") as f:
            json.dump(self.records, f, ensure_ascii=False, indent=2)

    def add_record(
        self, filename: str, doc_type: str, module: str, chunk_count: int
    ) -> dict:
        record_id = str(uuid.uuid4())
        indexed_at = datetime.datetime.utcnow().isoformat() + "Z"
        record = {
            "id": record_id,
            "filename": filename,
            "doc_type": doc_type,
            "module": module,
            "chunk_count": int(chunk_count),
            "indexed_at": indexed_at,
            "status": "indexed",
            "file_path": None,
        }
        self.records[record_id] = record
        self._save()
        return record

    def get_all_records(self) -> List[dict]:
        return list(self.records.values())

    def get_record(self, record_id: str) -> Optional[dict]:
        return self.records.get(record_id)

    def delete_record(self, record_id: str) -> bool:
        if record_id in self.records:
            del self.records[record_id]
            self._save()
            return True
        return False

    def delete_by_filename(self, filename: str) -> int:
        to_delete = [
            rid for rid, rec in self.records.items() if rec.get("filename") == filename
        ]
        for rid in to_delete:
            del self.records[rid]
        if to_delete:
            self._save()
        return len(to_delete)

    def update_record(self, record_id: str, **kwargs) -> Optional[dict]:
        rec = self.records.get(record_id)
        if not rec:
            return None
        for k, v in kwargs.items():
            rec[k] = v
        self.records[record_id] = rec
        self._save()
        return rec


# Singleton instance used across the app
file_tracker = FileTracker()
