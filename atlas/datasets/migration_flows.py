"""
atlas.datasets.migration_flows — who moved from where to where, in one year.

    python -m atlas.run migration

One builder, one card per year, differing only in the year. Adding 2019, or
2008, is a card — the portal carries the matrix back to 2008.

WHAT IS PUBLISHED

`out` is the matrix as TÜİK publishes it: for each province, the number of
people who moved from it to each other province that year. Nothing in it is
computed. The population beside each province is the one TÜİK published for
that year in the same table.

WHAT IS OURS, AND SAYS SO

A province's totals — how many arrived, how many left, and the difference —
are sums over those published flows, so they sit in their own `totals` block
marked DERIVED with the formula written out. The same for `national`, which is
every flow added up: the one figure that can be held against TÜİK's own
headline for the year.

The app shades the map by a total and draws the flows as arcs, and says which
of the two it is showing (CLAUDE.md §1).
"""

from __future__ import annotations

import logging

from atlas.core import clock
from atlas.core import frames
from atlas.core import registry as R
from atlas.core.records import Observation
from atlas.core.schema import Provenance, SourceRef
from atlas.datasets import Built, Context
from atlas.readers import nip

log = logging.getLogger(__name__)

SOURCE_KEY = "tuik_internal_migration"
MEASURE = "migrants"

#: What the totals are, in words, published beside them.
FORMULA = (
    "received = the sum of the flows TÜİK publishes INTO a province; "
    "given = the sum of the flows it publishes OUT of it; net = received − given"
)


def build(ctx: Context, *, dataset: str, year: int) -> Built:
    """One year of the province-to-province matrix. The year comes from the card."""
    src = R.source(SOURCE_KEY)
    slug = str(year)
    matrix = nip.interprovincial(ctx.fetch, year)

    provinces = R.provinces()
    retrieved = clock.now_iso()

    published = []
    for plaka in sorted(provinces):
        published.append({
            "plaka": plaka,
            "name": {"tr": provinces[plaka]["name_tr"], "en": provinces[plaka]["name_en"]},
            # The portal writes province names in upper case ("ELAZIĞ"); the
            # name above is the registry's, and this is what TÜİK wrote. The
            # join is on the plaka code either way (CLAUDE.md, İ/ı).
            "name_nip": matrix.names[plaka],
            "population": matrix.population[plaka],
            # destination plaka -> people who moved there from this province.
            # Keys are strings because JSON object keys are strings.
            "out": {str(to): people for to, people in sorted(matrix.out[plaka].items())},
        })

    received = {plaka: 0 for plaka in provinces}
    given = {plaka: 0 for plaka in provinces}
    for origin, destinations in matrix.out.items():
        for destination, people in destinations.items():
            given[origin] += people
            received[destination] += people

    totals = {
        "provenance": Provenance.DERIVED.value,
        "formula": FORMULA,
        "by_plaka": {
            str(plaka): {"received": received[plaka], "given": given[plaka],
                         "net": received[plaka] - given[plaka]}
            for plaka in sorted(provinces)
        },
    }
    moved = sum(given.values())

    payload = {
        "generated_at": retrieved,
        "migration": {
            "year": str(year),
            "measure": {
                "key": MEASURE,
                "label": {"tr": "İller arası göç", "en": "Migration between provinces"},
                "unit": "count",
            },
        },
        "provinces": published,
        "totals": totals,
        # Every flow added up: what TÜİK's own headline for the year can be
        # held against. Ours, by addition, and marked as such.
        "national": {"provenance": Provenance.DERIVED.value,
                     "formula": "every published province-to-province flow, added up",
                     "moved": moved},
        "sources": [SourceRef(
            url=src["page"], retrieved_at=retrieved,
            provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"],
        ).to_dict()],
    }

    rows = [
        Observation(
            # The destination is the entity and the origin is the category, so
            # an 81×81 matrix is ordinary panel rows and the existing frame
            # validation applies unchanged (docs/PLAN.md, the data model).
            entity=str(destination), category=str(origin), period=str(year),
            measure=MEASURE, value=people, unit="count", slice=slug,
            source_table=f"nip:iller-arasi-goc:{year}",
            provenance=Provenance.OFFICIAL_DATASET.value,
        ).row()
        for origin, destinations in sorted(matrix.out.items())
        for destination, people in sorted(destinations.items())
    ]

    frame = frames.Frame(
        dataset=dataset, name="migration", profile="panel", record_type="observation",
        keys=frames.OBSERVATION_KEYS, columns=frames.OBSERVATION_COLUMNS, rows=rows,
        published=(f"data/migration/{slug}.json",),
        notes={"pairs": len(rows), "provinces": len(published)},
    )

    log.info("%s: %d pairs, %s people moved between provinces", slug, len(rows), f"{moved:,}")
    return Built(
        outputs=[(R.DATA_DIR / "migration" / f"{slug}.json", payload)],
        frames=[frame],
        receipt={"pairs": len(rows), "provinces": len(published), "moved": moved,
                 "largest_flow": max(
                     (people, f"{origin}->{destination}")
                     for origin, destinations in matrix.out.items()
                     for destination, people in destinations.items())[1]},
    )
