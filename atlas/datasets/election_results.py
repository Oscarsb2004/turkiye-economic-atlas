"""
atlas.datasets.election_results — one election's result in every province.

    python -m atlas.run elections

One builder, one card per election, differing only in params: the portal's
`secim_id` and `secim_turu`, and the slug the file is published under. Adding
the 2018 election, or 2015, or a referendum, is a card — not code.

WHAT IS PUBLISHED

Votes per option per province, exactly as YSK publishes them, with the turnout
figures it publishes beside them: registered voters, voters who voted, valid and
invalid votes. YSK aggregates by province itself, so nothing here is summed.

WHAT IS NOT PUBLISHED

No winner, no margin, no ranking, no share. YSK publishes counts; a share is
arithmetic over them, so the app computes and labels it rather than the pipeline
inventing a figure the publisher never printed (CLAUDE.md §1). The national row
YSK publishes beside the provinces is carried through as `published_total`, so
registry/checks.yaml can check the parts against the publisher's own sum.
"""

from __future__ import annotations

import logging

from atlas.core import clock
from atlas.core import frames
from atlas.core import registry as R
from atlas.core.records import Observation
from atlas.core.schema import Provenance, SourceRef
from atlas.datasets import Built, Context
from atlas.readers import ysk

log = logging.getLogger(__name__)

SOURCE_KEY = "ysk_election_results"


def build(ctx: Context, *, dataset: str, secim_id: int, secim_turu: int, slug: str,
          date: str, title_tr: str, title_en: str) -> Built:
    """One election, every province, as published. Every argument comes from the card's params."""
    src = R.source(SOURCE_KEY)

    options = ysk.options(ctx.fetch, secim_id, secim_turu)
    results, national = ysk.province_results(ctx.fetch, secim_id, secim_turu, options)

    provinces = R.provinces()
    retrieved = clock.now_iso()
    published = []
    for result in sorted(results, key=lambda r: r.plaka):
        entry = {
            "plaka": result.plaka,
            "name": {"tr": provinces[result.plaka]["name_tr"], "en": provinces[result.plaka]["name_en"]},
            # YSK writes province names in upper case ("İSTANBUL"); the name
            # above is the registry's, and this is what the publisher wrote.
            "name_ysk": result.name,
            "votes": result.votes,
            "turnout": result.turnout,
            # Published as one row, or added up from the province's electoral
            # districts. Four provinces are split in a parliamentary election,
            # and a figure we added is not a figure YSK printed.
            "provenance": (Provenance.DERIVED.value if result.summed
                           else Provenance.OFFICIAL_DATASET.value),
        }
        if result.summed:
            entry["formula"] = "sum of this province's electoral districts, each as published by YSK"
            entry["constituencies"] = [
                {"name": part["name"], "votes": part["votes"], "turnout": part["turnout"]}
                for part in result.parts
            ]
        published.append(entry)

    payload = {
        "generated_at": retrieved,
        "election": {
            "slug": slug,
            "secim_id": secim_id,
            "secim_turu": secim_turu,
            "date": date,
            "title": {"tr": title_tr, "en": title_en},
        },
        "options": [{"order": o.order, "name": o.name, "column": o.column} for o in options],
        "provinces": published,
        # YSK's own total of the 81, reproduced so the parts can be checked
        # against the publisher rather than against our own addition.
        "published_total": national,
        "sources": [SourceRef(
            url=src["page"], retrieved_at=retrieved,
            provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"],
        ).to_dict()],
    }

    rows = []
    for result in results:
        for option in options:
            rows.append(Observation(
                entity=str(result.plaka), category=option.name, period=date,
                measure="votes", value=result.votes[option.name], unit="count",
                slice=slug, source_table=f"ysk:{secim_id}:{secim_turu}",
                provenance=(Provenance.DERIVED.value if result.summed
                            else Provenance.OFFICIAL_DATASET.value),
            ).row())
        for name, value in result.turnout.items():
            rows.append(Observation(
                entity=str(result.plaka), category="", period=date,
                measure=name, value=value, unit="count",
                slice=slug, source_table=f"ysk:{secim_id}:{secim_turu}",
                provenance=(Provenance.DERIVED.value if result.summed
                            else Provenance.OFFICIAL_DATASET.value),
            ).row())

    frame = frames.Frame(
        dataset=dataset, name="votes", profile="panel", record_type="observation",
        keys=frames.OBSERVATION_KEYS, columns=frames.OBSERVATION_COLUMNS, rows=rows,
        published=(f"data/elections/{slug}.json",),
        notes={"options": len(options), "provinces": len(published)},
    )

    log.info("%s: %d provinces, %d options, %s registered voters nationally",
             slug, len(published), len(options), f"{national['turnout']['registered']:,}")
    return Built(
        outputs=[(R.DATA_DIR / "elections" / f"{slug}.json", payload)],
        frames=[frame],
        receipt={"provinces": len(published), "options": [o.name for o in options],
                 "national_valid_votes": national["turnout"]["valid"],
                 "summed_from_constituencies": sorted(r.plaka for r in results if r.summed)},
    )
