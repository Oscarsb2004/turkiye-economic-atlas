/**
 * rail.tsx — the railway: lines, stations, and one date.
 *
 * THREE THINGS ON THE MAP AT ONCE
 *
 * The lines are OSM's geometry, drawn as published (simplified, which the panel
 * says). The dots are stations, and they carry no figure — a station is a
 * station — so they are drawn as dots of one size rather than sized by
 * something invented. The shading is a count of those dots per province, which
 * is ours and says so.
 *
 * ONE PERIOD, WHICH IS HONEST
 *
 * OpenStreetMap has no edition. The period is the moment the answer was current
 * (`timestamp_osm_base`), so the slider has one stop and sits there inert
 * rather than implying a series this source does not have.
 *
 * İSTANBUL IS NOT A RAILWAY HUB BECAUSE OF THE METRO
 *
 * 173 of İstanbul's 222 stations are metro, funicular or light rail. The count
 * is published split, and the reader can shade by either — because a map that
 * silently folds a metro network into "railway stations" is answering a
 * different question from the one it appears to answer.
 */

import { Fragment, useEffect, useState } from "react";

import {
  loadRailNetwork,
  loadRailStations,
  t,
  type Lang,
  type Marker,
  type NetworkLine,
  type RailNetwork,
  type RailStations,
} from "../data/bundle";
import { formatInt, formatInstant, stringsFor, type Strings } from "../i18n";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const RAIL_ID = "rail";

const SOURCE = "osm_overpass";

/** How many station names the panel lists for a province. */
const NAMES = 12;

/** What a province can be shaded by. Both counts are published in the file. */
type Measure = "total" | "urban";

const MEASURES: Array<{ key: Measure; label: (s: Strings) => string }> = [
  { key: "total", label: (s) => s.railTotal },
  { key: "urban", label: (s) => s.railUrban },
];

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

      <h3 className="figures__label">{t(stations.station_info.label, lang)}</h3>
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
  const [measure, setMeasure] = useState<Measure>("total");
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

  const values = stations
    ? new Map<number, number | null>(
        Object.entries(stations.by_province.by_plaka).map(
          ([plaka, counts]) => [Number(plaka), counts[measure]],
        ),
      )
    : null;

  // Stations as dots. With `urban` chosen, the dots are the urban ones, so the
  // map and the shading are answering the same question.
  const markers: Marker[] = stations
    ? stations.stations
        .filter((station) => measure === "total" || station.station !== "")
        .map((station) => ({
          id: station.id,
          point: station.point,
          label: t(station.name, lang) || s.railUnnamed,
        }))
    : [];

  const lines: NetworkLine[] = network
    ? network.lines.map((line) => ({ id: line.id, highspeed: line.highspeed, line: line.line }))
    : [];

  return {
    id: RAIL_ID,
    group: "connections",
    label: s.overlayRail,
    source: SOURCE,
    periods,
    period,
    values,
    markers,
    network: lines,
    format: (value: number) => formatInt(value, lang),
    legendTitle: `${s.railStations} · ${MEASURES.find((m) => m.key === measure)?.label(s) ?? ""}`,
    controls: (
      <>
        <label className="control">
          <span className="control__label">{s.railStations}</span>
          <select className="control__select" value={measure}
                  onChange={(event) => setMeasure(event.target.value as Measure)}>
            {MEASURES.map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.label(s)}</option>
            ))}
          </select>
        </label>
        {network && (
          <p className="notice rail__note">
            {s.railHighspeed}: {formatInt(network.network.kinds.highspeed, lang)} ·{" "}
            {s.railConventional}: {formatInt(network.network.kinds.conventional, lang)}
            <br />
            {s.railSimplified}: {network.network.derivation.tolerance_m} m
          </p>
        )}
      </>
    ),
    panel: (plaka: number) =>
      stations
        ? <RailFigures stations={stations} plaka={plaka} lang={lang} />
        : <p className="notice">{s.loading}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : network && stations ? null : s.loading,
  };
}
