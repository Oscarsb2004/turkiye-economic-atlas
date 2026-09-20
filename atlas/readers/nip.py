"""
atlas.readers.nip — the province-to-province migration matrix, from TÜİK's
Nüfus İstatistikleri Portalı.

    https://nip.tuik.gov.tr/?value=IllerArasiGoc

WHAT IT PUBLISHES

One row per ORDERED PAIR of provinces per year: 81 × 80 = 6 480 pairs a year,
2008 to the newest, 116 640 rows in all. A row says how many people moved
between those two provinces that year, in both directions, with the population
TÜİK published for each of them that year beside it.

    Yil  AlanIlKodu AlanIlAdi  VerenIlKodu VerenIlAdi  AlanIlNufus VerenIlNufus
    AldigiGoc      people who moved FROM Veren TO Alan
    VerdigiGoc     people who moved FROM Alan TO Veren
    NetGoc         AldigiGoc − VerdigiGoc, as the portal publishes it

EVERY FLOW IS PUBLISHED TWICE, WHICH IS THE CHECK

The matrix carries both (A, B) and (B, A), so the number of people who moved
A→B appears as B's `AldigiGoc` in one row and as A's `VerdigiGoc` in another.
This reader reads both statements and refuses if they disagree — the publisher
checking itself, which is worth more than any rule of ours. The populations are
repeated the same way, and are checked the same way.

HOW TO ASK IT FOR ONE YEAR

The endpoint is a DataTables back end: POST only (a GET answers 405), and its
filters are the two province dropdowns, `alanIlAdi` and `verenIlAdi`. THERE IS
NO YEAR FILTER. What there is, is DataTables' global search, which matches a
year against the `Yil` column — and against any other column that happens to
contain those four digits, so asking for 2020 returns 6 650 rows rather than
6 480. The extra rows are a population or a count with "2020" inside it.

So the year is filtered here, from the rows, and the count is checked: exactly
6 480 pairs, each province against each other province once. A superset is
safe; a subset would be a quiet hole in the map, and is refused.

Asking for everything at once is possible and not worth it: 116 640 rows is
about 40 MB and several minutes of a public service's time, ordered in a way
the portal does not document.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass

from atlas.core import registry as R

log = logging.getLogger(__name__)

BASE = "https://nip.tuik.gov.tr"
TABLE_URL = f"{BASE}/Home/IlYilIcGocIllerArasiForTable?"

#: The columns the portal's own page sends, in its order. The server binds them
#: by position, so the list is reproduced rather than cut down to what is read.
COLUMNS = (
    ("Yil", "YIL"),
    ("AlanIlAdi", "ALAN_IL_ADI"),
    ("VerenIlAdi", "VEREN_IL_ADI"),
    ("AlanIlNufus", "ALAN_IL_NUFUS"),
    ("VerenIlNufus", "VEREN_IL_NUFUS"),
    ("AldigiGoc", "ALDIGI_GOC"),
    ("VerdigiGoc", "VERDIGI_GOC"),
    ("NetGoc", "NET_GOC"),
)

#: 81 provinces, each against every other one. A province is never paired with
#: itself: moving within a province is not migration between provinces.
PAIRS = 81 * 80

#: Room for the rows the global search matches beyond the year itself — 170 of
#: 6 650 in the worst year seen. Large enough that a truncated answer means
#: something changed, rather than that this number was too small.
PAGE = 20_000


class NipError(ValueError):
    """The portal answered with something this reader was not written for."""


@dataclass(frozen=True, slots=True)
class Migration:
    """One year of the matrix, as published."""

    year: str
    #: origin plaka -> destination plaka -> people who moved, as published.
    out: dict[int, dict[int, int]]
    #: plaka -> the population TÜİK published for that province that year.
    population: dict[int, int]
    #: plaka -> the province name the portal writes, in its own upper case.
    names: dict[int, str]


def _form(year: int) -> dict[str, str]:
    """The DataTables form the portal's own page sends, searched for one year."""
    fields: dict[str, str] = {"draw": "1"}
    for index, (data, name) in enumerate(COLUMNS):
        fields[f"columns[{index}][data]"] = data
        fields[f"columns[{index}][name]"] = name
        fields[f"columns[{index}][searchable]"] = "true"
        fields[f"columns[{index}][orderable]"] = "true"
        fields[f"columns[{index}][search][value]"] = ""
        fields[f"columns[{index}][search][regex]"] = "false"
    fields["start"] = "0"
    fields["length"] = str(PAGE)
    # The only year filter there is; the rows it over-matches are dropped below.
    fields["search[value]"] = str(year)
    fields["search[regex]"] = "false"
    fields["alanIlAdi"] = "Hepsi"
    fields["verenIlAdi"] = "Hepsi"
    return fields


def interprovincial(fetch, year: int) -> Migration:
    """Every province-to-province flow in one year, as TÜİK publishes them."""
    answer = fetch.post_form(TABLE_URL, _form(year))
    rows = answer.get("data")
    if not isinstance(rows, list):
        raise NipError(f"{year}: the portal returned no `data` array: {str(answer)[:200]}")
    matched = int(answer.get("recordsFiltered") or 0)
    if matched > len(rows):
        raise NipError(
            f"{year}: the portal matched {matched} rows but returned {len(rows)}; "
            f"raise PAGE above {PAGE} — a truncated answer would publish a hole in the matrix"
        )

    known = R.provinces()
    out: dict[int, dict[int, int]] = {plaka: {} for plaka in known}
    population: dict[int, int] = {}
    names: dict[int, str] = {}
    seen: set[tuple[int, int]] = set()

    for row in rows:
        if int(row.get("Yil") or 0) != year:
            # The global search matched a population or a count, not the year.
            continue
        alan, veren = int(row["AlanIlKodu"]), int(row["VerenIlKodu"])
        for plaka in (alan, veren):
            if plaka not in known:
                raise NipError(f"{year}: province code {plaka} is not one of the 81")
        if alan == veren:
            raise NipError(f"{year}: a row pairs province {alan} with itself")
        if (alan, veren) in seen:
            raise NipError(f"{year}: the pair ({alan}, {veren}) is published twice")
        seen.add((alan, veren))

        received = int(row["AldigiGoc"])          # veren -> alan
        given = int(row["VerdigiGoc"])            # alan -> veren
        net = int(row["NetGoc"])
        if net != received - given:
            raise NipError(
                f"{year}: pair ({alan}, {veren}) publishes net {net}, but its own "
                f"received {received} minus given {given} is {received - given}"
            )

        _state(out[veren], alan, received, year, "flow")
        _state(out[alan], veren, given, year, "flow")
        _state(population, alan, int(row["AlanIlNufus"]), year, "population")
        _state(population, veren, int(row["VerenIlNufus"]), year, "population")
        names.setdefault(alan, str(row.get("AlanIlAdi", "")).strip())
        names.setdefault(veren, str(row.get("VerenIlAdi", "")).strip())

    if len(seen) != PAIRS:
        raise NipError(
            f"{year}: {len(seen)} province pairs, not {PAIRS}. Every province is published "
            f"against every other one, so a different number means the matrix is incomplete"
        )
    missing = sorted(set(known) - set(population))
    if missing:
        raise NipError(f"{year}: no rows for province(s) {missing}")

    log.info("%s: %d pairs, %d provinces", year, len(seen), len(population))
    return Migration(year=str(year), out=out, population=population, names=names)


def _state(into: dict[int, int], key: int, value: int, year: int, what: str) -> None:
    """
    Record a figure the portal states twice, and refuse a contradiction.

    Every flow and every population appears in two rows — (A, B) and (B, A) —
    so the second statement is the publisher checking its own first one. A
    disagreement means a pair was read the wrong way round, and keeping either
    number would put a plausible wrong figure on the map.
    """
    if key in into and into[key] != value:
        raise NipError(
            f"{year}: the portal states the {what} for {key} as both {into[key]} and {value}"
        )
    into[key] = value
