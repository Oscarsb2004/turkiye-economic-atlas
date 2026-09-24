"""
atlas.shells.acquire.fetcher — the one way this project talks to the internet.

(Moved from atlas/net.py in step S2 of docs/REBUILD.md; unchanged in behaviour.)

Every outbound request goes through `Fetcher`. That is worth enforcing because
the alternative — `requests.get` scattered across four source modules — is how a
scraper ends up hammering a government site during a debugging session, and how
politeness settings drift apart between modules.

Four behaviours, each with a reason:

  Rate limit. canada.ca's robots.txt sets no Crawl-delay and disallows nothing
  we touch, so ~1 request/second is self-imposed rather than required. It costs
  about a minute for a full MPO crawl and removes any question of whether we
  were a burden.

  On-disk cache, WITH A TTL. Development means running stage 01 dozens of times;
  without a cache that is dozens of full crawls of a public service for no new
  data. But an unexpiring cache silently defeats the thing the cache exists
  alongside: `data/history/` only appends when a page's content hash moves, and
  a permanently cached page's hash never moves. An immortal cache therefore
  turns change detection off without saying so.

  So entries expire (default 24h). Repeated runs inside a working session are
  free; a run the next day sees what the government changed. `--refresh`
  bypasses the cache entirely for the case where you know something just moved.

  Backoff. 502/504/524 from these hosts are infrastructure, not a bad URL. So
  is a server closing a chunked response before its declared body ends: requests
  calls that a ``ChunkedEncodingError``. Three retries with exponential backoff;
  404 and 403 fail immediately, because retrying them just repeats a wrong
  answer more slowly.

  Generous timeouts. canada.ca was observed taking more than 45 seconds to first
  byte from some networks while smaller endpoints answered instantly. A short
  timeout would turn that into a spurious "site down".

Explicitly NOT carried over from African-Stability-Index: that project's
`01_pull.py` monkey-patches `requests.Session.merge_environment_settings` to
force `verify=False` process-wide as a Windows SSL workaround, and tracks it in
its own backlog as a defect. TLS verification stays on here. If a corporate
proxy ever breaks it, the fix is REQUESTS_CA_BUNDLE, not disabling the check.
"""

from __future__ import annotations

import hashlib
import json
import logging
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any
from urllib.parse import urlencode

import requests

log = logging.getLogger(__name__)


# ── Settings ───────────────────────────────────────────────────────────────────

#: Identifies this project to the administrator reading a server log. It said
#: canada-economic-atlas until T7, which was the seed's name and a link to a
#: different repository — wrong on both counts to a Turkish publisher.
USER_AGENT = "turkiye-economic-atlas/0.1 (personal research project)"

#: Seconds between requests to the same host.
MIN_INTERVAL = 1.0

#: (connect, read). Read is long on purpose — see the module docstring.
TIMEOUT = (15.0, 120.0)

MAX_RETRIES = 3
RETRY_BACKOFF_BASE = 5           # seconds; doubles each attempt (5 → 10 → 20)

#: Status codes worth retrying. Everything else is an answer, even if unwelcome.
TRANSIENT_STATUS = frozenset({429, 500, 502, 503, 504, 520, 522, 524})

# ``ChunkedEncodingError`` is not a ``ConnectionError``: requests raises it
# while consuming a response whose server closed the chunked body early. It is
# nevertheless the same kind of transient transport failure. İBB did exactly
# this while this project's GTFS reader was fetching a CSV, so it belongs in
# the one shared retry policy rather than in that reader.
TRANSIENT_EXCEPTIONS = (requests.Timeout, requests.ConnectionError,
                        requests.exceptions.ChunkedEncodingError)

#: How long a cached body stays usable, in seconds.
#:
#: 24 hours, chosen against what it protects rather than as a round number: the
#: federal pages this scrapes change on the order of weeks, so a day-old copy is
#: never meaningfully stale, while a same-session re-run is always free. Shorter
#: would re-crawl a public service for nothing; longer would let a page change
#: without a daily run noticing.
CACHE_TTL_SECONDS = 24 * 60 * 60


class FetchError(RuntimeError):
    """A request failed in a way retrying will not fix."""


# ── The fetcher ────────────────────────────────────────────────────────────────

@dataclass
class Fetcher:
    """
    A polite, caching HTTP client.

    Not a singleton: stages construct their own so a test can point one at a
    temporary directory without touching global state.
    """

    cache_dir: Path
    min_interval: float = MIN_INTERVAL
    use_cache: bool = True
    cache_ttl: float = CACHE_TTL_SECONDS

    def __post_init__(self) -> None:
        self.cache_dir = Path(self.cache_dir)
        self.cache_dir.mkdir(parents=True, exist_ok=True)
        self._session = requests.Session()
        self._session.headers.update({
            "User-Agent": USER_AGENT,
            # Turkish first: every publisher this reads is Turkish, and several
            # serve a different page in each language.
            "Accept-Language": "tr-TR,tr;q=0.9,en;q=0.8",
        })
        self._last_request_at = 0.0
        #: Counted so a run can report how much of it came off disk. A scrape
        #: that was entirely cached and a scrape that genuinely saw no change
        #: look identical in the output otherwise.
        self.hits = 0
        self.fetches = 0
        self.expired = 0

    # ── Public surface ────────────────────────────────────────────────────────

    def text(self, url: str, *, encoding: str | None = None) -> str:
        """Fetch `url` and decode as text."""
        raw = self.bytes(url)
        if encoding:
            return raw.decode(encoding, errors="replace")
        # Federal pages declare UTF-8 and mean it; the fallback is for the odd
        # legacy CSV served as latin-1.
        try:
            return raw.decode("utf-8")
        except UnicodeDecodeError:
            log.warning("%s is not valid UTF-8; decoding as latin-1", url)
            return raw.decode("latin-1", errors="replace")

    def json(self, url: str) -> Any:
        """Fetch `url` and parse as JSON."""
        body = self.text(url)
        try:
            return json.loads(body)
        except json.JSONDecodeError as exc:
            # An ArcGIS or WDS error arrives as an HTML page with status 200, so
            # the parse failure is the first sign anything is wrong. Show enough
            # of the body to identify it without dumping a whole page into logs.
            raise FetchError(f"{url} did not return JSON: {body[:200]!r}") from exc

    def bytes(self, url: str, *, force: bool = False) -> bytes:
        """
        Fetch `url` and return the raw body, via the cache unless `force`.

        This is the only method that actually performs a request; `text` and
        `json` are decoders over it.
        """
        cached = None if (force or not self.use_cache) else self._cache_read(url)
        if cached is not None:
            self.hits += 1
            log.debug("cache hit  %s", url)
            return cached

        self.fetches += 1
        body = self._get_with_retries(url)
        if self.use_cache:
            self._cache_write(url, body)
        return body

    def post_json(self, url: str, payload: Any) -> Any:
        """
        POST `payload` as JSON and parse the response.

        Not cached: see `post_form` for the one POST that is, and why.
        """
        return json.loads(self._post_with_retries(url, json_body=payload))

    def post_form(self, url: str, fields: dict[str, str], *, force: bool = False) -> Any:
        """
        POST a form-encoded body and parse the JSON answer, THROUGH THE CACHE.

        The cache was originally keyed on the URL alone, which is why POSTs were
        excluded from it: one body's answer would be served to a different body,
        producing plausible wrong numbers rather than an error. The key here is
        the URL **and a hash of the body**, so two different forms are two
        different entries and that cannot happen.

        It is cached because of what needs it. TÜİK's population portal answers
        one year of the 81x81 migration matrix in about thirty seconds and two
        megabytes, per year, through a POST-only endpoint (a GET answers 405).
        Uncached, every run of the pipeline would ask a public service to do
        that work again for data that changes once a year.

        The body is built from `fields` in the order given, so the same request
        is the same key on every run — which is also what the golden-master
        recorder keys a POST on (verify/golden_site/golden_io.py).
        """
        body = urlencode(fields)
        key = self._key_for_form(url, fields)
        cached = None if (force or not self.use_cache) else self._cache_read(key)
        if cached is not None:
            self.hits += 1
            log.debug("cache hit  %s", key)
            return json.loads(cached)

        self.fetches += 1
        content = self._post_with_retries(
            url, data=body.encode("utf-8"),
            headers={"Content-Type": "application/x-www-form-urlencoded; charset=UTF-8"},
        )
        if self.use_cache:
            self._cache_write(key, content)
        return json.loads(content)

    @staticmethod
    def _key_for_form(url: str, fields: dict[str, str]) -> str:
        """The cache key for one form POST: the endpoint, and what was asked of it."""
        body = urlencode(fields).encode("utf-8")
        return f"POST {url} body:{hashlib.sha256(body).hexdigest()}"

    def _post_with_retries(self, url: str, *, json_body: Any = None, data: bytes | None = None,
                           headers: dict[str, str] | None = None) -> bytes:
        """One POST, retried on transient answers, returning the raw body."""
        last: Exception | None = None
        for attempt in range(MAX_RETRIES + 1):
            self._throttle()
            try:
                resp = self._session.post(url, json=json_body, data=data, headers=headers,
                                          timeout=TIMEOUT)
            except TRANSIENT_EXCEPTIONS as exc:
                last = exc
                if attempt == MAX_RETRIES:
                    break
                self._sleep_for_retry(attempt, url, str(exc))
                continue

            if resp.status_code == 200:
                return resp.content
            if resp.status_code in TRANSIENT_STATUS and attempt < MAX_RETRIES:
                self._sleep_for_retry(attempt, url, f"HTTP {resp.status_code}")
                continue
            raise FetchError(f"POST {url} returned HTTP {resp.status_code}")

        raise FetchError(f"POST {url} failed after {MAX_RETRIES} retries: {last}")

    def download(self, url: str, dest: Path, *, force: bool = False) -> Path:
        """
        Fetch `url` straight to `dest`, skipping it if already present.

        Used for the full-resolution federal renderings and the StatCan cube
        zips, which are far too large to route through the text cache.
        """
        dest = Path(dest)
        if dest.exists() and not force:
            log.debug("already downloaded  %s", dest.name)
            return dest
        dest.parent.mkdir(parents=True, exist_ok=True)
        body = self._get_with_retries(url)
        dest.write_bytes(body)
        log.info("downloaded %s (%s bytes)", dest.name, f"{len(body):,}")
        return dest

    # ── Internals ─────────────────────────────────────────────────────────────

    def _get_with_retries(self, url: str) -> bytes:
        last_exc: Exception | None = None

        for attempt in range(MAX_RETRIES + 1):
            self._throttle()
            try:
                resp = self._session.get(url, timeout=TIMEOUT, allow_redirects=True)
            except TRANSIENT_EXCEPTIONS as exc:
                last_exc = exc
                if attempt == MAX_RETRIES:
                    break
                self._sleep_for_retry(attempt, url, str(exc))
                continue

            if resp.status_code == 200:
                return resp.content

            if resp.status_code in TRANSIENT_STATUS and attempt < MAX_RETRIES:
                self._sleep_for_retry(attempt, url, f"HTTP {resp.status_code}")
                continue

            raise FetchError(f"{url} returned HTTP {resp.status_code}")

        raise FetchError(f"{url} failed after {MAX_RETRIES} retries: {last_exc}")

    def _sleep_for_retry(self, attempt: int, url: str, reason: str) -> None:
        delay = RETRY_BACKOFF_BASE * (2 ** attempt)
        log.warning("%s (%s) — retrying in %ss", url, reason, delay)
        time.sleep(delay)

    def _throttle(self) -> None:
        elapsed = time.monotonic() - self._last_request_at
        if elapsed < self.min_interval:
            time.sleep(self.min_interval - elapsed)
        self._last_request_at = time.monotonic()

    def _cache_path(self, key: str) -> Path:
        # Hashed, not slugified: these URLs are long and contain characters
        # Windows rejects in filenames. `key` is the URL for a GET and
        # "POST <url> body:<sha>" for a form POST, so two different bodies to
        # one endpoint are two different entries (see post_form).
        return self.cache_dir / f"{hashlib.sha256(key.encode('utf-8')).hexdigest()}.bin"

    def _cache_read(self, key: str) -> bytes | None:
        """
        A cached body, or None if there isn't a usable one.

        An entry older than `cache_ttl` is treated as a miss rather than
        deleted: leaving it costs nothing and makes the directory readable when
        debugging what a previous run actually saw.
        """
        path = self._cache_path(key)
        if not path.exists():
            return None
        if self.cache_ttl and (time.time() - path.stat().st_mtime) > self.cache_ttl:
            self.expired += 1
            log.debug("cache expired  %s", key)
            return None
        return path.read_bytes()

    def summary(self) -> str:
        """One line saying how much of this run came off disk."""
        return (f"network: {self.fetches} fetched, {self.hits} from cache"
                f"{f', {self.expired} expired' if self.expired else ''}")

    def _cache_write(self, key: str, body: bytes) -> None:
        self._cache_path(key).write_bytes(body)
        # A sidecar so a human can tell what a hashed cache file holds.
        self._cache_path(key).with_suffix(".url").write_text(key, encoding="utf-8")
