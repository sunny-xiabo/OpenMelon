"""PostgreSQL BM25 retriever for keyword-based full-text search."""

from __future__ import annotations

import logging
from typing import Any

from app.storage.pg_fts_store import PgFtsStore

logger = logging.getLogger(__name__)


class PGBM25Retriever:
    """Wraps PgFtsStore to provide BM25-style keyword retrieval."""

    def __init__(self, fts_store: PgFtsStore | None) -> None:
        self._store = fts_store

    async def search(self, query: str, top_k: int = 10) -> list[dict[str, Any]]:
        """Search for document chunks matching the query keywords.

        Returns list of chunk dicts with 'content', 'filename', 'chunk_index', etc.
        """
        if not query.strip():
            return []
        try:
            results = self._store.search(query, top_k=top_k)
            logger.debug(
                "BM25 search returned %d results for query: %s",
                len(results),
                query[:50],
            )
            return results
        except Exception as e:
            logger.warning("BM25 search failed: %s", e)
            return []

    @property
    def available(self) -> bool:
        return self._store is not None
