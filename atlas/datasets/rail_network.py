"""
atlas.datasets.rail_network — the railway, as OpenStreetMap has it.

    python -m atlas.run rail

TWO DATASETS, ONE SOURCE

`network` is the main-line and high-speed track: what runs where, and what OSM
says about it — whether it is high-speed, electrified, its gauge, its design
speed, its operator. `stations` is the places on it.

WHAT IS PUBLISHED AND WHAT IS OURS

Every tag is OSM's, reproduced. Three things are ours and say so:

  · the JOIN of fragments into lines. OSM splits a railway at every bridge and
    every change of attribute, so the Ankara–Sivas line arrives as hundreds of
    ways. Fragments that share an end AND agree on every published attribute
    are joined (atlas/shells/transform/geometry.py), and each line carries the
    OSM way ids it was made of, so the join can be undone by anyone.
  · the SIMPLIFICATION. Douglas–Peucker at 50 m, stated in the file, because a
    point every twenty metres is invisible on a map of a country and is most of
    its weight: 87 696 points become 12 925.
  · the PROVINCE a station is in, which is the province whose published
    boundary contains its published coordinate. registry/checks.yaml recomputes
    it in verify/, which never imports this code.

THE DATE, AND WHY IT IS A DAY

OSM has no edition, so the period is `timestamp_osm_base` — when the answer was
current. It is published as the DAY, not the instant, and that is a decision
worth writing down: the instant moves every minute whether or not a single node
changed, which would rewrite a 1.4 MB file on every fetch and make "a re-run
leaves a zero-line diff" impossible to hold (CLAUDE.md §6). Measured on two
answers eleven minutes apart: 1 352 lines, 1 334 stations, not one coordinate
different, and only the stamp moved. The full instant is kept in the receipt.

It is one period, and the time slider shows it as the one stop it is rather
than pretending to a series.
"""

from __future__ import annotations

import json
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
BOUNDARY_KEY = "natural_earth_admin1"

#: How far a simplified line may sit from the published one, in metres. Fifty
#: is under a rail carriage's length and under a pixel at every zoom this map
#: uses; the number is published in the file so the loss is not a secret.
TOLERANCE_M = 50

#: The tags reproduced on a line. A fragment is only joined to another when all
#: of these agree, so a line that changes gauge stays two lines — which is the
#: honest answer, since the gauge changed.
LINE_TAGS = ("name", "name:en", "highspeed", "usage", "electrified", "gauge",
             "maxspeed", "operator")

#: How far outside every province a station may sit and still be placed in the
#: nearest one. Natural Earth's coastline at 8% cuts inside the Marmara shore,
#: leaving eighteen Marmaray stations a few hundred metres out to sea; two
#: kilometres covers that and is far short of the next province.
NEAREST_M = 2_000

#: And on a station.
STATION_TAGS = ("name", "name:en", "railway", "station", "operator", "network", "train")

#: The published `station` values that mean urban transit rather than a railway
#: station. Counted separately per province because İstanbul's 222 stations are
#: mostly metro, and a map that does not say so reads as a railway hub.
URBAN = frozenset({"subway", "light_rail", "funicular", "monorail"})


def _province_features() -> list[dict]:
    """The published province boundaries, as the geometry pipeline committed them."""
    path = R.WEB_PUBLIC_DIR / "geo" / "provinces.json"
    return json.loads(path.read_text(encoding="utf-8"))["features"]


def build_network(ctx: Context, *, dataset: str) -> Built:
    """Every main-line and high-speed railway, joined into lines and simplified."""
    src = R.source(SOURCE_KEY)
    answer = overpass.ask(ctx.fetch, overpass.RAIL_QUERY, force=ctx.refresh)
    ways = overpass.ways(answer)
    instant = overpass.current_as_of(answer)
    current = instant[:10]                      # the day; see the module docstring
    retrieved = clock.now_iso()

    # One group per distinct set of published attributes; fragments only join
    # to fragments that say the same things about themselves.
    groups: dict[tuple[str, ...], list[tuple[int, list[tuple[float, float]]]]] = {}
    for way in ways:
        points = geometry.without_repeats(
            (round(lon, 5), round(lat, 5)) for lon, lat in way.points
        )
        if len(points) < 2:
            continue
        key = tuple(way.tags.get(tag, "") for tag in LINE_TAGS)
        groups.setdefault(key, []).append((way.osm_id, points))

    published = []
    kept = raw = 0
    for key, members in groups.items():
        attributes = {tag.replace(":", "_"): value for tag, value in zip(LINE_TAGS, key) if value}
        for chain, used in geometry.stitch_indexed([points for _, points in members]):
            line = geometry.simplify(chain, TOLERANCE_M)
            raw += len(chain)
            kept += len(line)
            # The ways this chain was made of, from the stitcher itself: the
            # join is reversible from the file, and no way is claimed twice.
            osm_ways = sorted(members[at][0] for at in used)
            published.append({
                "id": str(min(osm_ways)),
                "name": {"tr": attributes.get("name", ""), "en": attributes.get("name_en", "")},
                "highspeed": attributes.get("highspeed") == "yes",
                "usage": attributes.get("usage", ""),
                "electrified": attributes.get("electrified", ""),
                "gauge": attributes.get("gauge", ""),
                "maxspeed": attributes.get("maxspeed", ""),
                "operator": attributes.get("operator", ""),
                "osm_ways": osm_ways,
                "points": len(line),
                "line": [[lon, lat] for lon, lat in line],
            })

    published.sort(key=lambda line: (not line["highspeed"], -line["points"], line["id"]))
    payload = {
        "generated_at": retrieved,
        "network": {
            "current_as_of": current,
            "label": {"tr": "Demiryolu ağı", "en": "Railway network"},
            "kinds": {"highspeed": sum(1 for line in published if line["highspeed"]),
                      "conventional": sum(1 for line in published if not line["highspeed"])},
            # Ours, and stated where a reader will meet it.
            "derivation": {
                "provenance": Provenance.DERIVED.value,
                "joined": ("OSM ways that share an end and agree on every published attribute are "
                           "joined into one line; each line lists the way ids it was made of"),
                "simplified": (f"Douglas–Peucker at {TOLERANCE_M} m, which left {kept} of {raw} points"),
                "tolerance_m": TOLERANCE_M,
            },
        },
        "lines": published,
        "sources": [SourceRef(
            url=src["page"], retrieved_at=retrieved,
            provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"],
        ).to_dict()],
    }

    log.info("rail network: %d ways joined into %d lines (%d high-speed), %d of %d points kept",
             len(ways), len(published), payload["network"]["kinds"]["highspeed"], kept, raw)
    return Built(
        outputs=[(R.DATA_DIR / "rail" / "network.json", payload)],
        receipt={"ways": len(ways), "lines": len(published), "points_kept": kept, "points_raw": raw,
                 "highspeed_lines": payload["network"]["kinds"]["highspeed"],
                 "current_as_of": current, "osm_timestamp": instant},
    )


def build_stations(ctx: Context, *, dataset: str) -> Built:
    """Every station and halt, placed in the province whose boundary contains it."""
    src = R.source(SOURCE_KEY)
    boundaries = R.source(BOUNDARY_KEY)
    answer = overpass.ask(ctx.fetch, overpass.STATION_QUERY, force=ctx.refresh)
    nodes = overpass.nodes(answer)
    instant = overpass.current_as_of(answer)
    current = instant[:10]                      # the day; see the module docstring
    retrieved = clock.now_iso()

    features = _province_features()
    provinces = R.provinces()
    published = []
    unplaced = 0
    for node in sorted(nodes, key=lambda n: n.osm_id):
        tags = {tag.replace(":", "_"): node.tags[tag] for tag in STATION_TAGS if node.tags.get(tag)}
        where = geometry.containing(node.point, features)
        placement = "contains"
        if where is None:
            # Outside every boundary — which at 8% simplification means the
            # Marmara shore as often as it means the sea. The nearest province
            # within NEAREST_M is the answer, and the record says so.
            where, _ = geometry.nearest(node.point, features, NEAREST_M)
            placement = "nearest" if where else "none"
        plaka = int(where["properties"]["code"]) if where else None
        if plaka is None:
            unplaced += 1
        published.append({
            "id": str(node.osm_id),
            "name": {"tr": tags.get("name", ""), "en": tags.get("name_en", "")},
            "kind": tags.get("railway", ""),
            "station": tags.get("station", ""),
            "operator": tags.get("operator", ""),
            "network": tags.get("network", ""),
            "train": tags.get("train", ""),
            "plaka": plaka,
            # How it was placed: inside the boundary, or near it.
            "placement": placement,
            "province": ({"tr": provinces[plaka]["name_tr"], "en": provinces[plaka]["name_en"]}
                         if plaka else {"tr": "", "en": ""}),
            "point": [round(node.point[0], 5), round(node.point[1], 5)],
        })

    by_plaka: dict[int, dict[str, int]] = {}
    for station in published:
        if not station["plaka"]:
            continue
        counts = by_plaka.setdefault(station["plaka"], {"total": 0, "halt": 0, "urban": 0})
        counts["total"] += 1
        if station["kind"] == "halt":
            counts["halt"] += 1
        if station["station"] in URBAN:
            counts["urban"] += 1

    payload = {
        "generated_at": retrieved,
        "stations": published,
        "station_info": {
            "current_as_of": current,
            "label": {"tr": "Tren istasyonları", "en": "Railway stations"},
            "kinds": {"station": sum(1 for s in published if s["kind"] == "station"),
                      "halt": sum(1 for s in published if s["kind"] == "halt")},
            "unplaced": unplaced,
            "placed_by_nearest": sum(1 for s in published if s["placement"] == "nearest"),
        },
        "by_province": {
            "provenance": Provenance.DERIVED.value,
            "formula": (f"the number of stations whose published coordinate falls inside the "
                        f"province's published boundary, or within {NEAREST_M} m of it where the "
                        f"simplified boundary contains none; `halt` counts those published as "
                        f"railway=halt, and `urban` those whose published station tag is one of "
                        f"{', '.join(sorted(URBAN))}"),
            "by_plaka": {str(plaka): counts for plaka, counts in sorted(by_plaka.items())},
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
            key=f"osm:node:{station['id']}", kind=f"railway_{station['kind'] or 'station'}",
            name_tr=station["name"]["tr"], name_en=station["name"]["en"],
            parent=f"il:{station['plaka']}" if station["plaka"] else "",
            category=station["station"],
            lon=station["point"][0], lat=station["point"][1],
            geometry_kind="point",
            coordinate_provenance=Provenance.OFFICIAL_DATASET.value,
            source_url=f"https://www.openstreetmap.org/node/{station['id']}",
            provenance=Provenance.OFFICIAL_DATASET.value,
        ).row()
        for station in published
    ]
    frame = frames.Frame(
        dataset=dataset, name="stations", profile="points", record_type="asset",
        keys=frames.ASSET_KEYS, columns=frames.ASSET_COLUMNS, rows=rows,
        published=("data/rail/stations.json",),
        notes={"stations": len(published), "provinces": len(by_plaka), "unplaced": unplaced},
    )

    log.info("rail stations: %d in %d provinces (%d station, %d halt), %d outside every boundary",
             len(published), len(by_plaka), payload["station_info"]["kinds"]["station"],
             payload["station_info"]["kinds"]["halt"], unplaced)
    return Built(
        outputs=[(R.DATA_DIR / "rail" / "stations.json", payload)],
        frames=[frame],
        receipt={"stations": len(published), "provinces": len(by_plaka), "unplaced": unplaced,
                 "current_as_of": current, "osm_timestamp": instant},
    )
