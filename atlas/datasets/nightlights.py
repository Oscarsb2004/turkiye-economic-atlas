"""
atlas.datasets.nightlights — the Earth after dark, as NASA publishes it.

    python -m atlas.run nightlights

WHAT THIS DATASET IS, AND WHAT IT IS NOT

It is not figures. It is a LAYER CARD: the tile template NASA publishes for its
gap-filled, BRDF-corrected VIIRS Day/Night Band radiance, the dates this atlas
offers, and a proof that each of those dates has imagery behind it.

Everything the app needs to draw the layer comes from here, because the
alternative is a URL written into the app — an unchecked claim about somebody
else's service, which would go black with no error the day it changed. The
service describes itself (atlas/readers/wmts.py) and this reads that.

TWO PRODUCTS: NASA'S COMPOSITES, AND A NIGHT A MONTH

The daily layer publishes a night at a time from January 2012 to yesterday —
about five thousand of them, which is not a time slider, and one night is one
night: moon, cloud and snow differ from each to the next. So the series is two
things, each stated rather than chosen for how it looks:

    BLACK MARBLE 2012 and 2016 — NASA's own cloud-free annual composites of the
    same instrument (layer VIIRS_Black_Marble). They are the picture of the
    Earth at night that NASA publishes as a picture, and nothing this project
    could assemble from single nights would be as clean.

    ONE NIGHT A MONTH for the last five calendar years, from the gap-filled
    daily layer: the last night the layer publishes in each month, or — where
    that night's tile over Türkiye is empty — the one before it, for up to ten
    published nights. A month is the step because the owner asked for months,
    not days, and GIBS publishes no monthly night composite to use instead
    (checked 2026-09-24 against all 1 319 layers in its capabilities).

These replace ten single nights, one a year from 2012 to 2021: single nights
standing in for years that NASA publishes proper composites of.

AND THE LAST NIGHT OF A MONTH IS SOMETIMES NOTHING AT ALL

Found while building the monthly series: the layer publishes 31 January 2024
and the tile over Türkiye is a 934-byte PNG, a valid image of nothing. Stepping
back through the published nights is what keeps such a month on the slider; a
month where ten of them are empty is left off it and counted in `skipped`.

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

#: The monthly layer. Gap-filled and BRDF-corrected rather than at-sensor
#: radiance: NASA has already removed the moonlight and filled the cloud gaps,
#: the difference between a map of the Earth and a map of last night's weather.
LAYER = "VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance"

#: NASA's cloud-free annual composites of the same instrument. Two of them,
#: 2012 and 2016, and every time value the layer publishes is offered.
COMPOSITE_LAYER = "VIIRS_Black_Marble"

#: How many calendar years are offered a month at a time, counting back from
#: the newest year the layer publishes and including it. Five, because that is
#: what the owner asked for; before them, NASA's composites stand for the years.
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


def _proof(ctx: Context, template: str, when: str) -> tuple[bytes, str]:
    """One tile over Türkiye for a date, fetched and checked to be a PNG."""
    url = tile_url(template, when, **PROOF_TILE)
    body = ctx.fetch.bytes(url, force=ctx.refresh)
    if not body.startswith(b"\x89PNG"):
        raise ValueError(
            f"{when}: the tile at {url} starts {body[:8]!r} and is not a PNG; "
            f"the service is answering with something this reader was not written for"
        )
    return body, url


def _layer_card(layer: wmts.Layer, src: dict, label: dict[str, str]) -> dict:
    """What the app needs to draw one layer, and what the checks hold it against."""
    return {
        "id": layer.identifier,
        "title": layer.title,
        "label": label,
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
    }


def build(ctx: Context, *, dataset: str) -> Built:
    """NASA's night composites, a night a month, and a tile proving each one."""
    src = R.source(SOURCE_KEY)
    capabilities = ctx.fetch.bytes(src["api"], force=ctx.refresh)
    layer = wmts.layer(capabilities, LAYER)
    marble = wmts.layer(capabilities, COMPOSITE_LAYER)
    for each in (layer, marble):
        if MATRIX_SET not in each.matrix_sets:
            raise ValueError(f"{each.identifier}: the service no longer publishes {MATRIX_SET}; "
                             f"it has {each.matrix_sets}")

    newest = wmts.latest(layer.periods)
    retrieved = clock.now_iso()
    newest_year = int(newest[:4])
    first_monthly_year = newest_year - MONTHLY_YEARS + 1

    # ── NASA's composites: every one the layer publishes ──────────────────────
    composites = []
    for period in marble.periods:
        # A composite's period is a single instant, "2016-01-01/2016-01-01/P1Y".
        when = period.split("/")[0]
        body, url = _proof(ctx, marble.template, when)
        if len(body) < MIN_TILE_BYTES:
            raise ValueError(f"{marble.identifier} {when}: the proof tile is {len(body)} bytes; "
                             f"a composite NASA publishes must have imagery behind it")
        composites.append({
            "date": when,
            "year": when[:4],
            "stands_for": when[:4],
            "period": period,
            "tile": url,
            "tile_bytes": len(body),
            "tile_sha256": hashlib.sha256(body).hexdigest(),
        })

    # ── A night a month, for the last five calendar years ─────────────────────
    wanted = [
        (f"{year}-{month:02d}", _month_end(year, month))
        for year in range(first_monthly_year, newest_year + 1)
        for month in range(1, 13)
        # Not the months after the newest night the layer publishes. Asking for
        # them would put "October 2026 has no imagery" in the file in September,
        # which is true and is not a finding.
        if f"{year}-{month:02d}" <= newest[:7]
    ]

    dates = []
    skipped: list[str] = []
    for stands_for, last_day in wanted:
        # The last night the layer publishes in that month, then the one before
        # it, until one of them has imagery over Türkiye.
        chosen: tuple[str, bytes, str] | None = None
        empty = 0
        for night in nights_back(layer.periods, last_day, LOOK_BACK):
            if not night.startswith(stands_for):
                break                # stepped out of the month this stop is for
            body, url = _proof(ctx, layer.template, night)
            if len(body) >= MIN_TILE_BYTES:
                chosen = (night, body, url)
                break
            empty += 1
        if chosen is None:
            skipped.append(stands_for)
            continue

        day, body, url = chosen
        period = wmts.covers(layer.periods, day)
        if not period:
            raise ValueError(f"{day}: chosen from the published periods and then not found in them")
        dates.append({
            "date": day,
            "year": day[:4],
            # The month this night stands for.
            "stands_for": stands_for,
            # How many later nights in the same month were empty over Türkiye.
            "empty_nights_after": empty,
            # The period the service publishes this day inside, as it writes it.
            "period": period,
            "tile": url,
            "tile_bytes": len(body),
            "tile_sha256": hashlib.sha256(body).hexdigest(),
        })

    monthly = _layer_card(layer, src, {"tr": "Gece ışıkları — ayda bir gece (VIIRS)",
                                       "en": "Nightlights — one night a month (VIIRS)"})
    monthly["chosen"] = {
        "provenance": Provenance.DERIVED.value,
        "rule": (f"the last night the layer publishes in each month of {first_monthly_year}.."
                 f"{newest_year}; where that night's tile over Türkiye is empty, the night "
                 f"before it, for up to {LOOK_BACK} published nights"),
        "monthly_from": f"{first_monthly_year}-01",
        "months": len(dates),
        # Months the layer has reached and published nothing usable in, named
        # rather than silently missing from the series.
        "skipped": skipped,
        "caution": ("one night's radiance, not a measure of activity: nights differ by moon, "
                    "snow and cloud even after the gap-filling"),
    }
    composite = _layer_card(marble, src, {"tr": "Kara Mermer — bulutsuz yıllık bileşim (VIIRS)",
                                          "en": "Black Marble — cloud-free annual composite (VIIRS)"})
    composite["chosen"] = {
        "provenance": Provenance.OFFICIAL_DATASET.value,
        "rule": "every composite the layer publishes",
        "caution": ("NASA's own composite of many cloud-free nights of a year; still radiance, "
                    "not a measure of activity"),
    }

    payload = {
        "generated_at": retrieved,
        "layer": monthly,
        "black_marble": composite,
        "composites": composites,
        "dates": dates,
        "sources": [SourceRef(
            url=src["page"], retrieved_at=retrieved,
            provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"],
        ).to_dict()],
    }

    log.info("nightlights: %d composites (%s) and %d months %s..%s, %d skipped for empty imagery",
             len(composites), ", ".join(c["year"] for c in composites), len(dates),
             dates[0]["stands_for"] if dates else "-", dates[-1]["stands_for"] if dates else "-",
             len(skipped))
    return Built(
        outputs=[(R.DATA_DIR / "nightlights" / "viirs.json", payload)],
        receipt={"layers": [layer.identifier, marble.identifier],
                 "composites": [c["date"] for c in composites],
                 "dates": [entry["date"] for entry in dates],
                 "newest_published": newest, "skipped": skipped},
    )
