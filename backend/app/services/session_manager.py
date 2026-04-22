import uuid
from datetime import datetime
from typing import Dict, List, Optional
import threading


class SessionManager:
    _instance = None
    _lock = threading.Lock()

    def __new__(cls, *args, **kwargs):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super().__new__(cls)
                cls._instance._init()
            return cls._instance

    def _init(self):
        self._sessions: Dict[str, List[Dict]] = {}
        self._meta: Dict[str, Dict] = {}  # {session_id: {title, created_at, updated_at}}
        self._lock = threading.Lock()

    @staticmethod
    def new_session_id() -> str:
        return uuid.uuid4().hex[:8]

    def add_message(self, session_id: str, role: str, content: str) -> None:
        if not session_id:
            session_id = self.new_session_id()
        now = datetime.utcnow().isoformat() + "Z"
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = []
                self._meta[session_id] = {
                    "title": "",
                    "created_at": now,
                    "updated_at": now,
                }
            self._sessions[session_id].append(
                {
                    "role": role,
                    "content": content,
                    "timestamp": now,
                }
            )
            self._meta[session_id]["updated_at"] = now
            # Auto-generate title from first user message
            if role == "user" and not self._meta[session_id]["title"]:
                self._meta[session_id]["title"] = content[:50].strip()

    def get_history(self, session_id: str) -> List[Dict]:
        with self._lock:
            return list(self._sessions.get(session_id, []))

    def clear_history(self, session_id: str) -> bool:
        with self._lock:
            if session_id in self._sessions:
                self._sessions[session_id] = []
                return True
            return False

    def list_sessions(self) -> List[str]:
        """Legacy: return plain session IDs."""
        with self._lock:
            return list(self._sessions.keys())

    def list_sessions_with_meta(self) -> List[Dict]:
        """Return session list with metadata, sorted by updated_at descending."""
        with self._lock:
            result = []
            for sid, messages in self._sessions.items():
                meta = self._meta.get(sid, {})
                result.append({
                    "id": sid,
                    "title": meta.get("title", "") or sid[:8],
                    "message_count": len(messages),
                    "created_at": meta.get("created_at", ""),
                    "updated_at": meta.get("updated_at", ""),
                })
            result.sort(key=lambda x: x["updated_at"], reverse=True)
            return result

    def rename_session(self, session_id: str, title: str) -> bool:
        with self._lock:
            if session_id in self._meta:
                self._meta[session_id]["title"] = title[:50].strip()
                return True
            return False

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                self._meta.pop(session_id, None)
                return True
            return False


# Singleton instance
session_manager = SessionManager()
