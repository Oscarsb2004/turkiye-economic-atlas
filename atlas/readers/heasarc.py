"""
atlas.readers.heasarc — NASA's High Energy Astrophysics Science Archive, by ADQL.

    https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync

WHY THIS AND NOT A DOWNLOADED CATALOGUE FILE

HEASARC republishes the catalogues this atlas zooms out through — the new
reduction of Hipparcos (`hipnewcat`) and the 2MASS Redshift Survey
(`twomassrsc`) — behind one standard query service, the IVOA's Table Access
Protocol. A query says which columns and which rows, so the pipeline asks for
exactly what it draws instead of fetching a 30 MB file to throw most of it
away, and the question it asked is written down in the dataset that asked it.

WHAT COMES BACK, AND THE TRAP IN IT

The service answers only in VOTable — asked for `csv`, `text/csv` or `tsv` it
returns VOTable anyway, with a 200 — and it encodes the rows in the BINARY
serialisation: base64 inside a `<STREAM>`, one record after another with no
separators. Each column is decoded by its declared `datatype`:

    char arraysize="*"   a 4-byte big-endian length, then that many bytes
    char arraysize="N"   exactly N bytes, NUL-padded
    double / float       IEEE-754 big-endian; NaN is how a null is written
    long / int / short   big-endian integers
    unsignedByte / boolean   one byte

A column whose datatype this reader does not know is refused rather than
guessed at: guessing a width wrong shifts every byte after it, and every
following value in the table would be read from the wrong place — plausible
numbers, all wrong. It is the one failure mode here that looks like data.

WHAT IT REFUSES

A QUERY_STATUS other than OK (the service reports ADQL errors inside a 200),
an empty result, and a stream that does not end exactly at a record boundary.
"""

from __future__ import annotations

import base64
import logging
import math
import re
import struct
from dataclasses import dataclass
from typing import Any
from xml.etree import ElementTree

log = logging.getLogger(__name__)

ENDPOINT = "https://heasarc.gsfc.nasa.gov/xamin/vo/tap/sync"

_NS = {"v": "http://www.ivoa.net/xml/VOTable/v1.3"}


class HeasarcError(ValueError):
    """The service answered with something this reader was not written for."""


@dataclass(frozen=True, slots=True)
class Field:
    name: str
    datatype: str
    arraysize: str
    unit: str


#: Fixed-width numeric types, as struct formats (big-endian).
_FIXED = {
    "double": ">d", "float": ">f",
    "long": ">q", "int": ">i", "short": ">h",
    "unsignedByte": ">B",
}


def query_params(adql: str, *, maxrec: int = 200_000) -> dict[str, str]:
    """The form a TAP sync query is sent as."""
    return {"REQUEST": "doQuery", "LANG": "ADQL", "QUERY": adql, "MAXREC": str(maxrec)}


def rows(body: bytes) -> tuple[list[Field], list[dict[str, Any]]]:
    """Every row of a BINARY-serialised VOTable, decoded by its declared fields."""
    try:
        root = ElementTree.fromstring(body)
    except ElementTree.ParseError as exc:
        raise HeasarcError(f"the answer is not XML: {body[:200]!r}") from exc

    status = root.find(".//v:INFO[@name='QUERY_STATUS']", _NS)
    if status is None or status.get("value") != "OK":
        said = (status.text or "").strip() if status is not None else "no QUERY_STATUS"
        raise HeasarcError(f"the service refused the query: {said}")

    fields = [
        Field(f.get("name", ""), f.get("datatype", ""), f.get("arraysize", ""), f.get("unit", ""))
        for f in root.findall(".//v:FIELD", _NS)
    ]
    stream = root.find(".//v:BINARY/v:STREAM", _NS)
    if stream is None:
        if root.find(".//v:TABLEDATA", _NS) is not None:
            raise HeasarcError("the answer is TABLEDATA; this reader decodes the BINARY serialisation")
        raise HeasarcError("the answer carries no rows at all")
    data = base64.b64decode(re.sub(r"\s+", "", stream.text or ""))

    out: list[dict[str, Any]] = []
    at = 0
    while at < len(data):
        record: dict[str, Any] = {}
        for field in fields:
            value, at = _read(field, data, at)
            record[field.name] = value
        out.append(record)
    if at != len(data):
        raise HeasarcError(f"the stream ends at byte {len(data)} inside a record that began before it")
    if not out:
        raise HeasarcError("the query matched nothing; an empty answer is never read as 'there is none'")
    log.info("heasarc: %d rows of %d columns", len(out), len(fields))
    return fields, out


def _read(field: Field, data: bytes, at: int) -> tuple[Any, int]:
    """One value of one field, and where the next one starts."""
    if field.datatype == "char":
        if field.arraysize == "*" or field.arraysize.endswith("*"):
            (length,) = struct.unpack_from(">I", data, at)
            at += 4
            text = data[at:at + length].decode("utf-8", errors="replace")
            return text.strip(), at + length
        width = int(field.arraysize or "1")
        return data[at:at + width].split(b"\x00")[0].decode("utf-8", errors="replace").strip(), at + width
    if field.datatype == "boolean":
        return data[at:at + 1] in (b"T", b"t", b"1"), at + 1
    fmt = _FIXED.get(field.datatype)
    if fmt is None or field.arraysize not in ("", "1"):
        raise HeasarcError(
            f"column {field.name!r} is {field.datatype}[{field.arraysize}], which this reader does "
            f"not decode — and a wrong width would misread every value after it"
        )
    (value,) = struct.unpack_from(fmt, data, at)
    if isinstance(value, float) and math.isnan(value):
        value = None
    return value, at + struct.calcsize(fmt)
