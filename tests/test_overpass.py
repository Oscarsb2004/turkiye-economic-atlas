"""
The Overpass reader, and what it refuses.

Overpass answers 200 with an empty element list for a query that matched
nothing — including a query whose area filter silently failed — so the most
dangerous answer it gives is a polite one.
"""

from __future__ import annotations

import pytest

from atlas.readers import overpass


class _Fetch:
    """Answers one POST from a script, and records what was asked."""

    def __init__(self, answer):
        self.answer = answer
        self.asked: list[dict] = []

    def post_form(self, url: str, fields: dict[str, str], *, force: bool = False):
        self.asked.append({"url": url, "force": force, **fields})
        return self.answer


def _answer(elements, *, stamp="2026-09-21T00:46:41Z"):
    return {"version": 0.6, "osm3s": {"timestamp_osm_base": stamp}, "elements": elements}


WAY = {
    "type": "way", "id": 246722935,
    "tags": {"railway": "rail", "usage": "main", "name": "Bağdat Demiryolu"},
    "geometry": [{"lon": 32.1, "lat": 39.1}, {"lon": 32.2, "lat": 39.2}],
}
NODE = {
    "type": "node", "id": 31678662, "lon": 28.97404, "lat": 41.02286,
    "tags": {"railway": "station", "name": "Karaköy"},
}


def test_a_query_is_posted_as_a_form_and_its_answer_read():
    fetch = _Fetch(_answer([WAY]))
    answer = overpass.ask(fetch, overpass.RAIL_QUERY)
    assert fetch.asked[0]["url"] == overpass.ENDPOINT
    assert "railway" in fetch.asked[0]["data"], "the query goes in the form body"
    assert overpass.current_as_of(answer) == "2026-09-21T00:46:41Z"

    ways = overpass.ways(answer)
    assert [w.osm_id for w in ways] == [246722935]
    assert ways[0].points == [(32.1, 39.1), (32.2, 39.2)]
    assert ways[0].tags["name"] == "Bağdat Demiryolu"


def test_refresh_reaches_the_service_rather_than_the_cache():
    """`--refresh` means "I know something just moved", and OSM moves hourly."""
    fetch = _Fetch(_answer([WAY]))
    overpass.ask(fetch, overpass.RAIL_QUERY, force=True)
    assert fetch.asked[0]["force"] is True
    overpass.ask(fetch, overpass.RAIL_QUERY)
    assert fetch.asked[1]["force"] is False


def test_an_empty_answer_is_never_read_as_there_is_none():
    """
    A failed area filter and a country with no railway look identical from
    here, and only one of them is true.
    """
    with pytest.raises(overpass.OverpassError, match="matched nothing"):
        overpass.ask(_Fetch(_answer([])), overpass.RAIL_QUERY)


def test_an_answer_with_no_timestamp_is_refused():
    """It is the only date a map of OSM can carry, so a file without it has none."""
    answer = _answer([WAY])
    answer["osm3s"] = {}
    with pytest.raises(overpass.OverpassError, match="timestamp_osm_base"):
        overpass.ask(_Fetch(answer), overpass.RAIL_QUERY)


def test_a_way_without_geometry_says_which_out_to_use():
    without = {**WAY}
    without.pop("geometry")
    with pytest.raises(overpass.OverpassError, match="out geom"):
        overpass.ways(_answer([without]))


def test_nodes_are_read_at_the_coordinate_published_for_them():
    nodes = overpass.nodes(_answer([NODE]))
    assert nodes[0].point == (28.97404, 41.02286)
    assert nodes[0].tags["name"] == "Karaköy"


def test_a_node_without_a_coordinate_is_refused():
    without = {**NODE}
    without.pop("lon")
    with pytest.raises(overpass.OverpassError, match="without a coordinate"):
        overpass.nodes(_answer([without]))


def test_the_queries_ask_for_what_the_datasets_publish():
    """The filters are the dataset's definition, so they are read here too."""
    assert 'area["ISO3166-1"="TR"]' in overpass.RAIL_QUERY
    assert '"usage"="main"' in overpass.RAIL_QUERY
    assert '"highspeed"="yes"' in overpass.RAIL_QUERY
    assert "out geom tags;" in overpass.RAIL_QUERY
    assert '"railway"="station"' in overpass.STATION_QUERY
    assert '"railway"="halt"' in overpass.STATION_QUERY
