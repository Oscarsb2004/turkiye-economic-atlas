"""
atlas.datasets.places — the cities and towns, so the map has place names on it.

    python -m atlas.run places

WHAT THIS IS FOR

Every other layer in this atlas is a subject. This one is a reference: the
names a reader needs in order to say where a railway goes or which province a
flow left. Nothing is shaded by it and nothing is counted from it. It sits
under whatever overlay is on screen, as a base layer the reader turns on.

WHY OPENSTREETMAP AND NOT NATURAL EARTH

Natural Earth's 1:10m populated places carries 83 Turkish entries, of which 69
are province capitals — twelve provinces would have no name on the map at all.
OSM's `place=city` and `place=town` are 1 005 nodes, which is every settlement
a reader would name and still a node query rather than a download. The roads
beside them ARE Natural Earth's, because the same question asked of OSM is
37 434 ways (scripts/build_geo.mjs).

WHAT IS PUBLISHED, AND WHAT IS OURS

The name, the class and the coordinate are OSM's, reproduced. The population is
OSM's where a node carries one, as an integer, and absent where it does not —
about a third of them. The PROVINCE is ours, by the same rule the railway
stations use: the province whose published boundary contains the published
coordinate, or the nearest one within a stated distance, with the record saying
which (atlas/shells/transform/geometry.py).

The atlas does not rank them. Which names a map has room for at a given zoom is
the app's presentation choice, made from the published population and stated in
the interface — not a "biggest cities" list published here.

OSM HAS NO EDITION

The period is `timestamp_osm_base`, the moment the answer was current, as a day.
"""

from __future__ import annotations

import logging

from atlas.core import clock
from atlas.core import frames
from atlas.core import registry as R
from atlas.core.records import Asset
from atlas.core.schema import Provenance, SourceRef
from atlas.datasets import Built, Context
from atlas.readers import overpass
from atlas.shells.transform import geometry

log = logging.getLogger(__name__)

SOURCE_KEY = "osm_overpass"
BOUNDARY_KEY = "geoboundaries_adm1"
OUTPUT = R.DATA_DIR / "places" / "settlements.json"

#: How far outside every boundary a settlement may be and still be placed in
#: the nearest province. A coastal town's node can sit a few hundred metres off
#: a simplified shoreline; two kilometres covers that and is far short of the
#: next province. The same figure the railway stations use, for the same reason.
NEAREST_M = 2_000

#: The tags read off a node. `name:en` is routinely absent — most Turkish towns
#: have no English name and do not need one (CLAUDE.md §2b).
PLACE_TAGS = ("name", "name:en", "place", "population")


def _population(raw: str) -> int | None:
    """
    OSM's `population` tag as an integer, or None.

    It is a free-text tag: values like "12 500", "1.200" and "approx 3000" are
    all in the database somewhere. Anything that is not digits after the spaces
    and separators come out is published as absent rather than guessed at — a
    population this project invented would be worse than one it does not have.
    """
    cleaned = raw.strip().replace(" ", "").replace(",", "").replace(".", "")
    return int(cleaned) if cleaned.isdigit() else None


def build(ctx: Context, *, dataset: str) -> Built:
    """Every city and town, placed in a province, as OpenStreetMap has it."""
    src = R.source(SOURCE_KEY)
    boundaries = R.source(BOUNDARY_KEY)
    answer = overpass.ask(ctx.fetch, overpass.PLACE_QUERY, force=ctx.refresh)
    nodes = overpass.nodes(answer)
    instant = overpass.current_as_of(answer)
    current = instant[:10]                      # the day; see the module docstring
    retrieved = clock.now_iso()

    features = R.boundaries()
    provinces = R.provinces()
    published = []
    unplaced = 0
    for node in sorted(nodes, key=lambda n: n.osm_id):
        tags = {tag.replace(":", "_"): node.tags[tag] for tag in PLACE_TAGS if node.tags.get(tag)}
        where = geometry.containing(node.point, features)
        placement = "contains"
        if where is None:
            where, _ = geometry.nearest(node.point, features, NEAREST_M)
            placement = "nearest" if where else "none"
        plaka = int(where["properties"]["code"]) if where else None
        if plaka is None:
            unplaced += 1
        published.append({
            "id": str(node.osm_id),
            "name": {"tr": tags.get("name", ""), "en": tags.get("name_en", "")},
            "kind": tags.get("place", ""),
            "population": _population(tags.get("population", "")),
            "plaka": plaka,
            "placement": placement,
            "province": ({"tr": provinces[plaka]["name_tr"], "en": provinces[plaka]["name_en"]}
                         if plaka else {"tr": "", "en": ""}),
            "point": [round(node.point[0], 5), round(node.point[1], 5)],
        })

    with_population = sum(1 for place in published if place["population"] is not None)
    payload = {
        "generated_at": retrieved,
        "places": published,
        "settlements": {
            "current_as_of": current,
            "label": {"tr": "Yer adları", "en": "Place names"},
            "kinds": {kind: sum(1 for p in published if p["kind"] == kind)
                      for kind in ("city", "town")},
            "with_population": with_population,
            "unplaced": unplaced,
            "placed_by_nearest": sum(1 for p in published if p["placement"] == "nearest"),
            "placement": {
                "provenance": Provenance.DERIVED.value,
                "formula": (f"the province whose published boundary contains the published "
                            f"coordinate, or the nearest province within {NEAREST_M} m where "
                            f"none contains it; `placement` says which"),
            },
        },
        "sources": [
            SourceRef(url=src["page"], retrieved_at=retrieved,
                      provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"]).to_dict(),
            SourceRef(url=boundaries["page"], retrieved_at=retrieved,
                      provenance=Provenance.OFFICIAL_DATASET, licence=boundaries["licence"]).to_dict(),
        ],
    }

    rows = [
        Asset(
            key=f"osm:node:{place['id']}", kind=f"place_{place['kind'] or 'settlement'}",
            name_tr=place["name"]["tr"], name_en=place["name"]["en"],
            parent=f"il:{place['plaka']}" if place["plaka"] else "",
            category=place["kind"],
            lon=place["point"][0], lat=place["point"][1],
            geometry_kind="point",
            coordinate_provenance=Provenance.OFFICIAL_DATASET.value,
            source_url=f"https://www.openstreetmap.org/node/{place['id']}",
            provenance=Provenance.OFFICIAL_DATASET.value,
        ).row()
        for place in published
    ]
    frame = frames.Frame(
        dataset=dataset, name="settlements", profile="points", record_type="asset",
        keys=frames.ASSET_KEYS, columns=frames.ASSET_COLUMNS, rows=rows,
        published=("data/places/settlements.json",),
        notes={"places": len(published), "current_as_of": current},
    )

    log.info("places: %d settlements in %d provinces (%d city, %d town), %d with a published population",
             len(published), len({p["plaka"] for p in published if p["plaka"]}),
             payload["settlements"]["kinds"]["city"], payload["settlements"]["kinds"]["town"],
             with_population)
    return Built(
        outputs=[(OUTPUT, payload)],
        frames=[frame],
        receipt={"places": len(published), "with_population": with_population,
                 "unplaced": unplaced, "current_as_of": current, "osm_timestamp": instant},
    )
