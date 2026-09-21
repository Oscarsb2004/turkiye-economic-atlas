"""
atlas.readers.overpass — OpenStreetMap, asked for exactly what is wanted.

    https://overpass-api.de/api/interpreter

WHY THIS AND NOT AN EXTRACT

Geofabrik's Türkiye extract is 612 MB of PBF and the HOT export on HDX, which
is a manageable 800 KB, has been stripped to `railway` and `name`: no `usage`,
no `highspeed`, no `electrified`, no `gauge`, no `operator`. Half of T9 is
telling a high-speed line from a branch line, and those tags are the only place
that is published. Overpass returns them, for the ways that matter, in 8 MB.

HOW IT IS ASKED

A POST with a form body, which is what the API takes and what
`Fetcher.post_form` caches on (the URL and a hash of the body). One query is
about half a minute of a volunteer-run service's time, so a cached answer is
the difference between reading OSM once a day and once a run.

WHAT COMES BACK

`elements`, each a node or a way, with `tags` as published and — for a way
asked with `out geom` — `geometry`, its points in order. The envelope carries
`osm3s.timestamp_osm_base`, the moment the data was current: that is the
period this atlas publishes the network under, because OSM has no other date.

WHAT IT REFUSES

An answer with no elements, an envelope with no timestamp, and a way with no
geometry. Overpass answers 200 with an empty element list when a query matches
nothing — including when an area filter silently failed — so "no elements" is
never taken as "there is no railway in Türkiye".
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)

ENDPOINT = "https://overpass-api.de/api/interpreter"

#: Türkiye, as an Overpass area. `ISO3166-1` on the admin_level=2 relation is
#: how the country is identified without naming a relation id that can change.
AREA = 'area["ISO3166-1"="TR"][admin_level=2]->.tr;'

#: The main-line network, plus anything tagged high-speed. `usage=main` is what
#: separates a line from the sidings and yard tracks that share `railway=rail`,
#: and the second clause is there because a high-speed line under construction
#: is not always tagged `usage` yet.
RAIL_QUERY = f"""[out:json][timeout:300];
{AREA}
(
  way["railway"="rail"]["usage"="main"](area.tr);
  way["railway"="rail"]["highspeed"="yes"](area.tr);
);
out geom tags;"""

#: Stations and halts, as points. `railway=halt` is a stop without the
#: facilities of a station and is published as its own thing, not folded in.
STATION_QUERY = f"""[out:json][timeout:300];
{AREA}
(
  node["railway"="station"](area.tr);
  node["railway"="halt"](area.tr);
);
out body;"""


#: Cities and towns, as points. `place=city` and `place=town` are OSM's own two
#: classes for a settlement a reader would name; `village` would be the next one
#: down and is 35 000 more of them, which is not a label layer.
#:
#: Measured 2026-09-21: 1 005 nodes over Türkiye, which is a node query like the
#: stations above rather than the 37 434 ways a road query would be.
PLACE_QUERY = f"""[out:json][timeout:300];
{AREA}
(
  node["place"="city"](area.tr);
  node["place"="town"](area.tr);
);
out body;"""


class OverpassError(ValueError):
    """The API answered with something this reader was not written for."""


@dataclass(frozen=True, slots=True)
class Way:
    """One OSM way, with its points in the order they are published."""

    osm_id: int
    tags: dict[str, str]
    points: list[tuple[float, float]]


@dataclass(frozen=True, slots=True)
class Node:
    """One OSM node, at the coordinate it is published at."""

    osm_id: int
    tags: dict[str, str]
    point: tuple[float, float]


def ask(fetch, query: str, *, force: bool = False) -> dict[str, Any]:
    """
    Run one Overpass query and return its answer, checked for shape.

    `force` goes through to the cache, because `--refresh` means "I know
    something just moved" and a query that quietly answered from a day-old
    entry would be the one case the flag exists for.
    """
    answer = fetch.post_form(ENDPOINT, {"data": query}, force=force)
    if not isinstance(answer, dict) or "elements" not in answer:
        raise OverpassError(f"the API returned no `elements`: {str(answer)[:200]}")
    if not answer["elements"]:
        # 200 with nothing in it is what a query that matched nothing looks
        # like, and also what a silently failed area filter looks like.
        raise OverpassError(
            f"the API matched nothing. The query was:\n{query}\n"
            f"An empty answer is never taken as 'there is none'"
        )
    if not str(answer.get("osm3s", {}).get("timestamp_osm_base", "")):
        raise OverpassError("the answer carries no osm3s.timestamp_osm_base, so it has no date")
    return answer


def current_as_of(answer: dict[str, Any]) -> str:
    """When the data in this answer was current, as OSM states it."""
    return str(answer["osm3s"]["timestamp_osm_base"])


def ways(answer: dict[str, Any]) -> list[Way]:
    """Every way in the answer, with the geometry `out geom` returned."""
    found = []
    for element in answer["elements"]:
        if element.get("type") != "way":
            continue
        points = element.get("geometry")
        if not points:
            raise OverpassError(
                f"way {element.get('id')} came back without geometry; the query must say `out geom`"
            )
        found.append(Way(
            osm_id=int(element["id"]),
            tags={str(k): str(v) for k, v in (element.get("tags") or {}).items()},
            points=[(float(p["lon"]), float(p["lat"])) for p in points],
        ))
    if not found:
        raise OverpassError("the answer carries no ways")
    log.info("overpass: %d ways, %d points", found and len(found), sum(len(w.points) for w in found))
    return found


def nodes(answer: dict[str, Any]) -> list[Node]:
    """Every node in the answer, at the coordinate published for it."""
    found = []
    for element in answer["elements"]:
        if element.get("type") != "node":
            continue
        if element.get("lon") is None or element.get("lat") is None:
            raise OverpassError(f"node {element.get('id')} came back without a coordinate")
        found.append(Node(
            osm_id=int(element["id"]),
            tags={str(k): str(v) for k, v in (element.get("tags") or {}).items()},
            point=(float(element["lon"]), float(element["lat"])),
        ))
    if not found:
        raise OverpassError("the answer carries no nodes")
    log.info("overpass: %d nodes", len(found))
    return found
