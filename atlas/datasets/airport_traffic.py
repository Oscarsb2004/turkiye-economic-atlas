"""
atlas.datasets.airport_traffic — every airport's year, from two publishers.

    python -m atlas.run aviation

One builder, one card per year. DHMİ publishes the traffic against a name;
OurAirports publishes the code, the coordinate and the province against the
ICAO code; registry/airports.yaml is the one join between them, made by hand
once and checked on every run.

WHAT IS PUBLISHED

Five measures — aircraft, commercial aircraft, passengers, freight and cargo —
each split the way DHMİ splits them, into domestic, international and total.
Fifteen figures an airport, reproduced. DHMİ's own TÜRKİYE GENELİ row is
carried through as `published_total` so the declared checks hold the parts
against the publisher's own sum rather than against arithmetic of ours.

WHAT IS OURS, AND SAYS SO

`by_province` adds an airport's figures into the province OurAirports says it
is in, so the map can be shaded by province. Ours, by addition, marked DERIVED
with the formula. A province with no airport is not in it at all — that is "no
figure published", which is what the map draws, and not a zero (CLAUDE.md §10).
"""

from __future__ import annotations

import logging

from atlas.core import clock
from atlas.core import frames
from atlas.core import registry as R
from atlas.core.records import Observation
from atlas.core.schema import Provenance, SourceRef
from atlas.datasets import Built, Context
from atlas.readers import dhmi, ourairports

log = logging.getLogger(__name__)

DHMI_KEY = "dhmi_airport_statistics"
OURAIRPORTS_KEY = "ourairports"

FORMULA = ("a province's figure is the sum of the airports OurAirports places in it, "
           "each as DHMİ publishes it")


def workbook_url(src: dict, year: int) -> str:
    """The published workbook for one year, addressed the way the site addresses it."""
    attachments = src["attachments"]
    if str(year) not in attachments:
        raise KeyError(f"{DHMI_KEY}: no attachment id recorded for {year}")
    # The file is literally named TÜMÜ.xlsx; the site links it percent-encoded.
    return (f"https://www.dhmi.gov.tr/Lists/Istatislikler/Attachments/"
            f"{attachments[str(year)]['id']}/T%C3%9CM%C3%9C.xlsx")


def build(ctx: Context, *, dataset: str, year: int) -> Built:
    """One year of airport traffic, joined to coordinates and provinces."""
    src = R.source(DHMI_KEY)
    src_airports = R.source(OURAIRPORTS_KEY)

    traffic = dhmi.annual(ctx.fetch.bytes(workbook_url(src, year), force=ctx.refresh), year)
    # Only the airports this year's tables carry: airports.csv is every airport
    # in the world, and an ICAO code the crosswalk names but DHMİ never printed
    # is not this year's business.
    located = ourairports.turkish(
        ctx.fetch.bytes(src_airports["api"], force=ctx.refresh), set(traffic.by_icao)
    )

    provinces = R.provinces()
    retrieved = clock.now_iso()
    measures = sorted(set(dhmi.SHEETS.values()))
    slices = list(dhmi.SLICES.values())

    published = []
    by_plaka: dict[int, dict[str, float]] = {}
    for icao in sorted(traffic.by_icao):
        airport = located[icao]
        figures = traffic.by_icao[icao]
        published.append({
            "icao": icao,
            "iata": airport.iata,
            # Turkish as DHMİ prints it, English as OurAirports publishes it:
            # both sides of the pair are a publisher's (CLAUDE.md §2b).
            "name": {"tr": traffic.names[icao], "en": airport.name},
            "kind": airport.kind,
            "plaka": airport.plaka,
            "province": {"tr": provinces[airport.plaka]["name_tr"],
                         "en": provinces[airport.plaka]["name_en"]},
            # [lon, lat], the GeoJSON order, so the declared geometry checks can
            # read it with no special case and the map can use it as it stands.
            "point": [airport.lon, airport.lat],
            "traffic": dict(sorted(figures.items())),
        })
        into = by_plaka.setdefault(airport.plaka, {key: 0 for key in figures})
        for key, value in figures.items():
            into[key] = round(into[key] + value, 3)

    payload = {
        "generated_at": retrieved,
        "traffic": {
            "year": str(year),
            "label": {"tr": "Havalimanı trafiği", "en": "Airport traffic"},
            "measures": measures,
            "slices": slices,
        },
        "airports": published,
        # DHMİ's own total of the rows above it. Not DHMİ TOPLAMI, which leaves
        # out the airports it marks as privately operated (atlas/readers/dhmi.py).
        "published_total": dict(sorted(traffic.published_total.items())),
        "by_province": {
            "provenance": Provenance.DERIVED.value,
            "formula": FORMULA,
            "by_plaka": {str(plaka): dict(sorted(figures.items()))
                         for plaka, figures in sorted(by_plaka.items())},
        },
        "sources": [
            SourceRef(url=src["page"], retrieved_at=retrieved,
                      provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"]).to_dict(),
            SourceRef(url=src_airports["page"], retrieved_at=retrieved,
                      provenance=Provenance.OFFICIAL_DATASET, licence=src_airports["licence"]).to_dict(),
        ],
    }

    rows = [
        Observation(
            entity=icao, category="", period=str(year), measure=measure,
            value=figures[f"{measure}_{slice_name}"],
            unit="tonnes" if measure.endswith("_tonnes") else "count",
            slice=slice_name, source_table=f"dhmi:{src['attachments'][str(year)]['id']}",
            provenance=Provenance.OFFICIAL_DATASET.value,
        ).row()
        for icao, figures in sorted(traffic.by_icao.items())
        for measure in measures
        for slice_name in slices
    ]

    frame = frames.Frame(
        dataset=dataset, name="airport-traffic", profile="panel", record_type="observation",
        keys=frames.OBSERVATION_KEYS, columns=frames.OBSERVATION_COLUMNS, rows=rows,
        published=(f"data/airports/{year}.json",),
        notes={"airports": len(published), "provinces": len(by_plaka)},
    )

    busiest = max(published, key=lambda a: a["traffic"]["passengers_total"])
    log.info("%s: %d airports in %d provinces, %s passengers nationally, busiest %s (%s)",
             year, len(published), len(by_plaka),
             f"{int(traffic.published_total['passengers_total']):,}",
             busiest["icao"], f"{int(busiest['traffic']['passengers_total']):,}")
    return Built(
        outputs=[(R.DATA_DIR / "airports" / f"{year}.json", payload)],
        frames=[frame],
        receipt={"airports": len(published), "provinces": len(by_plaka),
                 "passengers_total": traffic.published_total["passengers_total"],
                 "busiest": busiest["icao"]},
    )
