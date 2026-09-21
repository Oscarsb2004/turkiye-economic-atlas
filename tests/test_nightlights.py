"""
The two rules that choose which nights the atlas offers.

A monthly series asks the layer things a yearly one never did, and both of the
things it asks are here: what "the end of this month" is, and how to step back
through the nights a service actually holds when the last one is empty.
"""

from __future__ import annotations

from atlas.datasets import nightlights

#: Two published intervals with a gap between them, as GIBS writes them.
PERIODS = [
    "2012-01-19/2012-02-17/P1D",
    "2024-01-01/2024-01-31/P1D",
    "2026-08-06/2026-09-20/P1D",
]


def test_the_end_of_a_month_is_the_end_of_that_month():
    assert nightlights._month_end(2024, 1) == "2024-01-31"
    assert nightlights._month_end(2024, 4) == "2024-04-30"
    assert nightlights._month_end(2023, 12) == "2023-12-31"


def test_february_moves_and_the_century_rule_applies():
    assert nightlights._month_end(2023, 2) == "2023-02-28"
    assert nightlights._month_end(2024, 2) == "2024-02-29", "a leap year"
    assert nightlights._month_end(1900, 2) == "1900-02-28", "divisible by 100 and not by 400"
    assert nightlights._month_end(2000, 2) == "2000-02-29", "divisible by 400"


def test_stepping_back_walks_published_nights_and_not_calendar_days():
    """
    The night before 2026-08-06 is not 2026-08-05: the layer does not hold it.
    Walking back a published night at a time is what lets this function skip a
    two-year gap without knowing the gap is there.
    """
    walked = nightlights.nights_back(PERIODS, "2026-09-20", 3)
    assert walked[:2] == ["2026-09-20", "2026-09-19"]

    over_a_gap = nightlights.nights_back(PERIODS, "2026-08-06", 2)
    assert over_a_gap == ["2026-08-06", "2024-01-31"]


def test_stepping_back_stops_when_the_service_has_nothing_earlier():
    assert nightlights.nights_back(PERIODS, "2012-01-19", 5) == ["2012-01-19"]
    assert nightlights.nights_back(PERIODS, "2011-12-31", 5) == []


def test_a_month_the_layer_does_not_reach_has_no_night_in_it():
    """
    The caller asks for the last night not after the end of a month and then
    checks it is IN that month — which is what makes a month with no imagery a
    month that is left off the slider rather than one labelled with an older
    night's picture.
    """
    end = nightlights._month_end(2025, 3)
    assert nightlights.nights_back(PERIODS, end, 1) == ["2024-01-31"]
    assert not ["2024-01-31"][0].startswith("2025-03")
