"""PostgreSQL full-text search store for document chunks.

Uses pg_trgm (trigram) GIN index for substring matching.
Supports both Chinese and English keyword search without external extensions.
"""

from __future__ import annotations

import logging
from typing import Any

from app.storage.postgres_store import BasePostgresStore, get_postgres_pool
from app.config import settings

logger = logging.getLogger(__name__)


class PgFtsStore(BasePostgresStore):
    """Manages the document_chunks_fts table with pg_trgm trigram indexing."""

    def _init_schema(self) -> None:
        # Enable pg_trgm extension (idempotent)
        try:
            self._execute("CREATE EXTENSION IF NOT EXISTS pg_trgm")
        except Exception as e:
            logger.warning("Could not create pg_trgm extension (may need superuser): %s", e)

        self._execute("""
            CREATE TABLE IF NOT EXISTS document_chunks_fts (
                chunk_id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                doc_type TEXT NOT NULL DEFAULT '',
                module TEXT NOT NULL DEFAULT '',
                chunk_index INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL DEFAULT '',
                section_path TEXT,
                page_label TEXT,
                sheet_name TEXT,
                slide_label TEXT,
                block_type TEXT
            )
        """)
        # pg_trgm GIN index for trigram-based substring search
        self._execute("""
            CREATE INDEX IF NOT EXISTS idx_chunks_fts_content_trgm
            ON document_chunks_fts USING GIN (content gin_trgm_ops)
        """)
        self._execute("""
            CREATE INDEX IF NOT EXISTS idx_chunks_fts_filename
            ON document_chunks_fts (filename)
        """)
        logger.info("document_chunks_fts schema initialized (pg_trgm)")

    def upsert_chunk(self, chunk: dict[str, Any]) -> None:
        """Insert or update a single document chunk."""
        self._execute(
            """INSERT INTO document_chunks_fts
               (chunk_id, filename, doc_type, module, chunk_index, content,
                section_path, page_label, sheet_name, slide_label, block_type)
               VALUES (%s, %s, %s, %s, %s, %s, %s, %s, %s, %s, %s)
               ON CONFLICT (chunk_id) DO UPDATE SET
                   filename = EXCLUDED.filename,
                   doc_type = EXCLUDED.doc_type,
                   module = EXCLUDED.module,
                   chunk_index = EXCLUDED.chunk_index,
                   content = EXCLUDED.content,
                   section_path = EXCLUDED.section_path,
                   page_label = EXCLUDED.page_label,
                   sheet_name = EXCLUDED.sheet_name,
                   slide_label = EXCLUDED.slide_label,
                   block_type = EXCLUDED.block_type
            """,
            (
                chunk.get("chunk_id", ""),
                chunk.get("filename", ""),
                chunk.get("doc_type", ""),
                chunk.get("module", ""),
                chunk.get("chunk_index", 0),
                chunk.get("content", ""),
                chunk.get("section_path") or None,
                chunk.get("page_label") or None,
                chunk.get("sheet_name") or None,
                chunk.get("slide_label") or None,
                chunk.get("block_type") or None,
            ),
        )

    def upsert_chunks(self, chunks: list[dict[str, Any]]) -> int:
        """Bulk upsert document chunks. Returns count of rows affected."""
        if not chunks:
            return 0
        for chunk in chunks:
            self.upsert_chunk(chunk)
        return len(chunks)

    def search(self, query: str, top_k: int = 10) -> list[dict[str, Any]]:
        """Keyword search using pg_trgm trigram similarity + ILIKE fallback.

        Returns ranked results sorted by similarity score.
        """
        if not query.strip():
            return []
        # Use similarity() from pg_trgm for ranking, ILIKE for matching
        # Split query into words and require ALL to match (AND logic)
        words = query.strip().split()
        if not words:
            return []

        # Build WHERE clause: content ILIKE '%word%' for each word
        conditions = []
        params = []
        for word in words:
            conditions.append("content ILIKE %s")
            params.append(f"%{word}%")
        where_clause = " AND ".join(conditions)

        sql = f"""SELECT chunk_id, filename, doc_type, module, chunk_index,
                         content, section_path, page_label, sheet_name,
                         slide_label, block_type,
                         similarity(content, %s) AS rank
                  FROM document_chunks_fts
                  WHERE {where_clause}
                  ORDER BY rank DESC, chunk_index ASC
                  LIMIT %s"""
        params = [query] + params + [top_k]
        rows = self._query(sql, tuple(params))
        return [dict(r) for r in rows]

    def delete_by_filename(self, filename: str) -> int:
        """Delete all chunks for a given filename."""
        cursor = self._conn.execute(
            "DELETE FROM document_chunks_fts WHERE filename = %s",
            (filename,),
        )
        self._conn.commit()
        return cursor.rowcount

    def count(self) -> int:
        """Total number of chunks in the FTS table."""
        row = self._query_one("SELECT COUNT(*) AS cnt FROM document_chunks_fts")
        return row["cnt"] if row else 0


def create_pg_fts_store() -> PgFtsStore | None:
    """Factory: create PgFtsStore if DATABASE_URL is configured."""
    db_url = getattr(settings, "DATABASE_URL", "")
    if not db_url or not db_url.strip():
        logger.info("DATABASE_URL not set, skipping PgFtsStore")
        return None
    try:
        return PgFtsStore(database_url=db_url)
    except Exception as e:
        logger.warning("Failed to create PgFtsStore: %s", e)
        return None
