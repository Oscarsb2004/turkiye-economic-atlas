"""
atlas.readers.ourairports — airports.csv, for everything DHMİ's tables leave out.

    https://ourairports.com/data/

WHAT IS READ, AND WHY THIS SOURCE

DHMİ publishes traffic against an airport's NAME and no code at all. This file
publishes, against the ICAO code: the IATA code, the coordinates, the published
name, and `iso_region` — which for Türkiye is written TR-<plaka>, the very code
this project already joins everything else on.

So the province an airport sits in is a publisher's statement rather than a
judgement of ours, and the declared checks can then hold the published
coordinate against that province's published boundary.

WHAT IT REFUSES

An ICAO code the crosswalk asks for and the file does not carry, a region that
is not TR-<plaka>, and a coordinate that is not a number. Each of those would
otherwise put an airport at (0, 0) in the Gulf of Guinea, or in no province.
"""

from __future__ import annotations

import csv
import io
from dataclasses import dataclass

COUNTRY = "TR"


class OurAirportsError(ValueError):
    """airports.csv is not shaped the way this reader was written for."""


@dataclass(frozen=True, slots=True)
class Airport:
    """One airport, as OurAirports publishes it."""

    icao: str
    iata: str
    name: str
    kind: str          # large_airport, medium_airport, small_airport
    lon: float
    lat: float
    plaka: int
    municipality: str


def turkish(body: bytes, wanted: set[str]) -> dict[str, Airport]:
    """The airports `wanted`, by ICAO code, read from the Turkish rows."""
    rows = csv.DictReader(io.StringIO(body.decode("utf-8")))
    found: dict[str, Airport] = {}
    for row in rows:
        if row.get("iso_country") != COUNTRY:
            continue
        icao = (row.get("ident") or "").strip()
        if icao not in wanted or icao in found:
            continue
        region = (row.get("iso_region") or "").strip()
        if not (region.startswith(f"{COUNTRY}-") and region[3:].isdigit()):
            raise OurAirportsError(
                f"{icao}: iso_region is {region!r}, not TR-<plaka>; the province cannot be read from it"
            )
        plaka = int(region[3:])
        if not 1 <= plaka <= 81:
            raise OurAirportsError(f"{icao}: iso_region {region!r} is not one of the 81 provinces")
        try:
            lon, lat = float(row["longitude_deg"]), float(row["latitude_deg"])
        except (KeyError, TypeError, ValueError) as exc:
            raise OurAirportsError(f"{icao}: no usable coordinate ({exc})") from exc
        found[icao] = Airport(
            icao=icao, iata=(row.get("iata_code") or "").strip(),
            name=(row.get("name") or "").strip(), kind=(row.get("type") or "").strip(),
            lon=lon, lat=lat, plaka=plaka,
            municipality=(row.get("municipality") or "").strip(),
        )

    missing = sorted(wanted - set(found))
    if missing:
        raise OurAirportsError(
            f"airports.csv carries no Turkish row for {missing} — "
            f"registry/airports.yaml names an ICAO code this source does not have"
        )
    return found
