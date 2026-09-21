"""
The WMTS reader, and the date arithmetic the nightlights layer rests on.

This is the one source whose imagery is never committed: the reader's browser
fetches it from NASA while they look at it. So everything that CAN be checked
before that happens is checked here — that the layer exists, that it has a
template with a time in it, and that a date the atlas offers is a date the
service says it holds.
"""

from __future__ import annotations

import pytest

from atlas.readers import wmts

CAPABILITIES = """<?xml version="1.0" encoding="UTF-8"?>
<Capabilities xmlns="http://www.opengis.net/wmts/1.0" xmlns:ows="http://www.opengis.net/ows/1.1">
  <Contents>
    <Layer>
      <ows:Title>Something Else</ows:Title>
      <ows:Identifier>OTHER_LAYER</ows:Identifier>
    </Layer>
    <Layer>
      <ows:Title>Gap-Filled BRDF Corrected Radiance</ows:Title>
      <ows:Identifier>VIIRS_DNB</ows:Identifier>
      <Dimension>
        <ows:Identifier>Time</ows:Identifier>
        <ows:UOM>ISO8601</ows:UOM>
        <Default>2026-09-20</Default>
        <Value>2012-01-19/2012-02-17/P1D</Value>
        <Value>2024-01-01/2024-12-30/P1D</Value>
        <Value>2026-08-06/2026-09-20/P1D</Value>
      </Dimension>
      <Format>image/png</Format>
      <TileMatrixSetLink><TileMatrixSet>GoogleMapsCompatible_Level8</TileMatrixSet></TileMatrixSetLink>
      <ResourceURL format="image/png" resourceType="tile"
        template="https://example.invalid/{Time}/{TileMatrixSet}/{TileMatrix}/{TileRow}/{TileCol}.png"/>
      <ResourceURL format="text/xml" resourceType="Domains"
        template="https://example.invalid/{TileMatrixSet}/all/{TimeStart}--{TimeEnd}.xml"/>
    </Layer>
  </Contents>
</Capabilities>
""".encode("utf-8")


def test_the_layer_describes_itself():
    layer = wmts.layer(CAPABILITIES, "VIIRS_DNB")
    assert layer.title == "Gap-Filled BRDF Corrected Radiance"
    assert layer.formats == ["image/png"]
    assert layer.matrix_sets == ["GoogleMapsCompatible_Level8"]
    assert layer.default_time == "2026-09-20"
    assert len(layer.periods) == 3
    # The TILE template, not the Domains one that sits beside it.
    assert layer.template.endswith("{TileMatrix}/{TileRow}/{TileCol}.png")
    assert "{Time}" in layer.template


def test_a_layer_that_is_not_there_says_how_many_are():
    with pytest.raises(wmts.WmtsError, match="no layer named 'NOPE'.*describes 2 layers"):
        wmts.layer(CAPABILITIES, "NOPE")


def test_a_layer_with_no_time_values_is_refused():
    """A dated layer with no dates would have the app asking for nothing."""
    stripped = CAPABILITIES.replace(b"<Value>2012-01-19/2012-02-17/P1D</Value>", b"") \
                           .replace(b"<Value>2024-01-01/2024-12-30/P1D</Value>", b"") \
                           .replace(b"<Value>2026-08-06/2026-09-20/P1D</Value>", b"")
    with pytest.raises(wmts.WmtsError, match="publishes no values"):
        wmts.layer(stripped, "VIIRS_DNB")


def test_a_layer_with_no_tile_template_is_refused():
    stripped = CAPABILITIES.replace(b'resourceType="tile"', b'resourceType="Domains"')
    with pytest.raises(wmts.WmtsError, match="no tile template"):
        wmts.layer(stripped, "VIIRS_DNB")


def test_a_date_is_inside_a_published_period_or_it_is_not():
    periods = wmts.layer(CAPABILITIES, "VIIRS_DNB").periods
    assert wmts.covers(periods, "2024-06-15") == "2024-01-01/2024-12-30/P1D"
    assert wmts.covers(periods, "2012-01-19") == "2012-01-19/2012-02-17/P1D", "the first day counts"
    assert wmts.covers(periods, "2024-12-30") == "2024-01-01/2024-12-30/P1D", "and the last"
    # The gap between the periods: the service does not hold these days.
    assert wmts.covers(periods, "2024-12-31") == ""
    assert wmts.covers(periods, "2020-06-01") == ""


def test_the_last_night_of_a_year_is_the_last_one_published_in_it():
    """
    Which is not 31 December: the layer's 2024 stops on the 30th, and asking
    for a night it does not have would be a black map.
    """
    periods = wmts.layer(CAPABILITIES, "VIIRS_DNB").periods
    assert wmts.latest(periods) == "2026-09-20"
    assert wmts.latest(periods, not_after="2024-12-31") == "2024-12-30"
    assert wmts.latest(periods, not_after="2012-12-31") == "2012-02-17"
    # A year the layer does not reach at all has no night in it.
    assert wmts.latest(periods, not_after="2011-12-31") == ""
