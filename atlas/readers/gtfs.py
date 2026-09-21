"""
atlas.readers.gtfs — a GTFS feed, as İBB publishes one.

    https://data.ibb.gov.tr/dataset/public-transport-gtfs-data

WHAT GTFS IS, AND WHAT THIS FEED IS

The General Transit Feed Specification: a set of CSVs that describe a public
transport network — agencies, routes, the trips that run on them, the stops
those trips call at, and the shapes the vehicles follow. Normally it arrives as
one zip. İstanbul publishes the tables SEPARATELY, as eight CKAN resources, so
each is fetched on its own and the feed is assembled here.

TWO THINGS THE SPEC SAYS THAT THIS FEED DOES NOT DO

  Encoding. GTFS requires UTF-8. These files are Windows-1254, the Turkish code
  page: `BEŞİKTAŞ` arrives as bytes that are not valid UTF-8 at all, so a
  reader that assumes the spec crashes on the fourth line of routes.csv.

  Quoting. One line of routes.csv is wrapped in quotes as a WHOLE — the record
  for route 7431, whose long name contains a comma — so a CSV reader sees one
  field where the header has nine. Its content is that record, correctly
  quoted, one level down. It is re-parsed rather than dropped, and the number
  of lines that needed it is published beside the data.

WHAT IT REFUSES

A table missing a column the caller asked for, and a row that does not match
the header even after the one repair. Both would otherwise read as absent
values: a stop with no coordinate, a route with no type.
"""

from __future__ import annotations

import csv
import io
import logging
from dataclasses import dataclass, field

log = logging.getLogger(__name__)

#: What the files are actually encoded in. The spec says UTF-8; this feed is
#: the Turkish Windows code page, and nothing in the files says so.
ENCODING = "cp1254"


class GtfsError(ValueError):
    """A GTFS table is not shaped the way this reader was written for."""


@dataclass(slots=True)
class Table:
    """One GTFS file: its rows, and what had to be done to read them."""

    name: str
    rows: list[dict[str, str]] = field(default_factory=list)
    #: Lines the publisher wrapped in quotes as a whole, re-parsed here.
    repaired: int = 0

    def __len__(self) -> int:
        return len(self.rows)


def table(body: bytes, *, name: str, needs: tuple[str, ...] = ()) -> Table:
    """One GTFS CSV, decoded, parsed, repaired where it has to be, and checked."""
    text = body.decode(ENCODING)
    reader = csv.reader(io.StringIO(text))
    try:
        header = [column.strip().lstrip("﻿") for column in next(reader)]
    except StopIteration as exc:
        raise GtfsError(f"{name}: the file is empty") from exc

    missing = [column for column in needs if column not in header]
    if missing:
        raise GtfsError(f"{name}: no column(s) {missing}; it has {header}")

    out = Table(name=name)
    for number, fields in enumerate(reader, start=2):
        if not fields or fields == [""]:
            continue
        if len(fields) != len(header):
            # A whole record wrapped in quotes reads as one field whose content
            # is the record. Unwrap it once; anything else is a broken file.
            if len(fields) == 1:
                fields = next(csv.reader(io.StringIO(fields[0])), [])
                out.repaired += 1
            if len(fields) != len(header):
                raise GtfsError(
                    f"{name}: line {number} has {len(fields)} fields, not {len(header)}: "
                    f"{str(fields)[:160]}"
                )
        out.rows.append(dict(zip(header, fields)))

    if out.repaired:
        log.warning("%s: %d line(s) were wrapped in quotes as a whole and re-parsed",
                    name, out.repaired)
    log.info("gtfs %s: %d rows", name, len(out.rows))
    return out
