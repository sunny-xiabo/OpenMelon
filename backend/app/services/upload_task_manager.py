import uuid
import asyncio
import datetime
from typing import Dict, Any, Optional, List


class UploadTask:
    def __init__(self, task_id: str, filename: str, total_files: int = 1):
        self.task_id = task_id
        self.filename = filename
        self.total_files = total_files
        self.processed = 0
        self.status = "pending"
        self.details: List[Dict[str, Any]] = []
        self.total_chunks = 0
        self.message = ""
        self.created_at = datetime.datetime.utcnow().isoformat() + "Z"
        self.error: Optional[str] = None

    def to_dict(self) -> Dict[str, Any]:
        return {
            "task_id": self.task_id,
            "filename": self.filename,
            "total_files": self.total_files,
            "processed": self.processed,
            "status": self.status,
            "details": self.details,
            "total_chunks": self.total_chunks,
            "message": self.message,
            "created_at": self.created_at,
            "error": self.error,
        }


class UploadTaskManager:
    def __init__(self):
        self.tasks: Dict[str, UploadTask] = {}

    def create(self, filename: str, total_files: int = 1) -> UploadTask:
        task_id = str(uuid.uuid4())
        task = UploadTask(task_id, filename, total_files)
        self.tasks[task_id] = task
        return task

    def get(self, task_id: str) -> Optional[UploadTask]:
        return self.tasks.get(task_id)

    def list_tasks(self, limit: int = 50) -> List[Dict[str, Any]]:
        sorted_tasks = sorted(
            self.tasks.values(), key=lambda t: t.created_at, reverse=True
        )
        return [t.to_dict() for t in sorted_tasks[:limit]]

    def cleanup_completed(self, max_age_seconds: int = 3600):
        now = datetime.datetime.utcnow()
        to_remove = []
        for tid, task in self.tasks.items():
            if task.status in ("completed", "failed"):
                created = datetime.datetime.fromisoformat(task.created_at.rstrip("Z"))
                if (now - created).total_seconds() > max_age_seconds:
                    to_remove.append(tid)
        for tid in to_remove:
            del self.tasks[tid]


upload_task_manager = UploadTaskManager()
