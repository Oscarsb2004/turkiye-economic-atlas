"""
atlas.readers.tuik — TÜİK's workbooks, read as published.

WHAT THIS PARSES

The provincial GDP bulletin ships a legacy .xls (not .xlsx — openpyxl cannot
read it, which is why xlrd is pinned). One sheet, laid out for a reader rather
than a program:

    row 2   two spanning headers: "Kişi başına GSYH (TL)" and "... ($)"
    row 3   the years under each, as floats: 2020.0, 2021.0, ...
    row 4   TR — the country total
    rows 5+ one province each, keyed on the İBBS code (TR100, TR211, ...)
    last 2  the attribution lines, in both languages

So the years are read FROM THE SHEET rather than assumed: TÜİK adds a year
every December and drops the oldest, and a hardcoded range would silently stop
reading the newest figure the day it appears.

WHAT IT REFUSES

A row whose İBBS code is not one registry/provinces.yaml knows, a sheet with no
year header, and a province whose published name matches neither the name in
the registry nor the TÜİK spelling recorded beside it. That last one is the
guard against a rename going unnoticed: TÜİK writes Elazığ where the map writes
Elâzığ, and if either changes, the join should fail loudly rather than drop a
province from every overlay built on it.
"""

from __future__ import annotations

from dataclasses import dataclass

import xlrd

from atlas.core import registry as R


class TuikError(ValueError):
    """A TÜİK workbook is not shaped the way this reader was written for."""


@dataclass(frozen=True, slots=True)
class PerCapita:
    """One province's published per-capita GDP, by year, in one currency."""

    plaka: int
    nuts3: str
    currency: str       # "TRY" or "USD", as the sheet's own header says
    values: dict[str, float]


#: The two spanning headers, and the currency each one's block carries. Matched
#: on the currency marker in TÜİK's own wording rather than on column position,
#: because the blank spacer column between them has moved before.
CURRENCY_MARKERS = (("(TL)", "TRY"), ("($)", "USD"))


def _year_columns(sheet: "xlrd.sheet.Sheet") -> dict[str, list[tuple[int, str]]]:
    """Currency -> [(column, year)], read from the sheet's own two header rows."""
    blocks: dict[str, list[tuple[int, str]]] = {}
    current: str | None = None
    for col in range(sheet.ncols):
        header = str(sheet.cell_value(2, col)).strip()
        for marker, currency in CURRENCY_MARKERS:
            if marker in header:
                current = currency
                blocks.setdefault(current, [])
        year = str(sheet.cell_value(3, col)).strip()
        if current and year:
            # The years arrive as floats ("2020.0"), because the whole sheet is
            # numeric to Excel. Published as the year it is.
            blocks[current].append((col, str(int(float(year)))))
    if not blocks:
        raise TuikError("no currency headers found in row 3 of the sheet")
    return blocks


def per_capita_gdp(body: bytes) -> tuple[list[PerCapita], dict[str, list[str]]]:
    """Every province's per-capita GDP in the workbook, and the years it covers."""
    sheet = xlrd.open_workbook(file_contents=body).sheet_by_index(0)
    blocks = _year_columns(sheet)
    known = R.province_by_nuts3()

    rows: list[PerCapita] = []
    seen: set[str] = set()
    for r in range(4, sheet.nrows):
        code = str(sheet.cell_value(r, 0)).strip()
        name = str(sheet.cell_value(r, 1)).strip()
        if not code or code == "TR":
            continue            # the country total: published, but not a province
        if code not in known:
            if name:            # a data row we do not recognise, not a footer
                raise TuikError(f"row {r + 1}: İBBS code {code!r} ({name}) is not in registry/provinces.yaml")
            continue
        province = known[code]
        expected = {province["name_tr"], province.get("name_tuik", province["name_tr"])}
        if name not in expected:
            raise TuikError(
                f"row {r + 1}: TÜİK calls {code} {name!r}, but registry/provinces.yaml "
                f"has {sorted(expected)} — check the province was not renamed"
            )
        seen.add(code)
        for currency, columns in blocks.items():
            values = {}
            for col, year in columns:
                cell = sheet.cell_value(r, col)
                if isinstance(cell, (int, float)) and cell != "":
                    values[year] = float(cell)
            rows.append(PerCapita(plaka=province["plaka"], nuts3=code, currency=currency, values=values))

    missing = sorted(set(known) - seen)
    if missing:
        raise TuikError(f"the workbook carries no row for {len(missing)} province(s): {missing}")
    return rows, {currency: [year for _, year in cols] for currency, cols in blocks.items()}
