"""
atlas.datasets.istanbul_transit — İstanbul's rail and sea network, from its GTFS feed.

    python -m atlas.run transit

WHAT IS IN, AND WHAT IS DELIBERATELY NOT

The feed covers metro and Marmaray, trams, the funiculars and cable cars, the
ferries of Şehir Hatları, İDO, Turyol and Dentur Avrasya — and 376 minibüs and
taxi-dolmuş routes. This dataset is the FIXED network: the modes that run on
rails or water. The minibüs routes are a different subject with a different
kind of service, and 78% of the feed's geometry; they are a card away, not a
line dropped for convenience.

WHAT IS PUBLISHED

Every route as İBB publishes it — id, short and long name, mode, agency — with
the number of trips the feed schedules for it, which is a count of published
rows. Its shape, per direction, is the publisher's geometry, simplified at 20 m
(stated in the file). Its stops are the calls of the longest trip the feed
lists in that direction, in the published order.

WHAT IS OURS

The simplification, the choice of the longest trip as the representative one,
and the map's opening view, which is the extent of the published geometry.
Each says so where it appears.

THE FEED HAS NO EDITION

There is no feed_info.txt. The date published here is the newest
`last_modified` the portal reports for the eight resources, which is when İBB
last replaced one of them, and the service window is calendar.txt's own
earliest start and latest end.
"""

from __future__ import annotations

import logging
from collections import defaultdict

from atlas.core import clock
from atlas.core import frames
from atlas.core import registry as R
from atlas.core.records import Asset
from atlas.core.schema import Provenance, SourceRef
from atlas.datasets import Built, Context
from atlas.readers import gtfs
from atlas.shells.transform import geometry

log = logging.getLogger(__name__)

SOURCE_KEY = "ibb_gtfs"

#: The GTFS route types this dataset publishes, and what each is called. The
#: numbers are the specification's; the names are what a reader in İstanbul
#: would use. Marmaray is published by İBB as type 1, and reproduced as such.
MODES = {
    "0": ("tram", {"tr": "Tramvay", "en": "Tram"}),
    "1": ("metro", {"tr": "Metro ve Marmaray", "en": "Metro and Marmaray"}),
    "4": ("ferry", {"tr": "Vapur", "en": "Ferry"}),
    "6": ("cable_car", {"tr": "Teleferik", "en": "Cable car"}),
    "7": ("funicular", {"tr": "Füniküler", "en": "Funicular"}),
}

#: Metres a simplified shape may sit from the published one. Twenty, not the
#: fifty the railway uses: a metro line turns inside a city block.
TOLERANCE_M = 20

#: The tables read, and the columns each must carry.
TABLES = {
    "agency": ("agency_id", "agency_name"),
    "calendar": ("service_id", "start_date", "end_date"),
    "routes": ("route_id", "route_type", "route_short_name", "route_long_name"),
    "trips": ("trip_id", "route_id", "shape_id", "direction_id"),
    "stops": ("stop_id", "stop_name", "stop_lat", "stop_lon"),
    "stop_times": ("trip_id", "stop_id", "stop_sequence"),
    "shapes": ("shape_id", "shape_pt_lat", "shape_pt_lon", "shape_pt_sequence"),
}


def _resources(ctx: Context, src: dict) -> tuple[dict[str, str], str]:
    """Each resource's download URL by name, and the newest date the portal reports."""
    answer = ctx.fetch.json(f"{src['api']}/package_show?id={src['package']}")
    if not answer.get("success"):
        raise ValueError(f"{SOURCE_KEY}: the portal refused package_show: {str(answer)[:200]}")
    urls, dates = {}, []
    for resource in answer["result"]["resources"]:
        urls[str(resource.get("name", "")).strip()] = resource["url"]
        when = str(resource.get("last_modified") or resource.get("created") or "")
        if when:
            dates.append(when)
    missing = sorted(set(TABLES) - set(urls))
    if missing:
        raise ValueError(f"{SOURCE_KEY}: the package has no resource named {missing}; it has {sorted(urls)}")
    return urls, max(dates)[:10]


def build(ctx: Context, *, dataset: str) -> Built:
    """İstanbul's metro, tram, funicular, cable car and ferry network."""
    src = R.source(SOURCE_KEY)
    urls, published_on = _resources(ctx, src)

    tables = {}
    repaired = 0
    for name, needs in TABLES.items():
        body = ctx.fetch.bytes(urls[name], force=ctx.refresh)
        tables[name] = gtfs.table(body, name=name, needs=needs)
        repaired += tables[name].repaired

    agencies = {row["agency_id"]: row["agency_name"] for row in tables["agency"].rows}
    kept = {row["route_id"]: row for row in tables["routes"].rows if row["route_type"] in MODES}

    # Trips on those routes: how many the feed schedules, and which shapes and
    # trips represent each direction.
    trips_of_route: dict[str, list[dict]] = defaultdict(list)
    for trip in tables["trips"].rows:
        if trip["route_id"] in kept:
            trips_of_route[trip["route_id"]].append(trip)

    calls: dict[str, list[tuple[int, str]]] = defaultdict(list)
    wanted_trips = {trip["trip_id"] for trips in trips_of_route.values() for trip in trips}
    for call in tables["stop_times"].rows:
        if call["trip_id"] in wanted_trips:
            calls[call["trip_id"]].append((int(call["stop_sequence"]), call["stop_id"]))

    points_of_shape: dict[str, list[tuple[int, float, float]]] = defaultdict(list)
    wanted_shapes = {trip["shape_id"] for trips in trips_of_route.values()
                     for trip in trips if trip.get("shape_id")}
    for point in tables["shapes"].rows:
        if point["shape_id"] in wanted_shapes:
            points_of_shape[point["shape_id"]].append(
                (int(point["shape_pt_sequence"]), float(point["shape_pt_lon"]), float(point["shape_pt_lat"]))
            )

    stops_by_id = {row["stop_id"]: row for row in tables["stops"].rows}
    used_stops: set[str] = set()
    published_routes = []
    raw_points = kept_points = 0

    for route_id, route in sorted(kept.items(), key=lambda pair: pair[0]):
        mode, mode_label = MODES[route["route_type"]]
        shapes, stop_ids = [], []
        by_direction: dict[str, list[dict]] = defaultdict(list)
        for trip in trips_of_route[route_id]:
            by_direction[trip.get("direction_id", "")].append(trip)

        for direction in sorted(by_direction):
            # The longest trip the feed lists in this direction stands for it:
            # a route's trips differ in how far they run, and the longest is the
            # one that calls everywhere the others do.
            longest = max(by_direction[direction],
                          key=lambda trip: len(calls.get(trip["trip_id"], ())))
            for _, stop_id in sorted(calls.get(longest["trip_id"], ())):
                if stop_id in stops_by_id and stop_id not in stop_ids:
                    stop_ids.append(stop_id)
                used_stops.add(stop_id)
            shape = points_of_shape.get(longest.get("shape_id", ""), [])
            if shape:
                line = geometry.without_repeats(
                    (round(lon, 5), round(lat, 5)) for _, lon, lat in sorted(shape)
                )
                raw_points += len(line)
                line = geometry.simplify(line, TOLERANCE_M)
                kept_points += len(line)
                if len(line) >= 2:
                    shapes.append([[lon, lat] for lon, lat in line])

        published_routes.append({
            "id": route_id,
            "short_name": route["route_short_name"],
            "long_name": route["route_long_name"],
            "route_type": int(route["route_type"]),
            "mode": mode,
            "mode_label": mode_label,
            "agency": agencies.get(route.get("agency_id", ""), ""),
            # A count of the trips the feed lists for this route, across every
            # service pattern in it. Not a timetable and not a daily figure.
            "trips": len(trips_of_route[route_id]),
            "stops": stop_ids,
            "shapes": shapes,
        })

    published_stops = [
        {
            "id": stop_id,
            "name": stops_by_id[stop_id]["stop_name"],
            "point": [round(float(stops_by_id[stop_id]["stop_lon"]), 5),
                      round(float(stops_by_id[stop_id]["stop_lat"]), 5)],
        }
        for stop_id in sorted(used_stops) if stop_id in stops_by_id
    ]

    lons = [stop["point"][0] for stop in published_stops]
    lats = [stop["point"][1] for stop in published_stops]
    starts = sorted(row["start_date"] for row in tables["calendar"].rows if row.get("start_date"))
    ends = sorted(row["end_date"] for row in tables["calendar"].rows if row.get("end_date"))
    retrieved = clock.now_iso()

    payload = {
        "generated_at": retrieved,
        "feed": {
            "city": {"tr": "İstanbul", "en": "İstanbul"},
            "label": {"tr": "İstanbul raylı sistem ve deniz ulaşımı",
                      "en": "İstanbul rail and sea transit"},
            "published_on": published_on,
            "services_from": starts[0] if starts else "",
            "services_to": ends[-1] if ends else "",
            "modes": {mode: sum(1 for route in published_routes if route["mode"] == mode)
                      for _, (mode, _label) in sorted(MODES.items())},
            "mode_labels": {mode: label for _, (mode, label) in sorted(MODES.items())},
            "agencies": sorted({route["agency"] for route in published_routes if route["agency"]}),
            # The feed also carries these, and this dataset does not.
            "not_included": {
                "routes": sum(1 for row in tables["routes"].rows if row["route_type"] not in MODES),
                "why": ("minibüs and taxi-dolmuş routes: a different kind of service, and "
                        "78% of the feed's geometry"),
            },
            "repaired_rows": repaired,
            "derivation": {
                "provenance": Provenance.DERIVED.value,
                "simplified": f"Douglas–Peucker at {TOLERANCE_M} m, which left {kept_points} of {raw_points} points",
                "tolerance_m": TOLERANCE_M,
                "representative_trip": ("each direction is drawn and listed from the longest trip the "
                                        "feed schedules in it"),
                "view": "the opening view is the extent of the published stops",
            },
            "view": ([min(lons), min(lats), max(lons), max(lats)] if lons else []),
        },
        "routes": published_routes,
        "stops": published_stops,
        "sources": [SourceRef(
            url=src["page"], retrieved_at=retrieved,
            provenance=Provenance.OFFICIAL_DATASET, licence=src["licence"],
        ).to_dict()],
    }

    rows = [
        Asset(
            key=f"gtfs:istanbul:stop:{stop['id']}", kind="transit_stop",
            name_tr=stop["name"], name_en="",
            parent="il:34", category="",
            lon=stop["point"][0], lat=stop["point"][1],
            geometry_kind="point", coordinate_provenance=Provenance.OFFICIAL_DATASET.value,
            source_url=src["page"], provenance=Provenance.OFFICIAL_DATASET.value,
        ).row()
        for stop in published_stops
    ]
    frame = frames.Frame(
        dataset=dataset, name="transit-stops", profile="points", record_type="asset",
        keys=frames.ASSET_KEYS, columns=frames.ASSET_COLUMNS, rows=rows,
        published=("data/transit/istanbul.json",),
        notes={"routes": len(published_routes), "stops": len(published_stops)},
    )

    log.info("İstanbul transit: %d routes in %d modes, %d stops, %d of %d shape points kept",
             len(published_routes), len([m for m, n in payload["feed"]["modes"].items() if n]),
             len(published_stops), kept_points, raw_points)
    return Built(
        outputs=[(R.DATA_DIR / "transit" / "istanbul.json", payload)],
        frames=[frame],
        receipt={"routes": len(published_routes), "stops": len(published_stops),
                 "modes": payload["feed"]["modes"], "repaired_rows": repaired,
                 "published_on": published_on, "points_kept": kept_points, "points_raw": raw_points},
    )
