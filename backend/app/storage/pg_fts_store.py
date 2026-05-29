"""PostgreSQL full-text search store for document chunks."""

from __future__ import annotations

import logging
from typing import Any

from app.storage.postgres_store import BasePostgresStore, get_postgres_pool
from app.config import settings

logger = logging.getLogger(__name__)


class PgFtsStore(BasePostgresStore):
    """Manages the document_chunks_fts table with tsvector indexing."""

    def _init_schema(self) -> None:
        self._execute("""
            CREATE TABLE IF NOT EXISTS document_chunks_fts (
                chunk_id TEXT PRIMARY KEY,
                filename TEXT NOT NULL,
                doc_type TEXT NOT NULL DEFAULT '',
                module TEXT NOT NULL DEFAULT '',
                chunk_index INTEGER NOT NULL DEFAULT 0,
                content TEXT NOT NULL DEFAULT '',
                section_path TEXT NOT NULL DEFAULT '',
                page_label TEXT NOT NULL DEFAULT '',
                sheet_name TEXT NOT NULL DEFAULT '',
                slide_label TEXT NOT NULL DEFAULT '',
                block_type TEXT NOT NULL DEFAULT '',
                tsv tsvector GENERATED ALWAYS AS (
                    to_tsvector('simple', coalesce(content, ''))
                ) STORED
            )
        """)
        self._execute("""
            CREATE INDEX IF NOT EXISTS idx_chunks_fts_tsv
            ON document_chunks_fts USING GIN(tsv)
        """)
        self._execute("""
            CREATE INDEX IF NOT EXISTS idx_chunks_fts_filename
            ON document_chunks_fts (filename)
        """)
        logger.info("document_chunks_fts schema initialized")

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
                chunk.get("section_path", ""),
                chunk.get("page_label", ""),
                chunk.get("sheet_name", ""),
                chunk.get("slide_label", ""),
                chunk.get("block_type", ""),
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
        """Full-text search using tsvector/tsquery. Returns ranked results."""
        rows = self._query(
            """SELECT chunk_id, filename, doc_type, module, chunk_index,
                      content, section_path, page_label, sheet_name,
                      slide_label, block_type,
                      ts_rank(tsv, query) AS rank
               FROM document_chunks_fts,
                    plainto_tsquery('simple', %s) AS query
               WHERE tsv @@ query
               ORDER BY rank DESC
               LIMIT %s
            """,
            (query, top_k),
        )
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
