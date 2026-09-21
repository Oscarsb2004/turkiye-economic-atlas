/**
 * rail.tsx — the railway, drawn as the railway.
 *
 * WHAT THIS OVERLAY DREW BEFORE, AND WHY IT STOPPED
 *
 * It used to shade the 81 provinces by how many stations OSM places in each,
 * and draw a dot on every one of the 1 335. Both are gone. The count was OUR
 * count of somebody else's coordinates, and as a choropleth it put İstanbul at
 * the top of a map of railways for having a metro; the dots, at that many, read
 * as a dotted line and hid the route they were sitting on. What is left is the
 * network as OpenStreetMap published it — which is what the layer is for.
 *
 * The station figures did not go away. They are in the panel, for the province
 * the reader selects, where a count is a fact rather than a colour.
 *
 * ONE PERIOD, WHICH IS HONEST
 *
 * OpenStreetMap has no edition. The period is the moment the answer was current
 * (`timestamp_osm_base`), so the slider has one stop and sits there inert
 * rather than implying a series this source does not have.
 *
 * İSTANBUL IS NOT A RAILWAY HUB BECAUSE OF THE METRO
 *
 * 173 of İstanbul's 222 stations are metro, funicular or light rail. The panel
 * publishes the split rather than one total, because a figure that silently
 * folds a metro network into "railway stations" answers a different question
 * from the one it appears to answer.
 */

import { Fragment, useEffect, useState } from "react";

import {
  loadRailNetwork,
  loadRailStations,
  t,
  type Lang,
  type NetworkLine,
  type RailNetwork,
  type RailStations,
} from "../data/bundle";
import { formatInt, formatInstant, stringsFor } from "../i18n";
import { LegendBox } from "../map/LegendBox";
import { toneInk } from "../map/style";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const RAIL_ID = "rail";

const SOURCE = "osm_overpass";

/** How many station names the panel lists for a province. */
const NAMES = 12;

/** The palette slot a high-speed line takes; everything else is the muted one. */
const HIGHSPEED_TONE = 2;

/** The two kinds of line, in the colours the map actually draws them in. */
function RailLegend({ network, lang }: { network: RailNetwork; lang: Lang }) {
  const s = stringsFor(lang);
  const kinds: Array<{ tone: number; label: string; count: number }> = [
    { tone: HIGHSPEED_TONE, label: s.railHighspeed, count: network.network.kinds.highspeed },
    { tone: 0, label: s.railConventional, count: network.network.kinds.conventional },
  ];

  return (
    <LegendBox title={s.railLines}>
      <ul className="legend__bands">
        {kinds.map((kind) => (
          <li className="legend__band" key={kind.label}>
            <span className="legend__swatch legend__swatch--line"
                  style={{ background: toneInk(kind.tone) }} aria-hidden="true" />
            <span className="legend__range">{kind.label}</span>
            <span className="legend__count">{formatInt(kind.count, lang)}</span>
          </li>
        ))}
      </ul>
      <p className="legend__method">
        {s.railAsOf} {formatInstant(network.network.current_as_of, lang)}
        <br />
        {s.railSimplified}: {network.network.derivation.tolerance_m} m · {s.railNoShading}
      </p>
    </LegendBox>
  );
}

/** The stations in one province, and what OSM says about them. */
function RailFigures({ stations, plaka, lang }: {
  stations: RailStations; plaka: number; lang: Lang;
}) {
  const s = stringsFor(lang);
  const counts = stations.by_province.by_plaka[String(plaka)];
  const mine = stations.stations.filter((station) => station.plaka === plaka);
  if (!counts || mine.length === 0) return <p className="notice">{s.railNoStation}</p>;

  return (
    <section className="figures">
      <h3 className="figures__label">{t(stations.station_info.label, lang)}</h3>
      <dl className="panel__facts">
        <dt>{s.railTotal}</dt>
        <dd>{formatInt(counts.total, lang)}</dd>
        <dt>{s.railUrban}</dt>
        <dd>{formatInt(counts.urban, lang)}</dd>
        <dt>{s.railHalt}</dt>
        <dd>{formatInt(counts.halt, lang)}</dd>
      </dl>
      <p className="notice">{s.railDerived}</p>

      <dl className="panel__facts">
        {mine.slice(0, NAMES).map((station) => (
          <Fragment key={station.id}>
            <dt>{t(station.name, lang) || s.railUnnamed}</dt>
            <dd>{station.station || station.kind}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

export function useRailOverlay({ lang, clock, active }: OverlayContext): Overlay {
  const [network, setNetwork] = useState<RailNetwork | null>(null);
  const [stations, setStations] = useState<RailStations | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const s = stringsFor(lang);

  useEffect(() => {
    if (!active || network || failed) return;
    loadRailNetwork().then(setNetwork, (error: Error) => setFailed(error.message));
    loadRailStations().then(setStations, (error: Error) => setFailed(error.message));
  }, [active, network, failed]);

  // One period: the moment OSM's answer was current. Until the file arrives
  // there is nothing to date, so there is no period rather than a made-up one.
  // Published as a day already (atlas/datasets/rail_network.py).
  const day = network?.network.current_as_of ?? "";
  const periods: Period[] = day
    ? [{ key: `${RAIL_ID}:${day}`, at: day, label: formatInstant(day, lang) }]
    : [];
  const period = snapPeriod(periods, clock);

  const lines: NetworkLine[] = network
    // The distinction is a published tag, and the palette decides what it
    // looks like; tone 0 is the muted line everything else is drawn in.
    ? network.lines.map((line) => ({
        id: line.id, line: line.line, tone: line.highspeed ? HIGHSPEED_TONE : 0,
      }))
    : [];

  return {
    id: RAIL_ID,
    group: "economic",
    label: s.overlayRail,
    source: SOURCE,
    periods,
    period,
    // Lines, not a figure per province: nothing to band, and the legend below
    // says what the two colours are.
    values: null,
    network: lines,
    format: (value: number) => formatInt(value, lang),
    legendTitle: s.railLines,
    legend: network ? <RailLegend network={network} lang={lang} /> : undefined,
    controls: network ? (
      <p className="notice rail__note">
        {s.railHighspeed}: {formatInt(network.network.kinds.highspeed, lang)} ·{" "}
        {s.railConventional}: {formatInt(network.network.kinds.conventional, lang)}
      </p>
    ) : null,
    panel: (plaka: number) =>
      stations
        ? <RailFigures stations={stations} plaka={plaka} lang={lang} />
        : <p className="notice">{s.loading}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : network && stations ? null : s.loading,
  };
}
