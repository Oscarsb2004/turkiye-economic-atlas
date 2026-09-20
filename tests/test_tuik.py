"""
The TÜİK reader, and the four things it refuses.

Each refusal exists because the alternative is silent. A province TÜİK renames,
an İBBS code that is not in the registry, or a row that simply stops being
published would otherwise leave a province with no figure — and a province with
no figure is invisible on the map rather than wrong on it, which is worse.

The workbook is a legacy .xls, so these build a stand-in sheet from the registry
itself rather than committing a binary fixture: the point is the reader's rules,
not xlrd's ability to parse Excel.
"""

from __future__ import annotations

import pytest

from atlas.core import registry as R
from atlas.datasets import province_gdp
from atlas.readers import tuik

YEARS = ("2023", "2024")


class _Sheet:
    """Enough of an xlrd sheet for the reader: TÜİK's two header rows, then data."""

    def __init__(self, rows: list[tuple[str, str]]):
        header = ["İstatistiki Bölge Birimleri Sınıflaması", "", "Kişi başına GSYH (TL)", "", "",
                  "Kişi başına GSYH ($)", ""]
        years = ["", "", YEARS[0], YEARS[1], "", YEARS[0], YEARS[1]]
        self._grid = [
            ["", "", "", "", "", "", ""],
            ["", "", "", "", "", "", ""],
            header,
            years,
            ["TR", "Türkiye", 1.0, 2.0, "", 3.0, 4.0],
        ]
        for code, name in rows:
            self._grid.append([code, name, 100.0, 200.0, "", 10.0, 20.0])
        self.nrows = len(self._grid)
        self.ncols = 7

    def cell_value(self, row: int, col: int):
        return self._grid[row][col]


def _all_provinces() -> list[tuple[str, str]]:
    """Every province as TÜİK publishes it: its İBBS code and the name TÜİK uses."""
    return [
        (row["nuts3"], row.get("name_tuik", row["name_tr"]))
        for row in sorted(R.provinces().values(), key=lambda r: r["plaka"])
    ]


def _read(monkeypatch, rows):
    sheet = _Sheet(rows)
    monkeypatch.setattr(tuik.xlrd, "open_workbook", lambda **kwargs: type("B", (), {"sheet_by_index": lambda self, i: sheet})())
    return tuik.per_capita_gdp(b"not really a workbook")


def test_every_province_in_both_currencies(monkeypatch):
    rows, years = _read(monkeypatch, _all_provinces())
    assert years == {"TRY": list(YEARS), "USD": list(YEARS)}
    assert len(rows) == 81 * 2
    assert {r.plaka for r in rows} == set(range(1, 82))
    istanbul = next(r for r in rows if r.plaka == 34 and r.currency == "TRY")
    assert istanbul.values == {"2023": 100.0, "2024": 200.0}


def test_the_country_total_is_not_a_province(monkeypatch):
    """TÜİK publishes a TR row above the provinces; it is a total, not an 82nd il."""
    rows, _ = _read(monkeypatch, _all_provinces())
    assert all(r.nuts3 != "TR" for r in rows)


def test_an_unknown_ibbs_code_is_refused(monkeypatch):
    rows = _all_provinces()
    rows[5] = ("TR999", "Yeni İl")
    with pytest.raises(tuik.TuikError, match="TR999"):
        _read(monkeypatch, rows)


def test_a_renamed_province_is_refused(monkeypatch):
    """If TÜİK renames a province, the join should fail loudly, not drop it."""
    code, _ = _all_provinces()[0]
    rows = [(code, "Adana Büyükşehir")] + _all_provinces()[1:]
    with pytest.raises(tuik.TuikError, match="renamed"):
        _read(monkeypatch, rows)


def test_a_province_missing_from_the_workbook_is_refused(monkeypatch):
    with pytest.raises(tuik.TuikError, match="no row for 1 province"):
        _read(monkeypatch, _all_provinces()[:-1])


def test_the_two_provinces_tuik_spells_differently_still_match(monkeypatch):
    """TÜİK writes Elazığ and Hakkari where the map writes Elâzığ and Hakkâri."""
    spellings = {row["plaka"]: row for row in R.provinces().values()}
    assert spellings[23]["name_tuik"] == "Elazığ" and spellings[23]["name_tr"] == "Elâzığ"
    assert spellings[30]["name_tuik"] == "Hakkari" and spellings[30]["name_tr"] == "Hakkâri"
    rows, _ = _read(monkeypatch, _all_provinces())
    assert {r.plaka for r in rows} >= {23, 30}


def test_the_download_token_is_percent_encoded():
    """The token is base64; unencoded, its / + and = make the portal answer 404."""
    src = {"bulletin": {"id": 53930, "tables": {"t": {"token": "a/b+c="}}}}
    assert province_gdp.download_url(src, "t").endswith("p=a%2Fb%2Bc%3D")
