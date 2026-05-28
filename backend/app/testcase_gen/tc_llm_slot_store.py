"""Testcase Generation LLM slot configuration store.

Stores the three-slot runtime config (text / vision / embedding) in PostgreSQL.
Each slot has a *mode* that controls routing:
  - ``global``       → fall back to the main-module LLM settings
  - ``independent``  → use slot-specific credentials (TC_TEXT_* / TC_VISION_* / TC_EMBEDDING_*)
  - ``same_as_text`` → mirror whatever the *text* slot resolves to (vision only)
"""

from __future__ import annotations

import json
from datetime import datetime, timezone
from threading import Lock
from typing import Any

from app.config import settings
from app.storage.postgres_store import BasePostgresStore, postgres_schema_from_text


_SCHEMA_SQL = """\
CREATE TABLE IF NOT EXISTS tc_llm_slot_config (
    slot_key   TEXT PRIMARY KEY,
    mode       TEXT NOT NULL DEFAULT 'global',
    provider   TEXT DEFAULT NULL,
    model      TEXT DEFAULT NULL,
    dim        INTEGER DEFAULT NULL,
    updated_at TEXT DEFAULT '',
    data       TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_tc_llm_slot_config_key ON tc_llm_slot_config(slot_key);
"""

DEFAULT_SLOTS: dict[str, dict[str, Any]] = {
    "text": {"slot_key": "text", "mode": "global", "provider": None, "model": None},
    "vision": {"slot_key": "vision", "mode": "same_as_text", "provider": None, "model": None},
    "embedding": {"slot_key": "embedding", "mode": "global", "provider": None, "model": None, "dim": None},
}


class TcLlmSlotStore(BasePostgresStore):
    """Testcase-gen LLM slot configuration store (PostgreSQL)."""

    def __init__(self, database_url: str) -> None:
        super().__init__(database_url)

    def _init_schema(self) -> None:
        self._conn.executescript(postgres_schema_from_text(_SCHEMA_SQL))

    # ------------------------------------------------------------------
    # Public API
    # ------------------------------------------------------------------

    def get_slot(self, slot_key: str) -> dict[str, Any] | None:
        with self._lock:
            row = self._query_one(
                "SELECT data FROM tc_llm_slot_config WHERE slot_key = ?",
                (slot_key,),
            )
            return self._row_to_data(row)

    def save_slot(self, slot_key: str, config: dict[str, Any]) -> dict[str, Any]:
        now = datetime.now(timezone.utc).isoformat()
        record = {
            "slot_key": slot_key,
            "mode": config.get("mode", "global"),
            "provider": config.get("provider") or None,
            "model": config.get("model") or None,
            "dim": config.get("dim") if slot_key == "embedding" else None,
            "updated_at": now,
        }
        with self._lock:
            self._upsert(
                "tc_llm_slot_config",
                "slot_key",
                slot_key,
                {
                    "mode": record["mode"],
                    "provider": record["provider"],
                    "model": record["model"],
                    "dim": record["dim"],
                    "updated_at": record["updated_at"],
                },
                record,
            )
        return record

    def get_all_slots(self) -> dict[str, dict[str, Any]]:
        with self._lock:
            rows = self._query("SELECT data FROM tc_llm_slot_config ORDER BY slot_key")
        result: dict[str, dict[str, Any]] = {}
        for row in rows:
            record = self._row_to_data(row)
            if record:
                result[record["slot_key"]] = record
        # Ensure all default slots exist
        for key, default in DEFAULT_SLOTS.items():
            if key not in result:
                result[key] = self.save_slot(key, default)
        return result

    def get_effective_config(self, slot_key: str) -> dict[str, Any]:
        """Resolve slot config, following ``same_as_text`` if needed."""
        config = self.get_slot(slot_key)
        if not config:
            config = dict(DEFAULT_SLOTS.get(slot_key, {"mode": "global"}))

        if config.get("mode") == "same_as_text":
            text_config = self.get_slot("text")
            if text_config and text_config.get("mode") == "independent":
                return {**text_config, "slot_key": slot_key, "resolved_from": "text"}
            return {"mode": "global", "slot_key": slot_key, "resolved_from": "text"}

        return config


def _create_store() -> TcLlmSlotStore:
    return TcLlmSlotStore(settings.DATABASE_URL)


tc_llm_slot_store = _create_store()
