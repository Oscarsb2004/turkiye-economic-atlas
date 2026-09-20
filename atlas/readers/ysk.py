"""
atlas.readers.ysk — election results from the Supreme Election Council's portal.

    https://acikveri.ysk.gov.tr/

WHAT IT PUBLISHES

An unauthenticated JSON API behind a JavaScript portal. Four calls matter:

    getSecimDetayList                    every election, by type: id, date, name
    getIlList                            the 81 il, keyed on il_ID = the plaka code
    getSandikSecimSonucBaslikList        which vote column is which party or candidate
    getSecimSandikSonucList              the results themselves, 138 fields a row

RESULTS ARE ALREADY AGGREGATED BY PROVINCE

Asking for `ilId=0` returns one row per province — YSK's own province figures,
not district rows for us to add up. That matters: this project reproduces what
a publisher published (CLAUDE.md §1), and summing districts ourselves would
make every province figure ours. It also returns an 82nd row, "İLLER TOPLAMI",
YSK's own national total, which registry/checks.yaml uses to check the 81
against the publisher's own sum rather than against arithmetic of our own.

THINGS THAT COST TIME HERE, WRITTEN DOWN

  - `getSecimList` answers HTTP 200 with the right number of rows and every
    field null. It is a dead stub. Use `getSecimDetayList`.
  - Results need `sandikTuru=0&sorguTuru=1`. With `sandikTuru=1` the API
    answers `[]` for every `sorguTuru`, cheerfully and with status 200.
  - The candidate columns are named `bagimsizN_ALDIGI_OY` and the party columns
    `partiN_ALDIGI_OY`, where N is a position in the ballot, not an identity.
    The same party is a different N in a different election, so a column is
    only meaningful through the başlık (header) call.
"""

from __future__ import annotations

from dataclasses import dataclass
from typing import Any

from atlas.core import registry as R

BASE = "https://acikveri.ysk.gov.tr/api"

#: The combination that returns province rows. Anything else returns [] or
#: ballot-box detail; see the module docstring.
RESULT_QUERY = {
    "ilceId": 0, "beldeId": 0, "birimId": 0, "muhtarlikId": 0, "cezaeviId": 0,
    "sandikTuru": 0, "sandikNoIlk": 0, "sandikNoSon": 0, "ulkeId": 0,
    "disTemsilcilikId": 0, "gumrukId": 0, "yurtIciDisi": 1,
    "sandikRumuzIlk": 0, "sandikRumuzSon": 0, "secimCevresiId": 0,
    "sandikId": 0, "sorguTuru": 1,
}

#: YSK's own name for the row that totals the provinces.
NATIONAL_ROW = "İLLER TOPLAMI"

#: The turnout fields YSK publishes beside the votes, and what this project
#: calls them. Reproduced as published; nothing here is recomputed.
TURNOUT = {
    "secmen_SAYISI": "registered",
    "oy_KULLANAN_SECMEN_SAYISI": "voted",
    "gecerli_OY_TOPLAMI": "valid",
    "gecersiz_OY_TOPLAMI": "invalid",
}


class YskError(ValueError):
    """The portal answered with something this reader was not written for."""


@dataclass(frozen=True, slots=True)
class Option:
    """One thing that could be voted for, and the column its votes arrive in."""

    order: int
    name: str
    column: str


@dataclass(frozen=True, slots=True)
class ProvinceResult:
    """
    One province's result.

    For a presidential election or a referendum YSK publishes one row per
    province, and `votes` is that row: published, not computed.

    For a parliamentary election four provinces are split into electoral
    districts — Ankara and İstanbul into three, Bursa and İzmir into two — and
    YSK publishes a row for each ("ANKARA-1"). A province figure is then the sum
    of its districts, which is arithmetic of ours over published inputs. `summed`
    says which it is, `parts` keeps the districts as published, and the builder
    marks the province figure DERIVED so the map never implies YSK printed a
    number it did not.
    """

    plaka: int
    name: str
    votes: dict[str, int]       # option name -> votes
    turnout: dict[str, int]
    parts: tuple[dict[str, Any], ...] = ()
    summed: bool = False


def _get(fetch, path: str, params: dict[str, Any]) -> Any:
    query = "&".join(f"{key}={value}" for key, value in params.items())
    return fetch.json(f"{BASE}/{path}?{query}")


def elections(fetch) -> list[dict[str, Any]]:
    """Every election the portal carries, flattened across its type groups."""
    groups = _get(fetch, "getSecimDetayList", {})
    found = []
    for group in groups:
        for election in group.get("secimList", []):
            found.append({
                "secim_id": election["secim_ID"],
                "secim_turu": group["secim_TURU_KODU"],
                "type_name": group["secim_TURU_ADI"],
                "name": election["secim_ADI"],
                "date": str(election["secim_TARIHI"])[:10],
            })
    if not found:
        raise YskError("getSecimDetayList returned no elections")
    return found


def options(fetch, secim_id: int, secim_turu: int) -> list[Option]:
    """
    Which column is which party or candidate, in ballot order.

    The call returns more than the ballot. For the 2023 presidential election it
    lists fifteen names: the four candidates who stood, each with `sira_NO` 1..4
    and its own numbered column, and eleven people who applied but did not
    appear — every one of them `sira_NO` 0 sharing the unnumbered column
    `bagimsiz_ALDIGI_OY`. Reading them all makes the same person appear twice
    and hangs several names on one column of votes.

    A ballot position is what has votes, so that is what is kept.
    """
    rows = _get(fetch, "getSandikSecimSonucBaslikList",
                {"secimId": secim_id, "secimTuru": secim_turu})
    found = [Option(order=int(row["sira_NO"]), name=row["ad"].strip(), column=row["column_NAME"])
             for row in rows
             if row.get("column_NAME") and int(row.get("sira_NO") or 0) > 0]
    if not found:
        raise YskError(f"election {secim_id}: no numbered ballot positions published")

    columns = [option.column for option in found]
    if len(set(columns)) != len(columns):
        raise YskError(f"election {secim_id}: two ballot positions share a column: {sorted(columns)}")
    names = [option.name for option in found]
    if len(set(names)) != len(names):
        raise YskError(f"election {secim_id}: two ballot positions share a name: {sorted(names)}")
    return sorted(found, key=lambda option: option.order)


def province_results(fetch, secim_id: int, secim_turu: int,
                     options_: list[Option]) -> tuple[list[ProvinceResult], dict[str, Any]]:
    """Every province's published result, and YSK's own total of them."""
    rows = _get(fetch, "getSecimSandikSonucList",
                {"secimId": secim_id, "secimTuru": secim_turu, "ilId": 0, **RESULT_QUERY})
    if not rows:
        raise YskError(
            f"election {secim_id}: no result rows. The portal answers [] rather than an error "
            f"when sandikTuru/sorguTuru are wrong; this reader sends {RESULT_QUERY['sandikTuru']}/"
            f"{RESULT_QUERY['sorguTuru']}"
        )

    known = R.provinces()
    by_plaka: dict[int, list[dict[str, Any]]] = {}
    national: dict[str, Any] | None = None
    for row in rows:
        plaka = row.get("il_ID")
        if plaka is None:
            # The provinces' own total, published beside them.
            if str(row.get("il_ADI", "")).strip() != NATIONAL_ROW:
                raise YskError(f"a row with no il_ID is named {row.get('il_ADI')!r}, not {NATIONAL_ROW!r}")
            national = _figures(row, options_)
            continue
        if plaka not in known:
            raise YskError(f"election {secim_id}: il_ID {plaka} ({row.get('il_ADI')}) is not one of the 81")
        figures = _figures(row, options_)
        figures["name"] = str(row.get("il_ADI", "")).strip()
        by_plaka.setdefault(plaka, []).append(figures)

    results: list[ProvinceResult] = []
    for plaka, parts in sorted(by_plaka.items()):
        if len(parts) == 1:
            results.append(ProvinceResult(
                plaka=plaka, name=parts[0]["name"],
                votes=parts[0]["votes"], turnout=parts[0]["turnout"],
            ))
            continue
        results.append(ProvinceResult(
            plaka=plaka,
            name=known[plaka]["name_tr"],
            votes={option.name: sum(part["votes"][option.name] for part in parts) for option in options_},
            turnout={name: sum(part["turnout"][name] for part in parts) for name in TURNOUT.values()},
            parts=tuple(parts),
            summed=True,
        ))

    missing = sorted(set(known) - {result.plaka for result in results})
    if missing:
        raise YskError(f"election {secim_id}: no row for province(s) {missing}")
    if national is None:
        raise YskError(f"election {secim_id}: the {NATIONAL_ROW!r} row is absent, so nothing checks the parts")
    return results, national


def _figures(row: dict[str, Any], options_: list[Option]) -> dict[str, Any]:
    """The votes and turnout a row carries, as published."""
    return {
        "votes": {option.name: int(row.get(option.column) or 0) for option in options_},
        "turnout": {name: int(row.get(field) or 0) for field, name in TURNOUT.items()},
    }
