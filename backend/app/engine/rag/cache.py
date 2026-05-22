from __future__ import annotations

import hashlib
import json
import re
import threading
import time
from collections import OrderedDict
from dataclasses import dataclass
from typing import Any

from app.config import settings


_WHITESPACE_RE = re.compile(r"\s+")
_VERSION_LOCK = threading.Lock()
_RAG_CACHE_VERSION = 1


@dataclass
class _CacheEntry:
    value: Any
    expires_at: float


class RagTTLCache:
    def __init__(self, name: str) -> None:
        self.name = name
        self._lock = threading.Lock()
        self._items: OrderedDict[str, _CacheEntry] = OrderedDict()
        self.hits = 0
        self.misses = 0
        self.sets = 0
        self.evictions = 0

    def get(self, key: str) -> Any | None:
        now = time.monotonic()
        with self._lock:
            entry = self._items.get(key)
            if entry is None:
                self.misses += 1
                return None
            if entry.expires_at <= now:
                self._items.pop(key, None)
                self.evictions += 1
                self.misses += 1
                return None
            self._items.move_to_end(key)
            self.hits += 1
            return entry.value

    def set(self, key: str, value: Any, *, ttl_s: float, max_entries: int) -> None:
        if ttl_s <= 0 or max_entries <= 0:
            return
        expires_at = time.monotonic() + ttl_s
        with self._lock:
            self._items[key] = _CacheEntry(value=value, expires_at=expires_at)
            self._items.move_to_end(key)
            self.sets += 1
            while len(self._items) > max_entries:
                self._items.popitem(last=False)
                self.evictions += 1

    def clear(self) -> None:
        with self._lock:
            self._items.clear()

    def stats(self, *, ttl_s: float, max_entries: int) -> dict[str, Any]:
        self._purge_expired()
        with self._lock:
            return {
                "name": self.name,
                "size": len(self._items),
                "max_entries": max_entries,
                "ttl_s": ttl_s,
                "hits": self.hits,
                "misses": self.misses,
                "sets": self.sets,
                "evictions": self.evictions,
            }

    def _purge_expired(self) -> None:
        now = time.monotonic()
        with self._lock:
            expired = [key for key, entry in self._items.items() if entry.expires_at <= now]
            for key in expired:
                self._items.pop(key, None)
                self.evictions += 1


retrieval_cache = RagTTLCache("retrieval")
answer_cache = RagTTLCache("answer")


def normalize_query_text(text: str) -> str:
    return _WHITESPACE_RE.sub(" ", (text or "").strip().lower())


def _stable_json(value: Any) -> str:
    return json.dumps(value, sort_keys=True, ensure_ascii=False, default=str, separators=(",", ":"))


def _hash_payload(payload: dict[str, Any]) -> str:
    return hashlib.sha256(_stable_json(payload).encode("utf-8")).hexdigest()


def context_fingerprint(context: str) -> str:
    return hashlib.sha256((context or "").encode("utf-8")).hexdigest()


def rag_cache_version() -> int:
    with _VERSION_LOCK:
        return _RAG_CACHE_VERSION


def bump_rag_cache_version(reason: str = "") -> int:
    global _RAG_CACHE_VERSION
    with _VERSION_LOCK:
        _RAG_CACHE_VERSION += 1
        version = _RAG_CACHE_VERSION
    retrieval_cache.clear()
    answer_cache.clear()
    return version


def clear_rag_cache(reason: str = "") -> int:
    return bump_rag_cache_version(reason=reason or "manual_clear")


def build_retrieval_cache_key(intent: str, entities: dict[str, Any], question: str) -> str:
    return _hash_payload(
        {
            "layer": "retrieval",
            "version": rag_cache_version(),
            "question": normalize_query_text(question),
            "intent": intent,
            "entities": entities or {},
            "retrieval_top_k": settings.RETRIEVAL_TOP_K,
            "retrieval_depth": settings.RETRIEVAL_DEPTH,
            "use_reranker": settings.USE_RERANKER,
            "reranker_top_k": settings.RERANKER_TOP_K,
            "reranker_score_threshold": settings.RERANKER_SCORE_THRESHOLD,
        }
    )


def build_answer_cache_key(
    *,
    question: str,
    intent: str,
    entities: dict[str, Any],
    context: str,
) -> str:
    return _hash_payload(
        {
            "layer": "answer",
            "version": rag_cache_version(),
            "question": normalize_query_text(question),
            "intent": intent,
            "entities": entities or {},
            "context": context_fingerprint(context),
            "provider": settings.LLM_PROVIDER,
            "chat_model": settings.CHAT_MODEL,
            "temperature": settings.GENERATION_TEMPERATURE,
            "max_tokens": settings.GENERATION_MAX_TOKENS,
        }
    )


def get_rag_cache_status() -> dict[str, Any]:
    return {
        "enabled": settings.RAG_CACHE_ENABLED,
        "version": rag_cache_version(),
        "retrieval": retrieval_cache.stats(
            ttl_s=settings.RAG_RETRIEVAL_CACHE_TTL_S,
            max_entries=settings.RAG_RETRIEVAL_CACHE_MAX_ENTRIES,
        ),
        "answer": answer_cache.stats(
            ttl_s=settings.RAG_ANSWER_CACHE_TTL_S,
            max_entries=settings.RAG_ANSWER_CACHE_MAX_ENTRIES,
        ),
    }
