"""
atlas.readers.wmts — a tile service's own description of itself.

    https://gibs.earthdata.nasa.gov/wmts/epsg3857/best/1.0.0/WMTSCapabilities.xml

WHY A CAPABILITIES DOCUMENT IS WORTH READING

A raster layer is the one thing in this atlas that the reader's browser fetches
from a publisher directly, live, a tile at a time. Nothing about it is
committed here — so if the URL template were written down in the app, it would
be an unchecked claim about a service, and the day NASA changed it the map
would go black with no error anywhere.

The service publishes all of it: the template, the tile matrix set, the format,
and — for a layer that has a Time dimension — exactly which dates it holds.
This reads that, and the dataset then chooses dates FROM it and checks each
one against it, so a date the atlas offers is a date the service says it has.

WHAT IT REFUSES

A layer that is not in the document, a layer with no tile template, and a Time
dimension with no values. Each of those would leave the app asking for tiles
that cannot exist.
"""

from __future__ import annotations

import logging
import xml.etree.ElementTree as ET
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

WMTS = "{http://www.opengis.net/wmts/1.0}"
OWS = "{http://www.opengis.net/ows/1.1}"

#: The dimension a dated layer carries. WMTS lets a layer have any dimensions
#: it likes; this is the one that means "when".
TIME = "Time"


class WmtsError(ValueError):
    """The capabilities document is not shaped the way this reader was written for."""


@dataclass(slots=True)
class Layer:
    """One layer, as the service describes it."""

    identifier: str
    title: str
    formats: list[str] = field(default_factory=list)
    matrix_sets: list[str] = field(default_factory=list)
    #: The tile URL template, with {Time}, {TileMatrix}, {TileRow}, {TileCol}.
    template: str = ""
    #: ISO 8601 intervals, exactly as published: "2012-01-19/2012-02-17/P1D".
    periods: list[str] = field(default_factory=list)
    #: The date the service serves when none is asked for.
    default_time: str = ""


def layer(body: bytes, identifier: str) -> Layer:
    """One layer of a WMTS capabilities document, by its identifier."""
    root = ET.fromstring(body)
    for element in root.iter(f"{WMTS}Layer"):
        name = element.findtext(f"{OWS}Identifier", default="").strip()
        if name != identifier:
            continue

        found = Layer(
            identifier=name,
            title=element.findtext(f"{OWS}Title", default="").strip(),
            formats=[node.text.strip() for node in element.findall(f"{WMTS}Format") if node.text],
            matrix_sets=[node.text.strip()
                         for link in element.findall(f"{WMTS}TileMatrixSetLink")
                         for node in link.findall(f"{WMTS}TileMatrixSet") if node.text],
        )
        for resource in element.findall(f"{WMTS}ResourceURL"):
            if resource.get("resourceType") == "tile" and "{Time}" in (resource.get("template") or ""):
                found.template = resource.get("template", "")
                break
        for dimension in element.findall(f"{WMTS}Dimension"):
            if dimension.findtext(f"{OWS}Identifier", default="").strip() != TIME:
                continue
            found.default_time = dimension.findtext(f"{WMTS}Default", default="").strip()
            found.periods = [node.text.strip()
                             for node in dimension.findall(f"{WMTS}Value") if node.text]

        if not found.template:
            raise WmtsError(f"{identifier}: no tile template with a {{Time}} in it")
        if not found.periods:
            raise WmtsError(f"{identifier}: the Time dimension publishes no values")
        log.info("wmts %s: %d published period(s), default %s",
                 identifier, len(found.periods), found.default_time)
        return found

    names = sorted({element.findtext(f"{OWS}Identifier", default="")
                    for element in root.iter(f"{WMTS}Layer")})
    raise WmtsError(
        f"no layer named {identifier!r} in the document; it describes {len(names)} layers"
    )


def covers(periods: list[str], date: str) -> str:
    """
    The published period a date falls in, or "" — the string, so it can be shown.

    A WMTS period is `start/end/step`. Only the ends are compared here: a
    service that publishes a P1D step over a range holds every day in it, and
    this atlas only ever asks for whole days.
    """
    for period in periods:
        parts = period.split("/")
        if len(parts) < 2:
            if parts and parts[0][:10] == date:
                return period
            continue
        if parts[0][:10] <= date <= parts[1][:10]:
            return period
    return ""


def latest(periods: list[str], not_after: str = "") -> str:
    """The newest day the service publishes, or the newest at or before `not_after`."""
    best = ""
    for period in periods:
        parts = period.split("/")
        end = (parts[1] if len(parts) > 1 else parts[0])[:10]
        start = parts[0][:10]
        if not_after:
            if start > not_after:
                continue
            end = min(end, not_after)
        if end > best:
            best = end
    return best
