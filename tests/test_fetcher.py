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


def test_a_form_post_is_cached_on_its_body():
    """
    Two different forms to one endpoint are two different cache entries.

    This is the rule that makes caching a POST safe at all. TÜİK's population
    portal takes one year of the migration matrix as a form field, so a cache
    keyed on the URL alone would serve 2020's matrix when 2021 was asked for —
    plausible wrong numbers rather than an error.
    """
    import json
    import tempfile

    from atlas.shells.acquire.fetcher import Fetcher

    url = "https://nip.tuik.gov.invalid/Home/Table"
    with tempfile.TemporaryDirectory() as d:
        fetch = Fetcher(cache_dir=Path(d))
        answers = {}
        for year in ("2020", "2021"):
            fields = {"search[value]": year, "length": "20000"}
            key = fetch._key_for_form(url, fields)
            fetch._cache_write(key, json.dumps({"year": year}).encode("utf-8"))
            answers[year] = key

        assert answers["2020"] != answers["2021"], "one key per body"
        for year, key in answers.items():
            assert json.loads(fetch._cache_read(key))["year"] == year

        # The order of the fields is the order the form is built in, so the same
        # request is the same key on every run — which is also what the golden
        # recorder keys a POST on.
        same = fetch._key_for_form(url, {"search[value]": "2020", "length": "20000"})
        assert same == answers["2020"]
