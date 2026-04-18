import uuid
from datetime import datetime
from typing import Dict, List
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
        self._lock = threading.Lock()

    @staticmethod
    def new_session_id() -> str:
        return uuid.uuid4().hex[:8]

    def add_message(self, session_id: str, role: str, content: str) -> None:
        if not session_id:
            session_id = self.new_session_id()
        with self._lock:
            if session_id not in self._sessions:
                self._sessions[session_id] = []
            self._sessions[session_id].append(
                {
                    "role": role,
                    "content": content,
                    "timestamp": datetime.utcnow().isoformat() + "Z",
                }
            )

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
        with self._lock:
            return list(self._sessions.keys())

    def delete_session(self, session_id: str) -> bool:
        with self._lock:
            if session_id in self._sessions:
                del self._sessions[session_id]
                return True
            return False


# Singleton instance
session_manager = SessionManager()
