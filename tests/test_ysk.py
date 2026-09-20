"""
The YSK reader, and what it refuses.

The portal answers 200 for most mistakes — an empty list, a null-filled row, a
header list mixing ballot positions with people who never appeared on one — so
every rule here turns a quiet wrong answer into a loud one.
"""

from __future__ import annotations

import pytest

from atlas.core import registry as R
from atlas.readers import ysk


class _Fetch:
    """Answers the four calls from a script, and records what was asked."""

    def __init__(self, answers: dict[str, object]):
        self.answers = answers
        self.asked: list[str] = []

    def json(self, url: str):
        self.asked.append(url)
        for key, answer in self.answers.items():
            if key in url:
                return answer
        raise AssertionError(f"unexpected call: {url}")


def _headers(rows):
    return [{"sira_NO": order, "ad": name, "column_NAME": column} for order, name, column in rows]


def _province_row(plaka, name, votes, *, registered=1000, voted=900, valid=880, invalid=20):
    row = {"il_ID": plaka, "il_ADI": name, "secmen_SAYISI": registered,
           "oy_KULLANAN_SECMEN_SAYISI": voted, "gecerli_OY_TOPLAMI": valid,
           "gecersiz_OY_TOPLAMI": invalid}
    row.update(votes)
    return row


def _all_provinces(columns, per_province):
    rows = []
    for row in sorted(R.provinces().values(), key=lambda r: r["plaka"]):
        rows.append(_province_row(row["plaka"], row["name_tr"].upper(),
                                  {column: per_province for column in columns}))
    total = _province_row(None, ysk.NATIONAL_ROW,
                          {column: per_province * 81 for column in columns},
                          registered=81_000, voted=72_900, valid=71_280, invalid=1_620)
    return rows + [total]


OPTIONS = [("bagimsiz1_ALDIGI_OY", 1, "A"), ("bagimsiz2_ALDIGI_OY", 2, "B")]


def _reader(header_rows, result_rows):
    return _Fetch({
        "getSandikSecimSonucBaslikList": _headers(header_rows),
        "getSecimSandikSonucList": result_rows,
    })


def test_only_ballot_positions_are_options():
    """
    The header call also lists people who applied and never appeared, all of
    them sira_NO 0 sharing one unnumbered column. Reading those makes the same
    person appear twice and hangs several names on one column of votes.
    """
    fetch = _reader(
        [(1, "RECEP TAYYİP ERDOĞAN", "bagimsiz1_ALDIGI_OY"),
         (2, "MUHARREM İNCE", "bagimsiz2_ALDIGI_OY"),
         (0, "MUHARREM İNCE", "bagimsiz_ALDIGI_OY"),
         (0, "DOĞU PERİNÇEK", "bagimsiz_ALDIGI_OY")],
        [],
    )
    options = ysk.options(fetch, 20230, 9)
    assert [option.name for option in options] == ["RECEP TAYYİP ERDOĞAN", "MUHARREM İNCE"]
    assert [option.column for option in options] == ["bagimsiz1_ALDIGI_OY", "bagimsiz2_ALDIGI_OY"]


def test_no_ballot_positions_is_refused():
    fetch = _reader([(0, "DOĞU PERİNÇEK", "bagimsiz_ALDIGI_OY")], [])
    with pytest.raises(ysk.YskError, match="no numbered ballot positions"):
        ysk.options(fetch, 20230, 9)


def test_every_province_and_the_publishers_own_total():
    columns = [column for column, _, _ in OPTIONS]
    fetch = _reader([(order, name, column) for column, order, name in OPTIONS],
                    _all_provinces(columns, 100))
    options = ysk.options(fetch, 20240, 9)
    results, national = ysk.province_results(fetch, 20240, 9, options)
    assert len(results) == 81
    assert {r.plaka for r in results} == set(range(1, 82))
    assert national["votes"]["A"] == 8100
    assert all(not r.summed for r in results)


def test_an_empty_answer_says_which_query_shape_was_sent():
    """The portal returns [] with status 200 when sandikTuru/sorguTuru are wrong."""
    fetch = _reader([(order, name, column) for column, order, name in OPTIONS], [])
    options = ysk.options(fetch, 20240, 9)
    with pytest.raises(ysk.YskError, match="sandikTuru"):
        ysk.province_results(fetch, 20240, 9, options)


def test_a_missing_province_is_refused():
    columns = [column for column, _, _ in OPTIONS]
    rows = _all_provinces(columns, 100)
    del rows[5]
    fetch = _reader([(order, name, column) for column, order, name in OPTIONS], rows)
    options = ysk.options(fetch, 20240, 9)
    with pytest.raises(ysk.YskError, match="no row for province"):
        ysk.province_results(fetch, 20240, 9, options)


def test_a_province_the_registry_does_not_know_is_refused():
    columns = [column for column, _, _ in OPTIONS]
    rows = _all_provinces(columns, 100)
    rows.insert(0, _province_row(82, "YENİ İL", {column: 5 for column in columns}))
    fetch = _reader([(order, name, column) for column, order, name in OPTIONS], rows)
    options = ysk.options(fetch, 20240, 9)
    with pytest.raises(ysk.YskError, match="not one of the 81"):
        ysk.province_results(fetch, 20240, 9, options)


def test_the_national_row_must_be_there_to_check_against():
    columns = [column for column, _, _ in OPTIONS]
    rows = [row for row in _all_provinces(columns, 100) if row["il_ID"] is not None]
    fetch = _reader([(order, name, column) for column, order, name in OPTIONS], rows)
    options = ysk.options(fetch, 20240, 9)
    with pytest.raises(ysk.YskError, match="nothing checks the parts"):
        ysk.province_results(fetch, 20240, 9, options)


def test_a_split_province_is_summed_and_says_so():
    """
    Four provinces are split into electoral districts in a parliamentary
    election. Their province figure is ours, by addition, and must be marked as
    such — otherwise the map implies YSK printed a number it did not.
    """
    columns = [column for column, _, _ in OPTIONS]
    rows = _all_provinces(columns, 100)
    ankara = next(row for row in rows if row["il_ID"] == 6)
    rows.remove(ankara)
    rows.append(_province_row(6, "ANKARA-1", {column: 40 for column in columns}))
    rows.append(_province_row(6, "ANKARA-2", {column: 60 for column in columns}))
    fetch = _reader([(order, name, column) for column, order, name in OPTIONS], rows)
    options = ysk.options(fetch, 20230, 8)
    results, _ = ysk.province_results(fetch, 20230, 8, options)

    summed = [r for r in results if r.summed]
    assert [r.plaka for r in summed] == [6]
    assert summed[0].votes["A"] == 100
    assert [part["name"] for part in summed[0].parts] == ["ANKARA-1", "ANKARA-2"]
    # The turnout adds up too, not just the votes.
    assert summed[0].turnout["registered"] == 2000
