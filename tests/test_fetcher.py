"""
The fetcher: the single door every outbound request goes through.

One test here for now — the one the shell's card names. The rest of the
Canadian atlas's fetcher tests pin URLs its publishers served, so they come back
one at a time as Turkish sources arrive (docs/PLAN.md).
"""

from __future__ import annotations

from pathlib import Path


def test_cache_entries_expire():
    """
    F4. An immortal cache silently disables change detection: data/history/ only
    appends when a page's content hash moves, and a permanently cached page's
    hash never moves. Entries must age out.
    """
    import os
    import tempfile
    import time as _time

    from atlas.shells.acquire.fetcher import CACHE_TTL_SECONDS, Fetcher

    assert CACHE_TTL_SECONDS == 24 * 60 * 60

    with tempfile.TemporaryDirectory() as d:
        f = Fetcher(cache_dir=Path(d), cache_ttl=100)
        url = "https://example.invalid/thing"
        f._cache_write(url, b"body")

        assert f._cache_read(url) == b"body", "a fresh entry is served"

        # Backdate the entry past its TTL.
        path = f._cache_path(url)
        old = _time.time() - 200
        os.utime(path, (old, old))
        assert f._cache_read(url) is None, "a stale entry must read as a miss"
        assert f.expired == 1
