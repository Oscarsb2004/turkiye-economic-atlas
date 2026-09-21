"""
atlas.datasets.nightlights — Türkiye after dark, a night at a time.

    python -m atlas.run nightlights

WHAT THIS DATASET IS, AND WHAT IT IS NOT

It is not figures. It is a LAYER CARD: the tile template NASA publishes for its
gap-filled, BRDF-corrected VIIRS Day/Night Band radiance, the dates this atlas
offers, and a proof that each of those dates has imagery behind it.

Everything the app needs to draw the layer comes from here, because the
alternative is a URL written into the app — an unchecked claim about somebody
else's service, which would go black with no error the day it changed. The
service describes itself (atlas/readers/wmts.py) and this reads that.

WHY A MONTH RECENTLY AND A YEAR BEFORE THAT

The layer publishes a day at a time from January 2012 to yesterday: about five
thousand of them, which is not a time slider. Two rules, stated here rather
than chosen a night at a time for how they look:

    the last night the layer publishes in each MONTH, for the last five
    calendar years — which is what a reader wants when they are looking at a
    city that was built in that time

    and the last night it publishes in each YEAR before those five, so the
    series still reaches back to the first night the layer has

Neither is a night picked for its weather. Both take the LAST night the
service publishes in the period — and then, if that night's tile over Türkiye
is empty, the one before it, and so on for up to ten published nights.

AND THE LAST NIGHT OF A MONTH IS SOMETIMES NOTHING AT ALL

Found while building this: the layer publishes 31 January 2024 and the tile
over Türkiye is a 934-byte PNG, which is a valid image of nothing. A monthly
series hits that in a way a yearly one never did, because the yearly rule only
ever asked for Decembers. Stepping back through the published nights is what
keeps such a month on the slider; a month where ten of them are empty is left
off it entirely and counted in `skipped`, rather than offered as a black map.

AND WHAT THAT PICTURE IS NOT

It is one night's radiance, not a measure of activity, an economy or a
population. Nights differ by moon, snow and cloud even after the gap-filling,
and the interface says so rather than letting a bright year read as a boom.
A per-province figure would be a zonal statistic over the raster, which is a
different undertaking and is not claimed here (docs/PLAN.md).

THE TILES ARE FETCHED, ONCE EACH, AS PROOF

One tile over Türkiye per date, at the zoom the country fits in. Not published
— it is the reader's browser that fetches the imagery, live — but its size and
type are, so a date that answers with nothing cannot sit in the file looking
like a date that works.
"""

from __future__ import annotations

import hashlib
import logging
from datetime import date as Day, timedelta

from atlas.core import clock
from atlas.core import registry as R
from atlas.core.schema import Provenance, SourceRef
from atlas.datasets import Built, Context
from atlas.readers import wmts

log = logging.getLogger(__name__)

SOURCE_KEY = "nasa_gibs"

#: The layer. Gap-filled and BRDF-corrected rather than at-sensor radiance:
#: NASA has already removed the moonlight and filled the cloud gaps, which is
#: the difference between a map of Türkiye and a map of last night's weather.
LAYER = "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance"

#: The first year the layer covers. Its first published day is 19 January 2012.
FIRST_YEAR = 2012

#: How many calendar years are offered a month at a time, counting back from
#: the newest year the layer publishes and including it. Five, because that is
#: what the owner asked for; the years before them keep one night each.
MONTHLY_YEARS = 5

#: The tile fetched as proof, in the service's own coordinates: zoom 4, where
#: one tile holds most of Türkiye.
PROOF_TILE = {"TileMatrix": "4", "TileRow": "6", "TileCol": "9"}

#: A PNG smaller than this is not imagery of anything. Measured: the empty
#: tiles this rejects are 934 bytes and the smallest real one is far above it.
MIN_TILE_BYTES = 1_000

#: How many published nights to try, newest first, before giving up on a period.
LOOK_BACK = 10

#: The tile matrix set the app draws in. Web Mercator, zoom 0–8, which is the
#: whole world to a country — the layer publishes no finer set than this.
MATRIX_SET = "GoogleMapsCompatible_Level8"
MAX_ZOOM = 8


#: Days in each month, and the one that moves. Written out rather than
#: reached for through `calendar`, because the whole need is "the last date
#: still inside this month" as a string — `wmts.latest` takes a bound, not a
#: day it has to look up.
_DAYS = (31, 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31)


def _month_end(year: int, month: int) -> str:
    """The last day of a month, as the service writes a date."""
    leap = month == 2 and year % 4 == 0 and (year % 100 != 0 or year % 400 == 0)
    return f"{year}-{month:02d}-{29 if leap else _DAYS[month - 1]:02d}"


def nights_back(periods: list[str], until: str, tries: int) -> list[str]:
    """
    The nights the service publishes up to `until`, newest first.

    Walks backwards one PUBLISHED night at a time rather than one calendar day:
    `wmts.latest` answers with the last night inside a published interval, so
    asking it again from the day before that skips whatever the service does
    not hold without this function having to know where its gaps are.
    """
    found: list[str] = []
    bound = until
    for _ in range(tries):
        night = wmts.latest(periods, not_after=bound)
        if not night:
            break
        found.append(night)
        bound = (Day.fromisoformat(night) - timedelta(days=1)).isoformat()
    return found


def tile_url(template: str, when: str, **tile: str) -> str:
    """One tile's URL, from the service's own template."""
    url = template.replace("{Time}", when).replace("{TileMatrixSet}", MATRIX_SET)
    for name, value in tile.items():
        url = url.replace(f"{{{name}}}", value)
    return url


def build(ctx: Context, *, dataset: str) -> Built:
    """The nightlights layer, its dates, and a tile for each of them."""
    src = R.source(SOURCE_KEY)
    capabilities = ctx.fetch.bytes(src["api"], force=ctx.refresh)
    layer = wmts.layer(capabilities, LAYER)

    if MATRIX_SET not in layer.matrix_sets:
        raise ValueError(f"{LAYER}: the service no longer publishes {MATRIX_SET}; it has {layer.matrix_sets}")

    newest = wmts.latest(layer.periods)
    retrieved = clock.now_iso()
    newest_year = int(newest[:4])
    first_monthly_year = newest_year - MONTHLY_YEARS + 1

    # Every stop this atlas offers, as (what it stands for, the last day of it).
    # Built as a list of PERIODS first, so the two rules meet in one place and
    # the fetch loop below does not have to know which rule made a stop.
    wanted: list[tuple[str, str, str]] = [
        ("year", str(year), f"{year}-12-31")
        for year in range(FIRST_YEAR, first_monthly_year)
    ] + [
        ("month", f"{year}-{month:02d}", _month_end(year, month))
        for year in range(first_monthly_year, newest_year + 1)
        for month in range(1, 13)
        # Not the months after the newest night the layer publishes. Asking for
        # them would put "October 2026 has no imagery" in the file on the 21st
        # of September, which is true and is not a finding.
        if f"{year}-{month:02d}" <= newest[:7]
    ]

    dates = []
    skipped: list[str] = []
    for grain, stands_for, last_day in wanted:
        # The last night the layer publishes in that period, then the one before
        # it, until one of them has imagery over Türkiye. A rule, not a choice
        # about which night looks best.
        chosen: tuple[str, bytes, str] | None = None
        empty = 0
        for night in nights_back(layer.periods, last_day, LOOK_BACK):
            if not night.startswith(stands_for):
                break                # stepped out of the period this stop is for
            url = tile_url(layer.template, night, **PROOF_TILE)
            body = ctx.fetch.bytes(url, force=ctx.refresh)
            if not body.startswith(b"\x89PNG"):
                raise ValueError(
                    f"{night}: the tile at {url} starts {body[:8]!r} and is not a PNG; "
                    f"the service is answering with something this reader was not written for"
                )
            if len(body) >= MIN_TILE_BYTES:
                chosen = (night, body, url)
                break
            empty += 1
        if chosen is None:
            # A period the service has not reached, or one whose nights are all
            # empty over Türkiye. Left off the slider rather than offered as a
            # black map, and counted so the omission is visible.
            skipped.append(stands_for)
            continue

        day, body, url = chosen
        period = wmts.covers(layer.periods, day)
        if not period:
            raise ValueError(f"{day}: chosen from the published periods and then not found in them")
        dates.append({
            "date": day,
            "year": day[:4],
            # Which period this night stands for, and how long that period is.
            "stands_for": stands_for,
            "grain": grain,
            # How many later nights in the same period were empty over Türkiye.
            "empty_nights_after": empty,
            # The period the service publishes this day inside, as it writes it.
            "period": period,
            "tile": url,
            "tile_bytes": len(body),
            "tile_sha256": hashlib.sha256(body).hexdigest(),
        })

    payload = {
        "generated_at": retrieved,
        "layer": {
            "id": layer.identifier,
            "title": layer.title,
            "label": {"tr": "Gece ışıkları (VIIRS)", "en": "Nightlights (VIIRS)"},
            "template": layer.template,
            "tile_matrix_set": MATRIX_SET,
            "max_zoom": MAX_ZOOM,
            "formats": layer.formats,
            "default_time": layer.default_time,
            "capabilities": src["api"],
            "attribution": src["attribution"],
            # Every interval the service publishes, as it publishes them. The
            # declared checks hold this atlas's dates against these.
            "periods": layer.periods,
            "chosen": {
                "provenance": Provenance.DERIVED.value,
                "rule": (f"the last night the layer publishes in each month of "
                         f"{first_monthly_year}..{newest_year}, and in each year from "
                         f"{FIRST_YEAR} to {first_monthly_year - 1}; where that night's tile "
                         f"over Türkiye is empty, the night before it, for up to {LOOK_BACK} "
                         f"published nights"),
                "monthly_from": f"{first_monthly_year}-01",
                "months": sum(1 for entry in dates if entry["grain"] == "month"),
                "years": sum(1 for entry in dates if entry["grain"] == "year"),
                # Periods the layer has reached and published nothing usable
                # in, named rather than silently missing from the series. A
                # month in the future is not asked for and is not one of these.
                "skipped": skipped,
                "caution": ("one night's radiance, not a measure of activity: nights differ by moon, "
                            "snow and cloud even after the gap-filling"),
            },
        },
        "dates": dates,
        "sources": [SourceRef(
            url=src["page"], retrieved_at=retrieved,
            provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"],
        ).to_dict()],
    }

    log.info("nightlights: %s, %d dates %s..%s (%d monthly from %s, %d yearly), "
             "%d skipped for empty imagery, %d published periods",
             layer.identifier, len(dates), dates[0]["date"] if dates else "-",
             dates[-1]["date"] if dates else "-",
             sum(1 for entry in dates if entry["grain"] == "month"), f"{first_monthly_year}-01",
             sum(1 for entry in dates if entry["grain"] == "year"),
             len(skipped), len(layer.periods))
    return Built(
        outputs=[(R.DATA_DIR / "nightlights" / "viirs.json", payload)],
        receipt={"layer": layer.identifier, "dates": [entry["date"] for entry in dates],
                 "periods": len(layer.periods), "newest_published": newest,
                 "skipped": skipped},
    )
