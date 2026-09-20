/**
 * aviation.tsx — airports, which are the first subject that is not a province.
 *
 * TWO THINGS ON ONE MAP, AND THEY ARE DIFFERENT KINDS OF FIGURE
 *
 * The circles are airports, sized by what DHMİ published for them. The shading
 * is provinces, and it is OUR sum of the airports OurAirports places in each —
 * so the panel and the legend say so. A province with no airport is not shaded
 * at all: DHMİ published nothing for it, which is not the same as zero
 * (CLAUDE.md §10).
 *
 * FIVE MEASURES, THREE SLICES, ONE AT A TIME
 *
 * DHMİ publishes aircraft, commercial aircraft, passengers, freight and cargo,
 * each split into domestic, international and total. That is fifteen figures an
 * airport and no map can show them at once, so the reader picks one — the same
 * "one option at a time" the election overlay settled on for the same reason.
 *
 * The key into the published data is `<measure>_<slice>`, the shape the
 * pipeline writes, so adding a measure is a line in the reader and nothing here.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  AIRPORTS,
  loadAirports,
  t,
  type AirportTraffic,
  type Lang,
  type Marker,
} from "../data/bundle";
import { formatInt, stringsFor, type Strings } from "../i18n";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const AVIATION_ID = "aviation";

const SOURCE = "dhmi_airport_statistics";

/** DHMİ's five measures, as the pipeline keys them. */
const MEASURES: Array<{ key: string; label: (s: Strings) => string }> = [
  { key: "passengers", label: (s) => s.aviationPassengers },
  { key: "commercial_aircraft", label: (s) => s.aviationCommercialAircraft },
  { key: "aircraft", label: (s) => s.aviationAircraft },
  { key: "freight_tonnes", label: (s) => s.aviationFreight },
  { key: "cargo_tonnes", label: (s) => s.aviationCargo },
];

/** And the three ways it splits each of them. */
const SLICES: Array<{ key: string; label: (s: Strings) => string }> = [
  { key: "total", label: (s) => s.aviationTotal },
  { key: "domestic", label: (s) => s.aviationDomestic },
  { key: "international", label: (s) => s.aviationInternational },
];

/** The airports in one province, and what was published for each. */
function AirportFigures({ traffic, plaka, key_, lang }: {
  traffic: AirportTraffic; plaka: number; key_: string; lang: Lang;
}) {
  const s = stringsFor(lang);
  const mine = traffic.airports.filter((airport) => airport.plaka === plaka);
  if (mine.length === 0) return <p className="notice">{s.aviationNoAirport}</p>;
  const province = traffic.by_province.by_plaka[String(plaka)];

  return (
    <section className="figures">
      <h3 className="figures__label">{t(traffic.traffic.label, lang)} · {traffic.traffic.year}</h3>
      <dl className="panel__facts">
        {mine.map((airport) => (
          <Fragment key={airport.icao}>
            <dt>{t(airport.name, lang)} ({airport.iata || airport.icao})</dt>
            <dd>{formatInt(airport.traffic[key_] ?? 0, lang)}</dd>
          </Fragment>
        ))}
        {mine.length > 1 && province && (
          <>
            <dt>{s.aviationTotal}</dt>
            <dd>{formatInt(province[key_] ?? 0, lang)}</dd>
          </>
        )}
      </dl>
      <p className="notice">{s.aviationDerived}</p>
    </section>
  );
}

export function useAviationOverlay({ lang, clock, active }: OverlayContext): Overlay {
  const [traffic, setTraffic] = useState<AirportTraffic | null>(null);
  const [measure, setMeasure] = useState("passengers");
  const [slice, setSlice] = useState("total");
  const [failed, setFailed] = useState<string | null>(null);
  const cache = useRef(new Map<string, AirportTraffic>());
  const s = stringsFor(lang);

  const periods: Period[] = useMemo(
    () => AIRPORTS.map((entry) => ({
      key: `${AVIATION_ID}:${entry.year}`, at: entry.year, label: entry.year,
    })),
    [],
  );

  const period = snapPeriod(periods, clock);
  const year = period?.at ?? "";

  useEffect(() => {
    if (!active || !year) return;
    const held = cache.current.get(year);
    if (held) {
      setTraffic(held);
      return;
    }
    let current = true;
    loadAirports(year).then(
      (loaded) => {
        cache.current.set(year, loaded);
        if (current) setTraffic(loaded);
      },
      (error: Error) => current && setFailed(error.message),
    );
    return () => { current = false; };
  }, [active, year]);

  const shown = traffic && traffic.traffic.year === year ? traffic : null;
  const key = `${measure}_${slice}`;

  // The provinces, by our sum of their airports. A province with no airport is
  // absent from by_plaka and therefore has no band at all.
  const values = useMemo(() => {
    if (!shown) return null;
    const found = new Map<number, number | null>();
    for (const [plaka, figures] of Object.entries(shown.by_province.by_plaka)) {
      found.set(Number(plaka), figures[key] ?? null);
    }
    return found;
  }, [shown, key]);

  // The airports themselves, as published. An airport with nothing published
  // for this measure is left off the map rather than drawn as a dot of zero.
  const markers: Marker[] = useMemo(() => {
    if (!shown) return [];
    return shown.airports
      .map((airport) => ({
        id: airport.icao,
        point: airport.point,
        label: t(airport.name, lang),
        value: airport.traffic[key] ?? 0,
      }))
      .filter((marker) => marker.value > 0);
  }, [shown, key, lang]);

  const measureLabel = MEASURES.find((entry) => entry.key === measure)?.label(s) ?? "";
  const sliceLabel = SLICES.find((entry) => entry.key === slice)?.label(s) ?? "";

  return {
    id: AVIATION_ID,
    group: "connections",
    label: s.overlayAviation,
    source: SOURCE,
    periods,
    period,
    values,
    markers,
    format: (value: number) => formatInt(value, lang),
    legendTitle: `${measureLabel} · ${sliceLabel} · ${year}`,
    controls: (
      <>
        <label className="control">
          <span className="control__label">{s.aviationMeasure}</span>
          <select className="control__select" value={measure}
                  onChange={(event) => setMeasure(event.target.value)}>
            {MEASURES.map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.label(s)}</option>
            ))}
          </select>
        </label>
        <label className="control">
          <span className="control__label">{s.aviationSlice}</span>
          <select className="control__select" value={slice}
                  onChange={(event) => setSlice(event.target.value)}>
            {SLICES.map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.label(s)}</option>
            ))}
          </select>
        </label>
        {shown && (
          <p className="notice rail__note">
            {s.aviationNational}: {formatInt(shown.published_total[key] ?? 0, lang)}
          </p>
        )}
      </>
    ),
    panel: (plaka: number) =>
      shown
        ? <AirportFigures traffic={shown} plaka={plaka} key_={key} lang={lang} />
        : <p className="notice">{s.loading}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : shown ? null : s.loading,
  };
}
