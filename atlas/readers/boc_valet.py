"""
atlas.readers.boc_valet — the Bank of Canada's Valet API, for one rate a year.

    https://www.bankofcanada.ca/valet/observations/FXAUSDCAD/json

WHY A CANADIAN CENTRAL BANK IS IN A TURKISH ATLAS

TÜİK publishes provincial GDP per capita in lira and in US dollars, and the
owner asked for Canadian dollars as well. Nobody publishes Turkish provincial
GDP in Canadian dollars, so the third currency can only be arithmetic: TÜİK's
own dollar figure times a published USD/CAD rate. That makes the rate a SOURCE,
with a card and a licence, rather than a constant in a script — which is the
difference between a derived figure with a formula and an invented one
(CLAUDE.md §1).

WHICH SERIES, AND WHY THE ANNUAL ONE

`FXAUSDCAD` is the Bank's own **annual average** of the daily rate. Averaging
the daily series here would be this project computing something a publisher
already publishes, and doing it slightly differently. The Bank's annual series
begins in 2017, after its 2017 change of rate methodology, so a year before
that has no rate from this source and therefore no Canadian figure — which is
published as absent, not filled in from somewhere else (CLAUDE.md §10).

WHAT COMES BACK

`observations`, one per year, each `{"d": "2017-01-01", "FXAUSDCAD": {"v": "1.3"}}`.
The value is a STRING, and is parsed rather than trusted as a float by the JSON
reader — a rate that arrives as "" or as "NA" must be refused, not read as zero.

WHAT IT REFUSES

An answer with no observations, an observation the series is missing from, a
value that is not a positive number, and a date that is not the first of a
year — because this is the annual series, and a monthly value appearing in it
would silently become a year's rate.
"""

from __future__ import annotations

import logging
from dataclasses import dataclass
from typing import Any

log = logging.getLogger(__name__)

ENDPOINT = "https://www.bankofcanada.ca/valet/observations"


class ValetError(ValueError):
    """The API answered with something this reader was not written for."""


@dataclass(frozen=True, slots=True)
class Series:
    """One Valet series: what the Bank calls it, and its value per year."""

    name: str
    label: str
    description: str
    #: year -> rate, as published.
    by_year: dict[str, float]

    @property
    def years(self) -> list[str]:
        return sorted(self.by_year)


def url(series: str, *, start: str) -> str:
    """The observations URL for one series from one date on."""
    return f"{ENDPOINT}/{series}/json?start_date={start}"


def read(answer: Any, series: str) -> Series:
    """One series' yearly values, checked for shape."""
    if not isinstance(answer, dict) or "observations" not in answer:
        raise ValetError(f"the API returned no `observations`: {str(answer)[:200]}")
    rows = answer["observations"]
    if not rows:
        raise ValetError(
            f"{series}: the API returned an empty `observations` list. "
            f"An empty answer is never read as 'there is no rate'"
        )

    detail = (answer.get("seriesDetail") or {}).get(series)
    if not detail:
        raise ValetError(
            f"{series}: the answer describes {sorted((answer.get('seriesDetail') or {}))} "
            f"and not this series"
        )

    by_year: dict[str, float] = {}
    for row in rows:
        when = str(row.get("d", ""))
        if not when.endswith("-01-01") or len(when) != 10:
            raise ValetError(
                f"{series}: observation dated {when!r}; this is the ANNUAL series and every "
                f"observation in it must be the first of a year"
            )
        held = row.get(series)
        raw = (held or {}).get("v", "")
        try:
            value = float(raw)
        except (TypeError, ValueError):
            raise ValetError(f"{series}: {when} carries {raw!r}, which is not a rate") from None
        if value <= 0:
            raise ValetError(f"{series}: {when} carries {value}, and an exchange rate is positive")
        by_year[when[:4]] = value

    log.info("boc valet: %s, %d years %s..%s",
             series, len(by_year), min(by_year), max(by_year))
    return Series(
        name=series,
        label=str(detail.get("label", "")),
        description=str(detail.get("description", "")),
        by_year=by_year,
    )
