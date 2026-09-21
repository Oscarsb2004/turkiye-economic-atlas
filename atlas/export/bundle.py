"""
atlas.export.bundle — what the site reads.

    python -m atlas.run bundle

The datasets write under data/. This assembles what the web app fetches, in the
layout it fetches: the dataset files copied BYTE FOR BYTE, plus two files
generated here.

WHY COPIES AND NOT RE-SERIALISATION

A file that is already correct must not change by being written again. The
runner performs `copies` byte-wise and only when the bytes differ, so a re-run
with unchanged sources leaves a zero-line diff (CLAUDE.md §6).

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

#: Dataset outputs the site reads, copied under web/public/data/ at the same path.
COPIES = (
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
    copies = []
    for rel in COPIES:
        source = R.DATA_DIR / rel
        if not source.exists():
            log.warning("skipping missing %s", rel)
            continue
        copies.append((source, web / rel))
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

    log.info("bundle: %d copied, %d election(s) indexed, meta and palette generated",
             len(copies), len(index["elections"]))
    return Built(
        outputs=[(web / ELECTIONS_INDEX, index),
                 (web / "meta.json", meta), (web / "palette.json", palette)],
        copies=copies,
        receipt={"files": meta["files"], "schema_version": SCHEMA_VERSION},
    )
