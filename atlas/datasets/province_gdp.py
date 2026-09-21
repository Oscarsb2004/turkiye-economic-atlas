"""
atlas.datasets.province_gdp — GDP per capita for each of the 81 il.

    python -m atlas.run economy

WHAT IS PUBLISHED, AND WHAT IS NOT

TÜİK publishes per-capita GDP in lira and in dollars, per province, per year.
Both are reproduced exactly as published — the dollar figures are TÜİK's own,
not the lira ones put through an exchange rate of ours.

THE THIRD CURRENCY IS ARITHMETIC, AND SAYS SO

The owner asked for Canadian dollars. Nobody publishes Turkish provincial GDP
in Canadian dollars, so it can only be a product of two published numbers:

    CAD = the US dollar figure TÜİK published × the Bank of Canada's own
          annual average USD/CAD rate for the same year (series FXAUSDCAD)

Every CAD figure carries `DERIVED` and that formula, the rate used is published
beside it year by year, and a year the Bank's annual series does not reach has
no Canadian figure at all rather than one carried over from a neighbouring year
(CLAUDE.md §1, §10). The Bank's annual series begins in 2017; TÜİK's bulletin
begins in 2020, so today every year has one.

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
from atlas.readers import boc_valet, tuik

log = logging.getLogger(__name__)

SOURCE_KEY = "tuik_provincial_gdp"
RATE_KEY = "boc_valet"
TABLE = "gdp_per_capita"
OUTPUT = R.DATA_DIR / "provinces" / "gdp-per-capita.json"
MEASURE = "gdp_per_capita"

#: The currency TÜİK publishes that the third one is computed FROM. Not lira:
#: the Bank of Canada publishes no lira rate, and going through the dollar is
#: one published rate rather than two.
FROM_CURRENCY = "USD"
TO_CURRENCY = "CAD"

#: The Bank of Canada's annual average of its daily USD/CAD rate.
RATE_SERIES = "FXAUSDCAD"

#: How far back to ask for it. The annual series itself starts in 2017; asking
#: from 2000 lets the Bank say so rather than this file assuming it.
RATE_FROM = "2000-01-01"


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
    """Every province's per-capita GDP: two currencies published, and one derived."""
    src = R.source(SOURCE_KEY)
    url = download_url(src, TABLE)
    body = ctx.fetch.bytes(url, force=ctx.refresh)
    rows, years = tuik.per_capita_gdp(body)

    rate_src = R.source(RATE_KEY)
    rates = boc_valet.read(
        ctx.fetch.json(boc_valet.url(RATE_SERIES, start=RATE_FROM)), RATE_SERIES,
    )
    # Only the years BOTH publishers have. An intersection rather than a loop
    # with a fallback: a year with no rate has no Canadian figure, and that is
    # the whole of the rule.
    converted = sorted(set(years.get(FROM_CURRENCY, [])) & set(rates.by_year))

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

    # The derived currency, province by province, from the figures just read.
    # Done after the loop rather than inside it because it reads one currency's
    # values to write another's, and the reader does not promise an order.
    for entry in by_plaka.values():
        published_in = entry["per_capita_gdp"].get(FROM_CURRENCY, {})
        derived = {year: published_in[year] * rates.by_year[year]
                   for year in converted if year in published_in}
        if derived:
            entry["per_capita_gdp"][TO_CURRENCY] = derived
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
            "currencies": sorted({*years, TO_CURRENCY} if converted else years),
            "years": {currency: sorted(ys) for currency, ys in years.items()}
                     | ({TO_CURRENCY: converted} if converted else {}),
            # What the third currency is, for anyone reading the file rather
            # than the interface. The rate is published here year by year so a
            # reader can redo the multiplication.
            "derived": {
                TO_CURRENCY: {
                    "provenance": Provenance.DERIVED.value,
                    "formula": (f"{TO_CURRENCY} = the {FROM_CURRENCY} figure TÜİK published for that "
                                f"province and year × the Bank of Canada's annual average "
                                f"{rates.label} rate for the same year ({RATE_SERIES})"),
                    "series": RATE_SERIES,
                    "series_description": rates.description,
                    "rate_by_year": {year: rates.by_year[year] for year in converted},
                    "years_without_a_rate": sorted(set(years.get(FROM_CURRENCY, [])) - set(converted)),
                },
            } if converted else {},
        },
        "provinces": published,
        "sources": [
            SourceRef(url=src["bulletin"]["page"], retrieved_at=retrieved,
                      provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"]).to_dict(),
            SourceRef(url=rate_src["api"], retrieved_at=retrieved,
                      provenance=Provenance.OFFICIAL_DATASET, licence=rate_src["licence"]).to_dict(),
        ],
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
    ] + [
        # The same measure in the derived currency, marked DERIVED — so a frame
        # reader can tell the two published series from the computed one without
        # reading this file.
        Observation(
            entity=str(province["plaka"]), category="", period=year, measure=MEASURE,
            value=value, unit=TO_CURRENCY, slice=TO_CURRENCY,
            source_table=f"boc:{RATE_SERIES}",
            provenance=Provenance.DERIVED.value,
        ).row()
        for province in published
        for year, value in sorted(province["per_capita_gdp"].get(TO_CURRENCY, {}).items())
    ]
    frame = frames.Frame(
        dataset=dataset, name="per-capita-gdp", profile="panel", record_type="observation",
        keys=frames.OBSERVATION_KEYS, columns=frames.OBSERVATION_COLUMNS, rows=observations,
        published=("data/provinces/gdp-per-capita.json",),
        notes={"currencies": sorted({*years, TO_CURRENCY} if converted else years),
               "provinces": len(published), "derived_currency": TO_CURRENCY if converted else ""},
    )

    log.info("per-capita GDP: %d provinces, %d observations, years %s; "
             "%s derived from %s for %s at %s",
             len(published), len(observations), ",".join(sorted(next(iter(years.values())))),
             TO_CURRENCY, FROM_CURRENCY, ",".join(converted) or "no year",
             ", ".join(f"{year}={rates.by_year[year]}" for year in converted) or "-")
    return Built(
        outputs=[(OUTPUT, payload)],
        frames=[frame],
        receipt={"provinces": len(published), "observations": len(observations),
                 "years": {c: sorted(ys) for c, ys in years.items()},
                 "derived": {TO_CURRENCY: {"series": RATE_SERIES, "years": converted}}},
    )
