import pytest
from app.storage.pg_fts_store import PgFtsStore


def test_upsert_and_search_interface():
    """Test that PgFtsStore can be constructed and has expected methods."""
    store = PgFtsStore.__new__(PgFtsStore)
    # Verify the class has the expected interface
    assert hasattr(store, 'upsert_chunk')
    assert hasattr(store, 'upsert_chunks')
    assert hasattr(store, 'search')
    assert hasattr(store, 'delete_by_filename')
    assert hasattr(store, 'count')


def test_create_pg_fts_store_no_db_url(monkeypatch):
    """When DATABASE_URL is empty, factory returns None."""
    monkeypatch.setattr("app.storage.pg_fts_store.settings.DATABASE_URL", "")
    from app.storage.pg_fts_store import create_pg_fts_store
    assert create_pg_fts_store() is None
