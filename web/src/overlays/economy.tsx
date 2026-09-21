/**
 * economy.tsx — what a province produces, and what runs through it.
 *
 * ONE TAB, TWO PUBLISHERS, AND THE OWNER'S CALL
 *
 * This was two overlays until 2026-09-21: TÜİK's GDP per capita, and the
 * railway. They are one now because the owner asked for them merged — and the
 * merge is the better map. A railway is not a subject you compare provinces on;
 * it is the thing that runs between the provinces you are comparing. Drawn over
 * the shading it answers "which of these places are connected", which neither
 * half answered alone.
 *
 * What the railway lost in the merge was its own choropleth: provinces used to
 * be shaded by how many stations OSM places in each, which was OUR count of
 * somebody else's coordinates and put İstanbul at the top of a railway map for
 * having a metro. The counts are still here, in the panel, where a count is a
 * fact rather than a colour. The 1 335 station dots went too: at that many they
 * read as a dotted line and hid the route they were sitting on.
 *
 * TWO DIMENSIONS, AND ONLY ONE OF THEM IS TIME
 *
 * The bulletin publishes every year in two currencies, and this atlas derives a
 * third. The year is time and belongs to the shared clock; the currency is not,
 * so it stays a control of this overlay's own. A period's key is therefore the
 * year alone — switching currency keeps the reader on the year they were on.
 *
 * The years are read FROM the data, never assumed: TÜİK adds one every
 * December, the Bank of Canada's annual rate starts in 2017, and the slider
 * grows and shrinks by itself as each of them moves.
 *
 * AND THE RAILWAY HAS NO YEARS AT ALL
 *
 * OpenStreetMap has no edition: the railway is as it was at one moment, and
 * that moment does not move when the reader moves the clock. The legend says
 * so under the line key rather than letting 2020's map imply 2020's railway.
 */

import { Fragment, useEffect, useMemo, useState } from "react";

import {
  figureAt,
  loadPerCapitaGdp,
  loadRailNetwork,
  loadRailStations,
  t,
  type Lang,
  type NetworkLine,
  type PerCapitaGdp,
  type RailNetwork,
  type RailStations,
} from "../data/bundle";
import { formatInstant, formatInt, formatMoney, stringsFor } from "../i18n";
import { toneInk } from "../map/style";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const ECONOMY_ID = "economy";

const GDP_SOURCE = "tuik_provincial_gdp";
const RATE_SOURCE = "boc_valet";
const RAIL_SOURCE = "osm_overpass";

/** How many station names the panel lists for a province. */
const NAMES = 12;

/** The palette slot a high-speed line takes; everything else is the muted one. */
const HIGHSPEED_TONE = 2;

/** The two kinds of line, in the colours the map actually draws them in. */
function RailKey({ network, lang }: { network: RailNetwork; lang: Lang }) {
  const s = stringsFor(lang);
  const kinds = [
    { tone: HIGHSPEED_TONE, label: s.railHighspeed, count: network.network.kinds.highspeed },
    { tone: 0, label: s.railConventional, count: network.network.kinds.conventional },
  ];

  return (
    <>
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
        {s.railAsOf} {formatInstant(network.network.current_as_of, lang)} ·{" "}
        {s.railSimplified}: {network.network.derivation.tolerance_m} m
        <br />
        {s.railFixed}
      </p>
    </>
  );
}

/** One province: its figure in every currency, and the railway in it. */
function EconomyFigures({ gdp, stations, plaka, year, lang }: {
  gdp: PerCapitaGdp; stations: RailStations | null; plaka: number; year: string; lang: Lang;
}) {
  const s = stringsFor(lang);
  const counts = stations?.by_province.by_plaka[String(plaka)];
  const mine = stations?.stations.filter((station) => station.plaka === plaka) ?? [];
  const derived = gdp.measure.derived ?? {};

  return (
    <>
      <section className="figures">
        <h3 className="figures__label">{t(gdp.measure.label, lang)} · {year}</h3>
        <dl className="panel__facts">
          {/* Every currency, including one with nothing published for this year:
              an absent figure is said, not dropped (CLAUDE.md §10). */}
          {gdp.measure.currencies.map((currency) => {
            const value = figureAt(gdp, plaka, currency, year);
            return (
              <Fragment key={currency}>
                <dt>{currency}{derived[currency] ? " ·" : ""}</dt>
                <dd>{value === null ? s.noFigureLegend : formatMoney(value, currency, lang)}</dd>
              </Fragment>
            );
          })}
        </dl>
        <p className="notice">{s.perCapitaNote}</p>
        {derived.CAD && (
          <p className="notice">
            · {s.gdpDerived} {derived.CAD.rate_by_year[year] ?? "—"}
          </p>
        )}
      </section>

      <section className="figures">
        <h3 className="figures__label">{s.railStations}</h3>
        {counts && mine.length > 0 ? (
          <>
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
          </>
        ) : (
          <p className="notice">{s.railNoStation}</p>
        )}
      </section>
    </>
  );
}

export function useEconomyOverlay({ lang, clock, active }: OverlayContext): Overlay {
  const [gdp, setGdp] = useState<PerCapitaGdp | null>(null);
  const [network, setNetwork] = useState<RailNetwork | null>(null);
  const [stations, setStations] = useState<RailStations | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [currency, setCurrency] = useState("TRY");
  const s = stringsFor(lang);

  useEffect(() => {
    if (!active || gdp || failed) return;
    loadPerCapitaGdp().then(setGdp, (error: Error) => setFailed(error.message));
    // The railway is drawn over the shading and is not what the shading is; a
    // railway that could not be fetched leaves a map of GDP per capita, which
    // is most of this overlay, so it does not fail the whole tab.
    loadRailNetwork().then(setNetwork, () => undefined);
    loadRailStations().then(setStations, () => undefined);
  }, [active, gdp, failed]);

  const periods: Period[] = useMemo(() => {
    const years = gdp?.measure.years[currency] ?? [];
    return years.map((year) => ({ key: `${ECONOMY_ID}:${year}`, at: year, label: year }));
  }, [gdp, currency]);

  const period = snapPeriod(periods, clock);
  const year = period?.at ?? "";

  const values = useMemo(() => {
    if (!gdp || !year) return null;
    const found = new Map<number, number | null>();
    for (const province of gdp.provinces) {
      found.set(province.plaka, province.per_capita_gdp?.[currency]?.[year] ?? null);
    }
    return found;
  }, [gdp, currency, year]);

  const lines: NetworkLine[] = useMemo(
    () => (network
      // The distinction is a published tag, and the palette decides what it
      // looks like; tone 0 is the muted line everything else is drawn in.
      ? network.lines.map((line) => ({
          id: line.id, line: line.line, tone: line.highspeed ? HIGHSPEED_TONE : 0,
        }))
      : []),
    [network],
  );

  const derived = gdp?.measure.derived?.[currency];

  return {
    id: ECONOMY_ID,
    group: "provinces",
    label: s.overlayEconomy,
    // Two publishers on one tab: the figures are TÜİK's, the rate behind the
    // Canadian ones is the Bank of Canada's, and the railway is OSM's. The rail
    // resolves each through meta.json (overlays/types.ts).
    sources: [GDP_SOURCE, RATE_SOURCE, RAIL_SOURCE],
    periods,
    period,
    values,
    network: lines,
    format: (value: number) => formatMoney(value, currency, lang),
    // Six bands of six-digit lira ranges is a table sitting on the map. The
    // shades say where a province stands against the others; the figure itself
    // is one click away in the panel, which is where it reads (map/Legend.tsx).
    bands: "relative",
    legendTitle: gdp ? `${t(gdp.measure.label, lang)} · ${currency} · ${year}` : s.overlayEconomy,
    legendExtra: network ? <RailKey network={network} lang={lang} /> : undefined,
    controls: (
      <>
        <label className="control">
          <span className="control__label">{s.currency}</span>
          <select className="control__select" value={currency}
                  onChange={(event) => setCurrency(event.target.value)}>
            {(gdp?.measure.currencies ?? [currency]).map((code) => (
              <option key={code} value={code}>{code}</option>
            ))}
          </select>
        </label>
        {derived && (
          <p className="notice rail__note">
            {s.gdpDerived} {derived.rate_by_year[year] ?? "—"}
          </p>
        )}
      </>
    ),
    panel: (plaka: number) =>
      gdp && year
        ? <EconomyFigures gdp={gdp} stations={stations} plaka={plaka} year={year} lang={lang} />
        : <p className="notice">{s.loading}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : gdp ? null : s.loading,
  };
}
