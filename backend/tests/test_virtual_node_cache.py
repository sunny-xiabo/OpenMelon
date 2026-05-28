from app.api.routers.graph import _LRUCache


def test_lru_cache_basic():
    cache = _LRUCache(maxsize=3)
    cache["a"] = 1
    cache["b"] = 2
    cache["c"] = 3
    # "a" is LRU; accessing it refreshes its position (both __contains__ and __getitem__)
    assert "a" in cache
    assert cache["a"] == 1
    # Now order is b, c, a — "b" is LRU and should be evicted
    cache["d"] = 4
    assert "a" in cache
    assert "b" not in cache
    assert cache["d"] == 4


def test_lru_cache_evicts_true_lru():
    """Without any extra access, the first-inserted key is evicted."""
    cache = _LRUCache(maxsize=3)
    cache["a"] = 1
    cache["b"] = 2
    cache["c"] = 3
    # No reads — "a" is still LRU
    cache["d"] = 4
    assert "a" not in cache
    assert "b" in cache
    assert "c" in cache
    assert cache["d"] == 4


def test_lru_cache_access_refreshes():
    cache = _LRUCache(maxsize=3)
    cache["a"] = 1
    cache["b"] = 2
    cache["c"] = 3
    # Access "a" to refresh it
    _ = cache["a"]
    # Adding 4th should evict "b" now (not "a")
    cache["d"] = 4
    assert "a" in cache
    assert "b" not in cache
