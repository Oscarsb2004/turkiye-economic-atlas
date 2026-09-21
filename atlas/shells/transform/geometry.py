"""
atlas.shells.transform.geometry — the plane geometry the pipeline needs, and no more.

Three operations, each of which arrived with a dataset that could not be
published honestly without it:

  stitch      OpenStreetMap splits a railway at every bridge, tunnel and change
              of attribute, so one line reaches this project as hundreds of
              fragments. Joining the ones that share an end AND say the same
              things about themselves turns 7 758 ways into the lines a reader
              would name.

  simplify    Those lines carry a point every twenty metres, which is invisible
              on a map of a country and is most of the file. Douglas–Peucker
              drops the points the SHAPE does not need, at a tolerance stated in
              metres so the loss is a number a reader can judge.

  containing  A station is published as a coordinate; the atlas joins on the
              plaka code. The province is therefore the one whose PUBLISHED
              boundary contains the PUBLISHED point — a derivation with a
              formula, which verify/ recomputes independently.

  nearest     And because those boundaries are SIMPLIFIED, a point can be just
              outside all of them: eighteen Marmaray stations on the Marmara
              shore sit a few hundred metres off Natural Earth's coastline at
              8%. The nearest province within a stated distance is the honest
              answer there, and the record says it was placed that way rather
              than contained.

WHAT THIS IS NOT

It is not a projection library. Distances here are metres only in the small:
longitude is scaled by cos(latitude) about the line's own middle, which is
right to a fraction of a percent over a line a few hundred kilometres long at
Turkish latitudes, and wrong for anything spanning the globe. Simplification
and containment are all it is used for, and both are local.
"""

from __future__ import annotations

import math
from typing import Any, Iterable, Sequence

#: Metres in one degree of latitude. The WGS84 meridian is 40 007 863 m long,
#: which is this, and it is the only constant needed: longitude is this times
#: the cosine of the latitude.
METRES_PER_DEGREE = 111_320.0

Point = tuple[float, float]


# ── Joining fragments ──────────────────────────────────────────────────────────

def stitch(lines: Iterable[Sequence[Point]]) -> list[list[Point]]:
    """
    Join lines that share an end into the longest chains they make.

    Every input line is used exactly once, and a line is reversed if that is how
    it fits — direction is not published information about a railway, and the
    two halves of a line drawn towards each other are still one line.

    A junction where three fragments meet cannot become one chain, so the first
    two join and the third stays its own line. That is a real fork in the
    network rather than a failure: the output is a set of chains, not a route.
    """
    return [points for points, _ in stitch_indexed(lines)]


def stitch_indexed(lines: Iterable[Sequence[Point]]) -> list[tuple[list[Point], list[int]]]:
    """
    The same, with the positions of the lines each chain was made of.

    The caller usually has something to say about those lines — an OSM way id,
    a publisher's reference — and it cannot be recovered afterwards by matching
    coordinates: a short fragment's two ends can both lie on a DIFFERENT chain,
    and inferring membership that way put the same way in two chains and made
    two lines claim one id. The stitcher knows; it now says.
    """
    remaining = [list(line) for line in lines if len(line) >= 2]
    ends: dict[Point, list[int]] = {}
    for index, line in enumerate(remaining):
        ends.setdefault(line[0], []).append(index)
        ends.setdefault(line[-1], []).append(index)

    used = [False] * len(remaining)
    chains: list[tuple[list[Point], list[int]]] = []
    for index in range(len(remaining)):
        if used[index]:
            continue
        used[index] = True
        chain = list(remaining[index])
        members = [index]
        grew = True
        while grew:
            grew = False
            for at_end in (True, False):
                end = chain[-1] if at_end else chain[0]
                for candidate in ends.get(end, ()):
                    if used[candidate]:
                        continue
                    piece = remaining[candidate]
                    if piece[0] != end:
                        piece = list(reversed(piece))
                    if piece[0] != end:
                        continue
                    used[candidate] = True
                    members.append(candidate)
                    chain = chain + piece[1:] if at_end else list(reversed(piece))[:-1] + chain
                    grew = True
                    break
                if grew:
                    break
        chains.append((chain, sorted(members)))
    return chains


# ── Dropping points a shape does not need ──────────────────────────────────────

def simplify(line: Sequence[Point], tolerance_m: float) -> list[Point]:
    """
    Douglas–Peucker: keep the points the shape needs, at `tolerance_m` metres.

    The two ends are always kept, so a simplified line still starts and ends
    where the published one did, and a line of two points is returned as it is.
    """
    points = list(line)
    if len(points) < 3 or tolerance_m <= 0:
        return points

    middle = math.radians(sum(lat for _, lat in points) / len(points))
    scale = math.cos(middle)
    flat = [(lon * scale, lat) for lon, lat in points]
    tolerance = tolerance_m / METRES_PER_DEGREE

    keep = [False] * len(points)
    keep[0] = keep[-1] = True
    stack = [(0, len(points) - 1)]
    while stack:
        first, last = stack.pop()
        ax, ay = flat[first]
        bx, by = flat[last]
        dx, dy = bx - ax, by - ay
        span = math.hypot(dx, dy)
        worst, at = -1.0, -1
        for index in range(first + 1, last):
            px, py = flat[index]
            # Distance from the point to the line through the two ends; where
            # the ends coincide (a loop), to the point they share.
            gap = (math.hypot(px - ax, py - ay) if span == 0
                   else abs(dy * px - dx * py + bx * ay - by * ax) / span)
            if gap > worst:
                worst, at = gap, index
        if at > 0 and worst > tolerance:
            keep[at] = True
            stack.append((first, at))
            stack.append((at, last))
    return [point for point, keeping in zip(points, keep) if keeping]


def without_repeats(points: Iterable[Point]) -> list[Point]:
    """The same line with consecutive duplicate points dropped."""
    out: list[Point] = []
    for point in points:
        if not out or point != out[-1]:
            out.append(point)
    return out


# ── Which published area a published point is in ───────────────────────────────

def containing(point: Point, features: Sequence[dict[str, Any]]) -> dict[str, Any] | None:
    """
    The first feature whose boundary contains `point`, or None.

    Ray casting, with holes handled by the same rule that draws them: a point
    inside an odd number of rings is inside the polygon. A point on a shared
    border belongs to whichever feature is tested first, which is why the caller
    should treat a boundary case as one — the atlas publishes the province a
    publisher named and checks it against this, rather than the other way round.
    """
    for feature in features:
        if _in_geometry(point, (feature.get("geometry") or {})):
            return feature
    return None


def nearest(point: Point, features: Sequence[dict[str, Any]],
            within_m: float) -> tuple[dict[str, Any] | None, float]:
    """
    The closest feature and its distance in metres, or (None, inf) beyond `within_m`.

    Distance to a polygon is the distance to the nearest piece of its boundary,
    so a point inside comes back at a distance of zero only if `containing`
    would also have found it — the two agree at the edge.
    """
    best: dict[str, Any] | None = None
    best_gap = float("inf")
    for feature in features:
        gap = distance_m(point, (feature.get("geometry") or {}))
        if gap < best_gap:
            best, best_gap = feature, gap
    if best_gap > within_m:
        return None, float("inf")
    return best, best_gap


def distance_m(point: Point, geometry: dict[str, Any]) -> float:
    """Metres from `point` to the nearest part of a polygon's boundary, or inf."""
    rings: list[Sequence[Sequence[float]]] = []
    kind = geometry.get("type")
    if kind == "Polygon":
        rings = list(geometry.get("coordinates") or [])
    elif kind == "MultiPolygon":
        for polygon in geometry.get("coordinates") or []:
            rings.extend(polygon)
    if not rings:
        return float("inf")
    if _in_geometry(point, geometry):
        return 0.0

    scale = math.cos(math.radians(point[1]))
    px, py = point[0] * scale, point[1]
    best = float("inf")
    for ring in rings:
        for index in range(len(ring) - 1):
            ax, ay = ring[index][0] * scale, ring[index][1]
            bx, by = ring[index + 1][0] * scale, ring[index + 1][1]
            dx, dy = bx - ax, by - ay
            if dx == 0 and dy == 0:
                gap = math.hypot(px - ax, py - ay)
            else:
                along = max(0.0, min(1.0, ((px - ax) * dx + (py - ay) * dy) / (dx * dx + dy * dy)))
                gap = math.hypot(px - (ax + along * dx), py - (ay + along * dy))
            best = min(best, gap)
    return best * METRES_PER_DEGREE


def _in_geometry(point: Point, geometry: dict[str, Any]) -> bool:
    kind = geometry.get("type")
    coordinates = geometry.get("coordinates") or []
    if kind == "Polygon":
        return _in_polygon(point, coordinates)
    if kind == "MultiPolygon":
        return any(_in_polygon(point, polygon) for polygon in coordinates)
    return False


def _in_polygon(point: Point, rings: Sequence[Sequence[Sequence[float]]]) -> bool:
    inside = False
    for ring in rings:
        if _in_ring(point, ring):
            inside = not inside      # a ring inside a ring is a hole
    return inside


def _in_ring(point: Point, ring: Sequence[Sequence[float]]) -> bool:
    x, y = point
    inside = False
    count = len(ring)
    for index in range(count):
        x1, y1 = ring[index][0], ring[index][1]
        x2, y2 = ring[(index + 1) % count][0], ring[(index + 1) % count][1]
        if (y1 > y) != (y2 > y):
            crossing = x1 + (y - y1) * (x2 - x1) / (y2 - y1)
            if crossing > x:
                inside = not inside
    return inside
