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
"""

from __future__ import annotations

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
)

SCHEMA_VERSION = "1.0.0"


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

    log.info("bundle: %d copied, meta and palette generated", len(copies))
    return Built(
        outputs=[(web / "meta.json", meta), (web / "palette.json", palette)],
        copies=copies,
        receipt={"files": meta["files"], "schema_version": SCHEMA_VERSION},
    )
