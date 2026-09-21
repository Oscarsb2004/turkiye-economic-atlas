"""
atlas.datasets.nightlights — Türkiye after dark, one night a year.

    python -m atlas.run nightlights

WHAT THIS DATASET IS, AND WHAT IT IS NOT

It is not figures. It is a LAYER CARD: the tile template NASA publishes for its
gap-filled, BRDF-corrected VIIRS Day/Night Band radiance, the dates this atlas
offers, and a proof that each of those dates has imagery behind it.

Everything the app needs to draw the layer comes from here, because the
alternative is a URL written into the app — an unchecked claim about somebody
else's service, which would go black with no error the day it changed. The
service describes itself (atlas/readers/wmts.py) and this reads that.

WHY ONE NIGHT A YEAR

The layer publishes a day at a time from January 2012 to yesterday: about five
thousand of them, which is not a time slider. This picks the LAST NIGHT THE
LAYER PUBLISHES IN EACH YEAR — a rule, stated in the file, not a night chosen
for how it looks — and the reader moves between years.

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

#: The tile fetched as proof, in the service's own coordinates: zoom 4, where
#: one tile holds most of Türkiye.
PROOF_TILE = {"TileMatrix": "4", "TileRow": "6", "TileCol": "9"}

#: A PNG smaller than this is not imagery of anything.
MIN_TILE_BYTES = 1_000

#: The tile matrix set the app draws in. Web Mercator, zoom 0–8, which is the
#: whole world to a country — the layer publishes no finer set than this.
MATRIX_SET = "GoogleMapsCompatible_Level8"
MAX_ZOOM = 8


def tile_url(template: str, date: str, **tile: str) -> str:
    """One tile's URL, from the service's own template."""
    url = template.replace("{Time}", date).replace("{TileMatrixSet}", MATRIX_SET)
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
    dates = []
    for year in range(FIRST_YEAR, int(newest[:4]) + 1):
        # The last night the layer publishes in that year: a rule, not a choice
        # about which night looks best.
        day = wmts.latest(layer.periods, not_after=f"{year}-12-31")
        if not day or day[:4] != str(year):
            continue
        period = wmts.covers(layer.periods, day)
        if not period:
            raise ValueError(f"{day}: chosen from the published periods and then not found in them")

        url = tile_url(layer.template, day, **PROOF_TILE)
        body = ctx.fetch.bytes(url, force=ctx.refresh)
        if len(body) < MIN_TILE_BYTES or not body.startswith(b"\x89PNG"):
            raise ValueError(
                f"{day}: the tile at {url} is {len(body)} bytes and starts {body[:8]!r}; "
                f"a date the service publishes must have imagery behind it"
            )
        dates.append({
            "date": day,
            "year": str(year),
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
                "rule": "the last night the layer publishes in each year from 2012",
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

    log.info("nightlights: %s, %d dates %s..%s, %d published periods",
             layer.identifier, len(dates), dates[0]["date"] if dates else "-",
             dates[-1]["date"] if dates else "-", len(layer.periods))
    return Built(
        outputs=[(R.DATA_DIR / "nightlights" / "viirs.json", payload)],
        receipt={"layer": layer.identifier, "dates": [entry["date"] for entry in dates],
                 "periods": len(layer.periods), "newest_published": newest},
    )
