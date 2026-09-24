"""
atlas.export.bundle — what the site reads.

    python -m atlas.run bundle

The datasets write under data/, and the site reads them FROM THERE: the dev
server serves data/ at /data/ and the production build copies the files this
module lists into the site (web/vite.config.ts). This writes only what is
generated rather than published.

WHY THERE ARE NO COPIES ANY MORE

This used to copy every dataset file into web/public/data/, byte for byte, and
both copies were committed — 4.5 MB of the repository's 13.9 MB was the same
JSON twice (measured 2026-09-24). The copy existed because Vite serves one
public directory; a twelve-line plugin serving a second one is cheaper than a
second copy of every file in every commit.

WHAT IS GENERATED

    meta.json     the sources and their licences, from the cards. Generated so
                  the site's attribution cannot drift from what the pipeline
                  actually read — the app never hardcodes a publisher's name.
    palette.json  registry/palette.yaml, which is a validated artifact; the app
                  reads its colours rather than carrying its own.
    elections/index.json
                  every election's slug, date and published title, READ BACK OUT
                  of the election files themselves. The time slider labels its
                  stops from this, so it can show "Cumhurbaşkanı Seçimi, ikinci
                  oylama · 28.05.2023" without fetching three result files —
                  and without the app keeping a hand-typed copy of a date or a
                  title that the pipeline would then be free to change.
"""

from __future__ import annotations

import json
import logging

import yaml

from atlas.core import clock
from atlas.core import registry as R
from atlas.datasets import Built, Context

log = logging.getLogger(__name__)

#: Dataset outputs the site reads, served from data/ at the same path. The
#: production build copies exactly these (meta.json's `files`), so a dataset
#: the site does not read never ships in it.
SERVED = (
    "provinces/gdp-per-capita.json",
    "elections/2023-cumhurbaskani-1.json",
    "elections/2023-cumhurbaskani-2.json",
    "elections/2023-milletvekili.json",
    "migration/2020.json",
    "migration/2021.json",
    "migration/2022.json",
    "migration/2023.json",
    "migration/2024.json",
    "migration/2025.json",
    "airports/2020.json",
    "airports/2021.json",
    "airports/2022.json",
    "airports/2023.json",
    "airports/2024.json",
    "airports/2025.json",
    "rail/network.json",
    "rail/stations.json",
    "transit/istanbul.json",
    "nightlights/viirs.json",
    "places/settlements.json",
)

SCHEMA_VERSION = "1.0.0"

#: Where the elections live under data/, and where their index is published.
ELECTIONS_PREFIX = "elections/"
ELECTIONS_INDEX = "elections/index.json"


def _election_index(copied: list[str]) -> dict:
    """Slug, date and title for every election copied, from the files themselves."""
    entries = []
    for rel in copied:
        if not rel.startswith(ELECTIONS_PREFIX):
            continue
        payload = json.loads((R.DATA_DIR / rel).read_text(encoding="utf-8"))
        election = payload["election"]
        entries.append({"slug": election["slug"], "date": election["date"],
                        "title": election["title"]})
    # Oldest first, which is the order the slider runs in. Two elections can
    # share a date — 14 May 2023 was both the presidential first round and the
    # parliamentary ballot — so the slug breaks the tie and the order is total.
    entries.sort(key=lambda entry: (entry["date"], entry["slug"]))
    return {"generated_at": clock.now_iso(), "elections": entries}


def build(ctx: Context, *, dataset: str) -> Built:  # noqa: ARG001 - the runner passes both
    """Every dataset the site reads, plus meta and palette."""
    web = R.WEB_DATA_DIR
    written: list[str] = []
    for rel in SERVED:
        if not (R.DATA_DIR / rel).exists():
            log.warning("skipping missing %s", rel)
            continue
        written.append(rel)

    index = _election_index(written)
    written.append(ELECTIONS_INDEX)

    srcs = R.sources()
    meta = {
        "app": "turkiye-economic-atlas",
        "schema_version": SCHEMA_VERSION,
        "generated_at": clock.now_iso(),
        "licences": srcs["licences"],
        "sources": {
            key: {"title": card["title"], "publisher": card["publisher"],
                  "licence": card["licence"], "page": card.get("page", "")}
            for key, card in sorted(srcs["sources"].items())
        },
        "files": sorted(written + ["meta.json", "palette.json"]),
    }
    palette = yaml.safe_load((R.REGISTRY_DIR / "palette.yaml").read_text(encoding="utf-8"))

    log.info("bundle: %d served from data/, %d election(s) indexed, meta and palette generated",
             len(written) - 1, len(index["elections"]))
    return Built(
        outputs=[(web / ELECTIONS_INDEX, index),
                 (web / "meta.json", meta), (web / "palette.json", palette)],
        receipt={"files": meta["files"], "schema_version": SCHEMA_VERSION},
    )
