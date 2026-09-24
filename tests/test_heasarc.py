"""
The HEASARC reader: a BINARY VOTable, decoded by each column's declared type.

The dangerous failure here is not an error — it is a column width guessed
wrong, which shifts every byte after it and reads every later value from the
wrong place. Plausible numbers, all wrong. So what is tested is that each
declared type is read at its own width, that an unknown type is refused rather
than guessed, and that the service's own refusals are not read as data.
"""

from __future__ import annotations

import base64
import math
import struct

import pytest

from atlas.readers import heasarc


def _votable(fields: str, stream: bytes, status: str = "OK") -> bytes:
    body = base64.b64encode(stream).decode("ascii")
    return f"""<?xml version="1.0"?>
<VOTABLE xmlns="http://www.ivoa.net/xml/VOTable/v1.3" version="1.4">
 <RESOURCE type="results">
  <INFO name="QUERY_STATUS" value="{status}">said</INFO>
  <TABLE>
   {fields}
   <DATA><BINARY><STREAM encoding="base64">{body}</STREAM></BINARY></DATA>
  </TABLE>
 </RESOURCE>
</VOTABLE>""".encode("utf-8")


FIELDS = """
   <FIELD datatype="int" name="hip_number"/>
   <FIELD datatype="double" name="parallax" unit="mas"/>
   <FIELD datatype="char" arraysize="*" name="name"/>
   <FIELD datatype="short" name="flag"/>
"""


def _row(hip: int, parallax: float, name: str, flag: int) -> bytes:
    encoded = name.encode("utf-8")
    return (struct.pack(">i", hip) + struct.pack(">d", parallax)
            + struct.pack(">I", len(encoded)) + encoded + struct.pack(">h", flag))


def test_each_column_is_read_at_its_declared_width():
    stream = _row(70890, 768.07, "Proxima", 1) + _row(32349, 379.21, "Sirius", 0)
    fields, rows = heasarc.rows(_votable(FIELDS, stream))
    assert [f.name for f in fields] == ["hip_number", "parallax", "name", "flag"]
    assert rows == [
        {"hip_number": 70890, "parallax": 768.07, "name": "Proxima", "flag": 1},
        {"hip_number": 32349, "parallax": 379.21, "name": "Sirius", "flag": 0},
    ]


def test_a_nan_is_how_a_null_is_written():
    stream = _row(1, math.nan, "no parallax", 0)
    _, rows = heasarc.rows(_votable(FIELDS, stream))
    assert rows[0]["parallax"] is None


def test_a_type_this_reader_does_not_know_is_refused_not_guessed():
    fields = '<FIELD datatype="floatComplex" name="z"/>'
    with pytest.raises(heasarc.HeasarcError, match="does not decode"):
        heasarc.rows(_votable(fields, b"\x00" * 8))


def test_a_refused_query_is_not_read_as_an_empty_table():
    """The service reports an ADQL error inside a 200 and a QUERY_STATUS."""
    with pytest.raises(heasarc.HeasarcError, match="refused the query"):
        heasarc.rows(_votable(FIELDS, b"", status="ERROR"))


def test_a_stream_that_stops_inside_a_record_is_refused():
    stream = _row(1, 1.0, "whole", 0) + struct.pack(">i", 2)   # a record cut short
    with pytest.raises((heasarc.HeasarcError, struct.error)):
        heasarc.rows(_votable(FIELDS, stream))


def test_an_empty_answer_is_never_read_as_there_being_none():
    with pytest.raises(heasarc.HeasarcError, match="matched nothing"):
        heasarc.rows(_votable(FIELDS, b""))
