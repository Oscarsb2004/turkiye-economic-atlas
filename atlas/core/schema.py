"""
atlas.core.schema — the canonical objects the whole project agrees through.

The governing principle, carried over from African-Stability-Index:

    The frontend and the backend are the same object.

A record carries BOTH its identity and its value. The web app renders what it is
given and never re-derives a label, a total, or a rank. `verify/contract.py`
enforces this across the bundle boundary.

Nothing here computes anything. These are transport and validation types only,
so the pipeline, the web app, and the independent verifier share exactly one
vocabulary.

Two rules are specific to this project and are the reason several fields exist
that would otherwise look redundant:

  1. Federal text is reproduced, never authored. Every string sourced from a
     government page travels with the `SourceRef` that produced it, so a reader
     can always get back to the page and check. Fields we compute are marked
     DERIVED and are visibly ours.

  2. Federal pages are edited in place. `SourceRef.content_sha256` is what makes
     an append-only history possible: stage 01 writes a new history entry only
     when the hash moves, so "what did the government say, and when did it
     change" stays answerable without storing a copy per run.

Design notes:
  - stdlib dataclasses, no pydantic, no new dependencies
  - every type round-trips through to_dict()/from_dict() for JSON transport
  - bilingual text is a `Text` pair rather than parallel `_tr`/`_en` fields, so
    a language can never be silently dropped by a partial write
"""

from __future__ import annotations

import hashlib
import math
from dataclasses import dataclass, field
from enum import Enum
from typing import Any


# ── Portable (Athena core) ─────────────────────────────────────────────────────
# Provenance, SourceRef, Geometry, to_jsonable and the Text pattern are shared
# with world-strategic-map. Changing their wire shape is a cross-repo break;
# bump meta.schema_version. Everything else is free to change without telling
# anyone.
#
# The project-specific records that stood below this point in the Canadian atlas
# — projects, corridors, vessels, sector series — were left behind in the fork.
# Türkiye's own arrive with the datasets that need them.
#
# Two known Canada-shaped edges, for whoever extracts these into athena-core:
#   - Text(tr, en) is a two-language pair because that is what this atlas
#     publishes, not a general truth. The general form is a language-keyed map
#     with the same .get(lang) fallback. Nothing may depend on Text having
#     exactly two fields.
#   - Geometry.provinces holds subdivision codes here; the general form is a
#     tuple of area codes, and the sibling puts ISO3 country codes in that slot.


# ── Vocabularies ───────────────────────────────────────────────────────────────

class Provenance(str, Enum):
    """
    How a value came to exist. Rendered in the UI, never hidden.

    The distinction that matters most here is OFFICIAL_DATASET vs PAGE_VERBATIM:
    the first is a machine-readable government dataset under a stated licence,
    the second is prose lifted from a web page. They have different reliability
    and different citation needs, and collapsing them would let a scraped
    sentence pass itself off as a published statistic.
    """

    OFFICIAL_DATASET = "official_dataset"   # NRCan ArcGIS, StatCan WDS, Bank of Canada
    PAGE_VERBATIM    = "page_verbatim"      # reproduced from a federal page as published
    NEWS_RELEASE     = "news_release"       # reproduced from a dated announcement
    MARKET_DATA      = "market_data"        # unused since the company panel was removed (2026-09-12)
    DERIVED          = "derived"            # computed by this pipeline
    THIRD_PARTY      = "third_party"        # a non-government feed, relayed as received (AIS)
    ABSENT           = "absent"             # nothing available

    @property
    def is_reproduced(self) -> bool:
        """True when the text is the government's words, not ours."""
        return self in (Provenance.PAGE_VERBATIM, Provenance.NEWS_RELEASE)


class GeometryKind(str, Enum):
    """
    What a project's location actually is.

    POINT is a single site. CORRIDOR is a two-endpoint route — a highway, a
    pipeline — which must be drawn as a line, because dropping a pin at one end
    of the Mackenzie Valley Highway asserts a location the source does not.
    REGION is a strategy whose published location is prose ("All of Canada"),
    hand-mapped to provinces. ABSENT is stated rather than guessed.
    """

    POINT    = "point"
    CORRIDOR = "corridor"
    REGION   = "region"
    ABSENT   = "absent"


def _flat_distance(a: tuple[float, float], b: tuple[float, float]) -> float:
    """
    Rough planar distance between two [lon, lat] pairs, longitude scaled.

    Only ever used to find the halfway point along a route, where a constant
    factor cancels — but the latitude scaling does not cancel, because a degree
    of longitude is half as long at 60°N as at the equator and the Mackenzie
    Valley Highway runs from 63°N to 68°N. Without it the midpoint slides
    toward the eastern end.
    """
    lat = math.radians((a[1] + b[1]) / 2)
    return math.hypot((b[0] - a[0]) * math.cos(lat), b[1] - a[1])


# ── Primitives ─────────────────────────────────────────────────────────────────

@dataclass(frozen=True, slots=True)
class Text:
    """
    One string in the two languages this atlas publishes: Turkish, then English.

    A pair rather than two loose fields: a reader fetches each language from a
    different page, and a pair makes a half-written record a type error at
    construction instead of an empty panel in the UI.

    TURKISH IS THE REQUIRED SIDE, and that is not a preference. TÜİK publishes
    bilingually, but YSK, SBB, AYGM and KGM publish in Turkish only, so English
    is the side that is routinely absent. `tr` has no default and `en` does, so a
    record cannot exist without the language every source actually has, and
    `.get("en")` falls back to Turkish rather than rendering nothing.

    The atlas this was forked from carried Text(en, fr) because bilingual EN/FR
    is a Canadian federal requirement. Nothing may depend on a pair having
    exactly these two sides; the general form is a language-keyed map with the
    same .get(lang) fallback.
    """

    tr: str
    en: str = ""

    def get(self, lang: str) -> str:
        """The text in `lang`, falling back to Turkish when English is missing."""
        return self.en if (lang == "en" and self.en) else self.tr

    def to_dict(self) -> dict[str, str]:
        return {"tr": self.tr, "en": self.en}

    @classmethod
    def from_dict(cls, d: dict[str, str]) -> Text:
        return cls(tr=d.get("tr", ""), en=d.get("en", ""))


@dataclass(frozen=True, slots=True)
class SourceRef:
    """
    Where a value came from, precisely enough to check it.

    `content_sha256` hashes the normalised text rather than the raw HTML: AEM
    rewrites whitespace and reorders attributes between deploys, so hashing raw
    bytes would report a change on every crawl and the history would be noise.
    """

    url: str
    retrieved_at: str                    # ISO-8601 UTC, second precision
    provenance: Provenance
    licence: str = ""
    content_sha256: str = ""

    @staticmethod
    def hash_content(text: str) -> str:
        """The canonical content hash. Normalise before calling."""
        return hashlib.sha256(text.encode("utf-8")).hexdigest()

    def to_dict(self) -> dict[str, Any]:
        return {
            "url": self.url,
            "retrieved_at": self.retrieved_at,
            "provenance": self.provenance.value,
            "licence": self.licence,
            "content_sha256": self.content_sha256,
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> SourceRef:
        return cls(
            url=d["url"],
            retrieved_at=d["retrieved_at"],
            provenance=Provenance(d["provenance"]),
            licence=d.get("licence", ""),
            content_sha256=d.get("content_sha256", ""),
        )


@dataclass(frozen=True, slots=True)
class Geometry:
    """
    A project's location as the source published it.

    `coordinates` is a list of [lon, lat] pairs — GeoJSON order, not lat/lon —
    because that is what MapLibre consumes and converting once at the boundary
    beats converting at every call site. One pair is a POINT, two is a CORRIDOR.

    `approximate` carries the source's own disclaimer forward: the MPO map states
    that all locations are approximate and subject to final routing decisions,
    and that caveat belongs with the coordinates rather than in a footer nobody
    reads.
    """

    kind: GeometryKind
    coordinates: tuple[tuple[float, float], ...] = ()
    provinces: tuple[str, ...] = ()          # REGION only
    location_verbatim: str = ""              # the source's own words
    approximate: bool = True

    #: Who produced these coordinates, when it is not the obvious answer.
    #:
    #: Left None, a single point is assumed to be the publisher's own — true for
    #: the MPO, whose ArcGIS service publishes official coordinates. It is NOT
    #: true everywhere: Transport Canada NAMES the ports and border crossings on
    #: each trade corridor and publishes no geometry for any of them, so those
    #: coordinates are ours. Inferring provenance from geometry shape would have
    #: labelled our placements `official_dataset`, which is the precise failure
    #: this project exists to avoid.
    coordinate_provenance: Provenance | None = None

    @property
    def anchor(self) -> tuple[float, float] | None:
        """
        The ONE point that represents this geometry on a map.

        Every geometry that has coordinates has an anchor, and that totality is
        the point. The map used to render points and corridors through two
        separate filters — `kind === "point"` for markers, `kind === "corridor"`
        for lines — so a corridor got a dashed line and NO marker: no headpiece,
        no click target, no way to open the project. Four of eighteen projects
        were anonymous squiggles, and adding a third kind would have made it
        five. Rendering has to be a total function over geometry, and a total
        function needs somewhere to put the marker.

        For a POINT that is the government's own coordinate. For a CORRIDOR it
        is the halfway point ALONG the route, which is why this walks the
        segments rather than averaging the ends: averaging is the same answer
        for the two-endpoint routes published today and the wrong one the moment
        a route arrives with a third vertex.

        A REGION has no coordinates — the strategies' locations are prose — so
        it returns None and must be reached some other way. `verify/` gates
        that: a record with no anchor and no other affordance is a record the
        reader cannot get to.
        """
        pts = self.coordinates
        if not pts:
            return None
        if len(pts) == 1:
            return pts[0]

        spans = [_flat_distance(pts[i], pts[i + 1]) for i in range(len(pts) - 1)]
        half = sum(spans) / 2
        if half <= 0:
            return pts[0]
        for (a, b), span in zip(zip(pts, pts[1:]), spans):
            if span >= half:
                t = half / span
                return (a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t)
            half -= span
        return pts[-1]

    @property
    def anchor_provenance(self) -> Provenance:
        """
        Whether the anchor is the source's coordinate or our arithmetic.

        A single point is the government's. A corridor midpoint is ours, and the
        UI must not render the two identically — the source published the ends
        of the Mackenzie Valley Highway, not its middle.
        """
        if not self.coordinates:
            return Provenance.ABSENT
        # An explicit declaration always wins over the shape-based guess.
        if self.coordinate_provenance is not None:
            return self.coordinate_provenance
        if self.kind is GeometryKind.POINT and len(self.coordinates) == 1:
            return Provenance.OFFICIAL_DATASET
        return Provenance.DERIVED

    @property
    def is_linear(self) -> bool:
        """Whether this draws as a line in addition to its marker."""
        return len(self.coordinates) > 1

    def to_dict(self) -> dict[str, Any]:
        anchor = self.anchor
        return {
            "kind": self.kind.value,
            "coordinates": [list(c) for c in self.coordinates],
            "provinces": list(self.provinces),
            "location_verbatim": self.location_verbatim,
            "approximate": self.approximate,
            # Published rather than re-derived in the browser. The app never
            # recomputes what the pipeline can state (CLAUDE.md §2), and an
            # anchor computed in two languages is an anchor that can disagree
            # with itself.
            "anchor": list(anchor) if anchor else None,
            "anchor_provenance": self.anchor_provenance.value,
            "is_linear": self.is_linear,
            # The DECLARATION, kept distinct from the computed value above.
            # `anchor_provenance` is an output the frontend reads; this is the
            # optional input that overrides it. Reading the computed value back
            # as a declaration would make a round trip lossy in the other
            # direction — every inferred value would come back explicit.
            "coordinate_provenance": (self.coordinate_provenance.value
                                      if self.coordinate_provenance else None),
        }

    @classmethod
    def from_dict(cls, d: dict[str, Any]) -> Geometry:
        return cls(
            kind=GeometryKind(d["kind"]),
            coordinates=tuple((float(c[0]), float(c[1])) for c in d.get("coordinates", [])),
            provinces=tuple(d.get("provinces", ())),
            location_verbatim=d.get("location_verbatim", ""),
            approximate=d.get("approximate", True),
            coordinate_provenance=(Provenance(d["coordinate_provenance"])
                                   if d.get("coordinate_provenance") else None),
        )
