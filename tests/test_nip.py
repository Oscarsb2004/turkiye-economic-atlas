"""
The migration reader, and what it refuses.

TÜİK publishes every flow twice — once from each end of it — which makes the
portal its own check. These tests are mostly about what happens when the two
statements disagree, because a matrix read the wrong way round produces a map
that looks entirely plausible and is exactly backwards.
"""

from __future__ import annotations

import pytest

from atlas.core import registry as R
from atlas.readers import nip


class _Fetch:
    """Answers the one POST from a script, and records what was asked."""

    def __init__(self, answer):
        self.answer = answer
        self.asked: list[dict] = []

    def post_form(self, url: str, fields: dict[str, str]):
        self.asked.append(fields)
        return self.answer


def _row(alan, veren, received, given, *, year=2025, pop=1_000, net=None):
    """One published pair: `received` moved veren→alan, `given` moved alan→veren."""
    return {
        "Yil": year,
        "AlanIlKodu": alan, "AlanIlAdi": f"IL{alan}",
        "VerenIlKodu": veren, "VerenIlAdi": f"IL{veren}",
        "AlanIlNufus": pop * alan, "VerenIlNufus": pop * veren,
        "AldigiGoc": received, "VerdigiGoc": given,
        "NetGoc": received - given if net is None else net,
    }


def _matrix(edits: dict | None = None):
    """
    The whole 81 × 80 matrix, mirrored the way the portal publishes it.

    Each unordered pair gives two rows, and `edits` can replace one figure in
    one of them — which is how a disagreement is staged.
    """
    plakas = sorted(R.provinces())
    rows = []
    for alan in plakas:
        for veren in plakas:
            if alan == veren:
                continue
            # A flow of (origin × 10 + destination mod 7), so no two are equal
            # by accident and a swapped pair is visible.
            forward = veren * 10 + (alan % 7)      # veren -> alan
            backward = alan * 10 + (veren % 7)     # alan -> veren
            row = _row(alan, veren, forward, backward)
            row.update((edits or {}).get((alan, veren), {}))
            rows.append(row)
    return {"recordsTotal": len(rows), "recordsFiltered": len(rows), "data": rows}


def test_one_year_is_read_and_counted():
    fetch = _Fetch(_matrix())
    matrix = nip.interprovincial(fetch, 2025)

    assert len(matrix.out) == 81
    assert sum(len(destinations) for destinations in matrix.out.values()) == nip.PAIRS
    # 1 -> 2 is published in two rows; both say the same thing.
    assert matrix.out[1][2] == 1 * 10 + (2 % 7)
    assert matrix.population[34] == 34_000
    # The year goes in the form's global search, because there is no year filter.
    assert fetch.asked[0]["search[value]"] == "2025"
    assert fetch.asked[0]["alanIlAdi"] == "Hepsi"


def test_rows_from_other_years_are_dropped():
    """
    The global search matches the year against every column, so a population
    with 2025 inside it arrives too. Those rows are not this year's.
    """
    answer = _matrix()
    answer["data"].append(_row(1, 2, 999, 999, year=2024))
    answer["recordsFiltered"] = len(answer["data"])
    matrix = nip.interprovincial(_Fetch(answer), 2025)
    assert matrix.out[2][1] == 2 * 10 + (1 % 7)


def test_a_flow_stated_two_different_ways_is_refused():
    """
    The heart of it: (A, B) says one thing about A→B and (B, A) says another.
    Keeping either would put a plausible wrong figure on the map.
    """
    fetch = _Fetch(_matrix({(2, 1): {"AldigiGoc": 7, "NetGoc": 7 - (2 * 10 + (1 % 7))}}))
    with pytest.raises(nip.NipError, match="states the flow"):
        nip.interprovincial(fetch, 2025)


def test_a_population_stated_two_different_ways_is_refused():
    fetch = _Fetch(_matrix({(2, 1): {"AlanIlNufus": 12}}))
    with pytest.raises(nip.NipError, match="states the population"):
        nip.interprovincial(fetch, 2025)


def test_a_published_net_that_does_not_match_its_own_parts_is_refused():
    fetch = _Fetch(_matrix({(3, 4): {"NetGoc": 1}}))
    with pytest.raises(nip.NipError, match="publishes net"):
        nip.interprovincial(fetch, 2025)


def test_an_incomplete_matrix_is_refused():
    """A missing pair is a hole in the map that nothing else would notice."""
    answer = _matrix()
    answer["data"].pop()
    answer["recordsFiltered"] = len(answer["data"])
    with pytest.raises(nip.NipError, match=f"not {nip.PAIRS}"):
        nip.interprovincial(_Fetch(answer), 2025)


def test_a_truncated_answer_is_refused():
    """The portal says how many rows matched; fewer means the page cut them off."""
    answer = _matrix()
    answer["recordsFiltered"] = answer["recordsFiltered"] + 1
    with pytest.raises(nip.NipError, match="raise PAGE"):
        nip.interprovincial(_Fetch(answer), 2025)


def test_a_province_paired_with_itself_is_refused():
    answer = _matrix()
    answer["data"].append(_row(5, 5, 1, 1))
    answer["recordsFiltered"] = len(answer["data"])
    with pytest.raises(nip.NipError, match="with itself"):
        nip.interprovincial(_Fetch(answer), 2025)


def test_an_unknown_province_is_refused():
    answer = _matrix()
    answer["data"].append(_row(82, 1, 1, 1))
    answer["recordsFiltered"] = len(answer["data"])
    with pytest.raises(nip.NipError, match="not one of the 81"):
        nip.interprovincial(_Fetch(answer), 2025)
