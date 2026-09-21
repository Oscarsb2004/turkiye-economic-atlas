"""
The GTFS reader, and the two ways İstanbul's feed departs from the spec.

Both would otherwise be silent: one crashes on a Turkish letter, the other
turns a whole record into a single field that reads as one route with a very
long id.
"""

from __future__ import annotations

import pytest

from atlas.readers import gtfs

HEADER = "route_id,agency_id,route_short_name,route_long_name,route_desc,route_type\n"


def _file(*lines: str) -> bytes:
    """A GTFS CSV encoded the way this feed encodes them: Windows-1254."""
    return (HEADER + "".join(lines)).encode(gtfs.ENCODING)


def test_the_feed_is_windows_1254_and_not_utf_8():
    """
    GTFS requires UTF-8 and this feed is the Turkish code page. BEŞİKTAŞ is the
    proof: the same bytes are not valid UTF-8 at all.
    """
    body = _file("1,6,BSK,BEŞİKTAŞ - KABATAŞ,,4\n")
    with pytest.raises(UnicodeDecodeError):
        body.decode("utf-8")

    table = gtfs.table(body, name="routes", needs=("route_id", "route_type"))
    assert table.rows[0]["route_long_name"] == "BEŞİKTAŞ - KABATAŞ"
    assert table.repaired == 0


def test_a_record_wrapped_in_quotes_as_a_whole_is_re_parsed():
    """
    One line of routes.csv and one of stops.csv are quoted end to end, so a CSV
    reader sees one field where the header has six. Dropping it would lose a
    route; keeping it as read would file the whole line under route_id.
    """
    inner = '7431,37,"PENDİK İMAM HATİP-YAKACIK,ADNAN KAHVECİ",KARTAL - TOPSELVİ,,9'
    wrapped = '"' + inner.replace('"', '""') + '"\n'
    table = gtfs.table(_file(wrapped), name="routes", needs=("route_id",))

    assert table.repaired == 1
    row = table.rows[0]
    assert row["route_id"] == "7431"
    assert row["route_type"] == "9"
    assert row["route_short_name"] == "PENDİK İMAM HATİP-YAKACIK,ADNAN KAHVECİ"


def test_a_row_that_is_still_the_wrong_shape_is_refused():
    """After the one repair, a row that does not match the header is a broken file."""
    with pytest.raises(gtfs.GtfsError, match="line 2 has 3 fields, not 6"):
        gtfs.table(_file("1,6,BSK\n"), name="routes")


def test_a_missing_column_is_refused_before_anything_is_read():
    """A column that is not there reads as an absent value in every row."""
    with pytest.raises(gtfs.GtfsError, match=r"no column\(s\) \['shape_id'\]"):
        gtfs.table(_file("1,6,BSK,X,,4\n"), name="routes", needs=("route_id", "shape_id"))


def test_an_empty_file_is_refused():
    with pytest.raises(gtfs.GtfsError, match="the file is empty"):
        gtfs.table(b"", name="routes")


def test_blank_lines_are_not_rows():
    table = gtfs.table(_file("1,6,BSK,X,,4\n", "\n"), name="routes")
    assert len(table) == 1
