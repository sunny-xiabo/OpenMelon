"""Q&A feedback persistence (thumbs up/down per message)."""

from __future__ import annotations

import logging
import sqlite3
from typing import Any

logger = logging.getLogger(__name__)


class QaFeedbackStore:
    def __init__(self, db_path: str = "openmelon.db") -> None:
        self._db_path = db_path
        self._init_schema()

    def _conn(self) -> sqlite3.Connection:
        conn = sqlite3.connect(self._db_path)
        conn.row_factory = sqlite3.Row
        return conn

    def _init_schema(self) -> None:
        with self._conn() as conn:
            conn.execute("""
                CREATE TABLE IF NOT EXISTS qa_feedback (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    session_id TEXT NOT NULL,
                    message_index INTEGER NOT NULL,
                    feedback TEXT NOT NULL CHECK (feedback IN ('up', 'down')),
                    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
                    UNIQUE(session_id, message_index)
                )
            """)

    def set_feedback(self, session_id: str, message_index: int, feedback: str) -> None:
        with self._conn() as conn:
            conn.execute(
                """INSERT INTO qa_feedback (session_id, message_index, feedback)
                   VALUES (?, ?, ?)
                   ON CONFLICT(session_id, message_index)
                   DO UPDATE SET feedback = excluded.feedback, updated_at = CURRENT_TIMESTAMP""",
                (session_id, message_index, feedback),
            )

    def delete_feedback(self, session_id: str, message_index: int) -> None:
        with self._conn() as conn:
            conn.execute(
                "DELETE FROM qa_feedback WHERE session_id = ? AND message_index = ?",
                (session_id, message_index),
            )

    def get_feedbacks(self, session_id: str) -> list[dict[str, Any]]:
        with self._conn() as conn:
            rows = conn.execute(
                "SELECT message_index, feedback FROM qa_feedback WHERE session_id = ?",
                (session_id,),
            ).fetchall()
            return [{"message_index": r["message_index"], "feedback": r["feedback"]} for r in rows]
