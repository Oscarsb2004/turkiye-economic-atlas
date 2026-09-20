"""
atlas.core.records — the record types every frame is made of (docs/REBUILD.md §2.1).

The published files keep the shapes the web app reads (`atlas.core.schema`).
Alongside them, each dataset is also described in these few general types, so
two datasets can be put side by side without knowing how either was published.
This module only defines the types and the conversions the datasets need; it
computes nothing.

    Observation   a published number about a place, in a period
    Place         an identity with a type, a parent and a boundary vintage
    Passage       words reproduced from a document, with where they were found
    Asset         a thing at a place: a project site, a port, a border crossing
    Event         something dated that happened to one of them
"""

from __future__ import annotations

from collections.abc import Mapping
from dataclasses import asdict, dataclass
from typing import Any

from atlas.core.schema import Text


@dataclass(frozen=True, slots=True)
class Observation:
    """One published value. `value` is None where the publisher left the cell blank; blank is not zero."""

    entity: str             # the place: "CA", "ON", "csd:2021:1001101"
    category: str           # a classification code (NAICS, T-code), or ""
    period: str             # as published: "2026-06", "2025", "2021"
    measure: str            # what is measured: gdp_chained, population, ...
    value: float | int | None
    unit: str = ""
    scalar: str = ""
    slice: str = ""         # a further breakdown, such as a size range; "" is the whole
    status: str = ""        # the publisher's flag for this cell, verbatim
    release: str = ""       # the publisher's release stamp
    source_table: str = ""
    provenance: str = ""

    def row(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class Place:
    """A place as its publisher identifies it, at one boundary vintage."""

    key: str                # "csd:2021:1001101"
    kind: str               # "census_subdivision", "province"
    name: Text
    parent: str             # the key of the place it sits inside, or ""
    vintage: str
    type_code: str = ""     # the publisher's own legal or statistical type code
    type_name: Text | None = None
    source_table: str = ""

    def row(self) -> dict[str, Any]:
        return {
            "key": self.key, "kind": self.kind, "name_tr": self.name.tr, "name_en": self.name.en,
            "parent": self.parent, "vintage": self.vintage, "type_code": self.type_code,
            "type_tr": self.type_name.tr if self.type_name else "",
            "type_en": self.type_name.en if self.type_name else "",
            "source_table": self.source_table,
        }


@dataclass(frozen=True, slots=True)
class Passage:
    """Words as their publisher wrote them, and where to find them again."""

    entity: str             # what the passage is about: "ON"
    kind: str               # what it is: "budget_risk", "motto", "flag_description"
    text_tr: str
    text_en: str
    source_url: str
    locator: str = ""       # a page number, a heading — where in the document
    content_sha256: str = ""
    provenance: str = ""

    def row(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class Asset:
    """A thing at a place. Coordinates are [lon, lat], and a derived one says so."""

    key: str
    kind: str                       # "project_site", "port", "border_crossing"
    name_tr: str
    name_en: str
    parent: str = ""                # the project or corridor it belongs to
    category: str = ""              # the publisher's own class: a sector, a mode
    lon: float | None = None
    lat: float | None = None
    geometry_kind: str = ""         # point | corridor | region | absent
    coordinate_provenance: str = ""
    status_tr: str = ""
    status_en: str = ""
    source_url: str = ""
    provenance: str = ""

    def row(self) -> dict[str, Any]:
        return asdict(self)


@dataclass(frozen=True, slots=True)
class Event:
    """Something dated, in the publisher's words, with the date exactly as published."""

    entity: str
    period: str                     # ISO, as precise as the source was
    category: str                   # "project_update"
    text_tr: str
    text_en: str
    date_verbatim: str = ""         # the publisher's own wording of the date
    source_url: str = ""
    provenance: str = ""

    def row(self) -> dict[str, Any]:
        return asdict(self)
