import json
import logging
import uuid
from datetime import UTC, datetime
from pathlib import Path
from typing import Any

from app.storage.sqlite_store import BaseSQLiteStore

logger = logging.getLogger(__name__)


class FileTracker(BaseSQLiteStore):
    _JSON_FILE = Path(__file__).resolve().parent.parent / "data" / "file_tracker.json"

    def __init__(
        self,
        db_path: Path | None = None,
        json_path: Path | None = None,
    ) -> None:
        self._json_path = json_path or self._JSON_FILE
        super().__init__(db_path)
        self._migrate_from_json_if_empty()

    def _init_schema(self) -> None:
        self._conn.executescript("""
            CREATE TABLE IF NOT EXISTS file_records (
                id TEXT PRIMARY KEY,
                filename TEXT NOT NULL DEFAULT '',
                doc_type TEXT NOT NULL DEFAULT '',
                module TEXT NOT NULL DEFAULT '',
                status TEXT NOT NULL DEFAULT '',
                indexed_at TEXT NOT NULL DEFAULT '',
                file_path TEXT DEFAULT '',
                chunk_count INTEGER NOT NULL DEFAULT 0,
                data TEXT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_file_records_filename ON file_records(filename);
            CREATE INDEX IF NOT EXISTS idx_file_records_module ON file_records(module);
            CREATE INDEX IF NOT EXISTS idx_file_records_status ON file_records(status);
        """)

    def add_record(
        self, filename: str, doc_type: str, module: str, chunk_count: int
    ) -> dict:
        record = {
            "id": str(uuid.uuid4()),
            "filename": filename,
            "doc_type": doc_type,
            "module": module,
            "chunk_count": int(chunk_count),
            "indexed_at": datetime.now(UTC).isoformat().replace("+00:00", "Z"),
            "status": "indexed",
            "file_path": None,
        }
        with self._lock:
            self._save_record_no_lock(record)
        return record

    def get_all_records(self) -> list[dict]:
        with self._lock:
            rows = self._query(
                "SELECT data FROM file_records ORDER BY indexed_at DESC, id DESC"
            )
            return [json.loads(row["data"]) for row in rows]

    def get_record(self, record_id: str) -> dict | None:
        with self._lock:
            return self._row_to_data(
                self._query_one(
                    "SELECT data FROM file_records WHERE id = ?",
                    (record_id,),
                )
            )

    def delete_record(self, record_id: str) -> bool:
        with self._lock:
            cursor = self._conn.execute(
                "DELETE FROM file_records WHERE id = ?",
                (record_id,),
            )
            self._conn.commit()
            return cursor.rowcount > 0

    def delete_by_filename(self, filename: str) -> int:
        with self._lock:
            cursor = self._conn.execute(
                "DELETE FROM file_records WHERE filename = ?",
                (filename,),
            )
            self._conn.commit()
            return cursor.rowcount

    def update_record(self, record_id: str, **kwargs: Any) -> dict | None:
        with self._lock:
            row = self._query_one(
                "SELECT data FROM file_records WHERE id = ?",
                (record_id,),
            )
            if not row:
                return None
            record = json.loads(row["data"])
            record.update(kwargs)
            record["id"] = record_id
            self._save_record_no_lock(record)
            return record

    def _save_record_no_lock(self, record: dict[str, Any]) -> None:
        normalized = self._normalize_record(record)
        self._upsert(
            "file_records",
            "id",
            normalized["id"],
            {
                "filename": normalized.get("filename", ""),
                "doc_type": normalized.get("doc_type", ""),
                "module": normalized.get("module", ""),
                "status": normalized.get("status", ""),
                "indexed_at": normalized.get("indexed_at", ""),
                "file_path": normalized.get("file_path") or "",
                "chunk_count": int(normalized.get("chunk_count") or 0),
            },
            normalized,
        )

    def _normalize_record(self, record: dict[str, Any]) -> dict[str, Any]:
        normalized = dict(record)
        normalized["id"] = str(normalized.get("id") or uuid.uuid4())
        normalized["filename"] = str(normalized.get("filename") or "")
        normalized["doc_type"] = str(normalized.get("doc_type") or "")
        normalized["module"] = str(normalized.get("module") or "")
        normalized["status"] = str(normalized.get("status") or "indexed")
        normalized["indexed_at"] = str(normalized.get("indexed_at") or "")
        normalized["chunk_count"] = int(normalized.get("chunk_count") or 0)
        normalized["file_path"] = normalized.get("file_path")
        return normalized

    def _migrate_from_json_if_empty(self) -> int:
        with self._lock:
            existing = self._query_one("SELECT COUNT(*) AS count FROM file_records")
            if existing and existing["count"] > 0:
                return 0
            if not self._json_path.exists():
                return 0
            try:
                data = json.loads(self._json_path.read_text(encoding="utf-8"))
            except Exception as exc:
                logger.warning("Failed to migrate file tracker JSON: %s", exc)
                return 0
            if not isinstance(data, dict):
                return 0

            migrated = 0
            for record_id, record in data.items():
                if not isinstance(record, dict):
                    continue
                record = {**record, "id": record.get("id") or record_id}
                self._save_record_no_lock(record)
                migrated += 1
            if migrated:
                logger.info("Migrated %d file tracker records into SQLite", migrated)
            return migrated


# Singleton instance used across the app
file_tracker = FileTracker()
