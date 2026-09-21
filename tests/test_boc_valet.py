"""
The Bank of Canada reader, and the one figure the third currency rests on.

Every Canadian dollar figure in this atlas is a US dollar figure TÜİK published
times one number from here. A rate read wrong would not look wrong — it would
produce plausible money — so what this file checks is the shapes that would
produce a WRONG number rather than an error: a value that is not a rate, an
observation that is not a year, and an answer about a different series.
"""

from __future__ import annotations

import pytest

from atlas.readers import boc_valet

ANSWER = {
    "terms": {"url": "https://www.bankofcanada.ca/terms/"},
    "seriesDetail": {
        "FXAUSDCAD": {
            "label": "USD/CAD",
            "description": "Annual average exchange rate: annual value of the US dollar "
                           "expressed in Canadian dollars, for 1 unit of US dollar",
        },
    },
    "observations": [
        {"d": "2023-01-01", "FXAUSDCAD": {"v": "1.3497"}},
        {"d": "2024-01-01", "FXAUSDCAD": {"v": "1.3698"}},
    ],
}


def test_the_series_reads_as_one_rate_a_year():
    series = boc_valet.read(ANSWER, "FXAUSDCAD")
    assert series.label == "USD/CAD"
    assert series.years == ["2023", "2024"]
    assert series.by_year["2024"] == 1.3698


def test_the_value_is_a_string_and_is_parsed_rather_than_trusted():
    """The API sends "1.3698", not 1.3698, and a blank one must not read as 0."""
    answer = {**ANSWER, "observations": [{"d": "2024-01-01", "FXAUSDCAD": {"v": ""}}]}
    with pytest.raises(boc_valet.ValetError, match="not a rate"):
        boc_valet.read(answer, "FXAUSDCAD")


def test_a_rate_of_zero_is_refused():
    """Zero would turn every Canadian figure in the atlas into nothing, quietly."""
    answer = {**ANSWER, "observations": [{"d": "2024-01-01", "FXAUSDCAD": {"v": "0"}}]}
    with pytest.raises(boc_valet.ValetError, match="exchange rate is positive"):
        boc_valet.read(answer, "FXAUSDCAD")


def test_a_monthly_observation_in_the_annual_series_is_refused():
    """
    FXMUSDCAD is a real series with almost the same name, and its observations
    are monthly. Read as annual, December would silently become the year.
    """
    answer = {**ANSWER, "observations": [{"d": "2024-07-01", "FXAUSDCAD": {"v": "1.37"}}]}
    with pytest.raises(boc_valet.ValetError, match="ANNUAL series"):
        boc_valet.read(answer, "FXAUSDCAD")


def test_an_answer_about_another_series_says_which_one_it_is_about():
    with pytest.raises(boc_valet.ValetError, match=r"describes \['FXAUSDCAD'\]"):
        boc_valet.read(ANSWER, "FXMUSDCAD")


def test_an_empty_answer_is_never_read_as_there_being_no_rate():
    with pytest.raises(boc_valet.ValetError, match="empty"):
        boc_valet.read({**ANSWER, "observations": []}, "FXAUSDCAD")


def test_an_answer_with_no_observations_at_all_is_refused():
    with pytest.raises(boc_valet.ValetError, match="no `observations`"):
        boc_valet.read({"seriesDetail": {}}, "FXAUSDCAD")


def test_the_url_names_the_series_and_the_start():
    assert boc_valet.url("FXAUSDCAD", start="2000-01-01").endswith(
        "/FXAUSDCAD/json?start_date=2000-01-01"
    )
