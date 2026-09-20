"""
atlas.datasets.province_gdp — GDP per capita for each of the 81 il.

    python -m atlas.run economy

WHAT IS PUBLISHED, AND WHAT IS NOT

TÜİK publishes per-capita GDP in lira and in dollars, per province, per year.
Both are reproduced exactly as published. Nothing here is divided, rebased,
ranked or converted: the dollar figures are TÜİK's own, not the lira ones put
through an exchange rate of ours.

There is no "richest province" field, and there will not be one. The atlas
shows what a publisher published and lets a reader see the order for
themselves (CLAUDE.md §1).

THE JOIN

The workbook is keyed on İBBS codes and the map on plaka numbers, so
registry/provinces.yaml carries both and the reader refuses a code it does not
know. The published file is keyed on the plaka number, which is what the map,
YSK and every later overlay use.
"""

from __future__ import annotations

import logging
from urllib.parse import quote

from atlas.core import clock
from atlas.core import frames
from atlas.core import registry as R
from atlas.core.records import Observation
from atlas.core.schema import Provenance, SourceRef
from atlas.datasets import Built, Context
from atlas.readers import tuik

log = logging.getLogger(__name__)

SOURCE_KEY = "tuik_provincial_gdp"
TABLE = "gdp_per_capita"
OUTPUT = R.DATA_DIR / "provinces" / "gdp-per-capita.json"
MEASURE = "gdp_per_capita"


def download_url(src: dict, table: str) -> str:
    """
    The portal's own download URL for one of a bulletin's tables.

    The token is base64 and carries `/`, `+` and `=`, so it must be
    percent-encoded or the portal answers 404. The card stores it decoded,
    because a card is meant to be read by a person.
    """
    bulletin = src["bulletin"]
    token = quote(bulletin["tables"][table]["token"], safe="")
    return (f"https://veriportali.tuik.gov.tr/api/tr/data/downloads"
            f"?t=t&pid={bulletin['id']}&p={token}")


def build(ctx: Context, *, dataset: str) -> Built:
    """Every province's per-capita GDP, in both currencies TÜİK publishes."""
    src = R.source(SOURCE_KEY)
    url = download_url(src, TABLE)
    body = ctx.fetch.bytes(url, force=ctx.refresh)
    rows, years = tuik.per_capita_gdp(body)

    provinces = R.provinces()
    retrieved = clock.now_iso()
    by_plaka: dict[int, dict] = {}
    for row in rows:
        province = provinces[row.plaka]
        entry = by_plaka.setdefault(row.plaka, {
            "plaka": row.plaka,
            "nuts3": row.nuts3,
            "name": {"tr": province["name_tr"], "en": province["name_en"]},
            "per_capita_gdp": {},
        })
        entry["per_capita_gdp"][row.currency] = {year: value for year, value in sorted(row.values.items())}
    # A list, in plaka order, rather than an object keyed by code: the declared
    # checks in registry/checks.yaml count and inspect records, and the app can
    # build whatever lookup it wants from a list.
    published = [by_plaka[plaka] for plaka in sorted(by_plaka)]

    payload = {
        "generated_at": retrieved,
        "measure": {
            "key": MEASURE,
            "label": {"tr": "Kişi başına gayrisafi yurt içi hasıla",
                      "en": "Gross domestic product per capita"},
            "currencies": sorted(years),
            "years": {currency: sorted(ys) for currency, ys in years.items()},
        },
        "provinces": published,
        "sources": [SourceRef(
            url=src["bulletin"]["page"], retrieved_at=retrieved,
            provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"],
        ).to_dict()],
    }

    observations = [
        Observation(
            entity=str(row.plaka), category="", period=year, measure=MEASURE,
            # The currency is the unit AND the slice: TÜİK publishes two series
            # of the same measure, so lira and dollars are separate rows rather
            # than one row converted. Without the slice they collide on the
            # frame's key, which is how this was caught.
            value=value, unit=row.currency, slice=row.currency,
            source_table=f"tuik:{src['bulletin']['id']}:{TABLE}",
            provenance=Provenance.OFFICIAL_DATASET.value,
        ).row()
        for row in rows
        for year, value in sorted(row.values.items())
    ]
    frame = frames.Frame(
        dataset=dataset, name="per-capita-gdp", profile="panel", record_type="observation",
        keys=frames.OBSERVATION_KEYS, columns=frames.OBSERVATION_COLUMNS, rows=observations,
        published=("data/provinces/gdp-per-capita.json",),
        notes={"currencies": sorted(years), "provinces": len(published)},
    )

    log.info("per-capita GDP: %d provinces, %d observations, years %s",
             len(published), len(observations), ",".join(sorted(next(iter(years.values())))))
    return Built(
        outputs=[(OUTPUT, payload)],
        frames=[frame],
        receipt={"provinces": len(published), "observations": len(observations),
                 "years": {c: sorted(ys) for c, ys in years.items()}},
    )
