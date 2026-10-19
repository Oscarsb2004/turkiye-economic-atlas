/**
 * cosmic.tsx — the cosmic viewer: the Earth as a globe, lit by the real Sun.
 *
 * Asked for by the owner on 2026-09-24: "a simple tab to view the earth's
 * globe", its terrain shaded by the angle of the Sun. It is the one overlay
 * that draws no province: it brings a VIEW of its own (overlays/types.ts),
 * which the app draws instead of the map, so there is nothing to shade, no
 * clock to snap to and no province panel.
 *
 * THE INSTANT
 *
 * The Sun is placed for an instant the reader controls: now by default, kept
 * current while it stays "now"; any date and hour; or a whole day played in
 * thirty seconds, which is the terminator sweeping the planet and the lights
 * coming on behind it. Where the Sun is overhead is printed under the controls
 * — a formula's output, stated as such in earth.json.
 *
 * three.js is fetched only when this tab is first opened (React.lazy), the
 * same chunk the cosmos view uses.
 */

import { Suspense, lazy, useEffect, useState } from "react";

import { COSMOS_FILES, asset, loadEarth, type Earth, type Lang } from "../data/bundle";
import { formatInstant, stringsFor } from "../i18n";
import { LegendBox } from "../map/LegendBox";
import { subsolarPoint } from "../cosmos/sun";
import type { Overlay, OverlayContext } from "./types";

const EarthViewer = lazy(() => import("../cosmos/EarthViewer"));

export const COSMIC_ID = "cosmic";

const SOURCES = ["nasa_gibs_geographic", "nasa_visible_earth", "nasa_svs"];

/** Türkiye, where the globe first turns to. */
const START = { lat: 39, lon: 35 };

/** A played day: 24 hours in 30 seconds, stepped ten times a second. */
const PLAY_STEP_MS = (24 * 3600 * 1000) / 300;

/** "12.3° N, 45.1° E". */
function place(lat: number, lon: number): string {
  const f = (value: number) => Math.abs(value).toFixed(1);
  return `${f(lat)}° ${lat >= 0 ? "N" : "S"}, ${f(lon)}° ${lon >= 0 ? "E" : "W"}`;
}

function CosmicLegend({ earth, lang }: { earth: Earth; lang: Lang }) {
  const s = stringsFor(lang);
  return (
    <LegendBox title={s.overlayCosmic}>
      <p className="legend__method">
        <strong>{s.cosmicDay}</strong>: {earth.day.title}
        <br />
        <strong>{s.cosmicNight}</strong>: {earth.night.title}, {earth.night.time?.slice(0, 4)}
        <br />
        {s.cosmicReliefKey}: {earth.relief.attribution}
        <br />
        {s.cosmicSunRule}
      </p>
    </LegendBox>
  );
}

export function useCosmicOverlay({ lang, active }: OverlayContext): Overlay {
  const [earth, setEarth] = useState<Earth | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  // null is "now", kept current; a Date is an instant the reader chose.
  const [chosen, setChosen] = useState<Date | null>(null);
  const [now, setNow] = useState(() => new Date());
  const [playing, setPlaying] = useState(false);
  const [relief, setRelief] = useState(1);
  const s = stringsFor(lang);

  useEffect(() => {
    if (!active || earth || failed) return;
    loadEarth().then(setEarth, (error: Error) => setFailed(error.message));
  }, [active, earth, failed]);

  // "Now" stays now while the tab is open.
  useEffect(() => {
    if (!active || chosen) return;
    const timer = window.setInterval(() => setNow(new Date()), 60_000);
    return () => window.clearInterval(timer);
  }, [active, chosen]);

  useEffect(() => {
    if (!active || !playing) return;
    const timer = window.setInterval(() => {
      setChosen((at) => new Date((at ?? new Date()).getTime() + PLAY_STEP_MS));
    }, 100);
    return () => window.clearInterval(timer);
  }, [active, playing]);

  const at = chosen ?? now;
  const sun = subsolarPoint(at);
  const iso = at.toISOString();
  const hour = at.getUTCHours() + at.getUTCMinutes() / 60;

  const setDate = (value: string) => {
    if (!value) return;
    const [y, m, d] = value.split("-").map(Number);
    setChosen(new Date(Date.UTC(y, m - 1, d, at.getUTCHours(), at.getUTCMinutes())));
  };
  const setHour = (value: number) => {
    const next = new Date(at);
    next.setUTCHours(Math.floor(value), Math.round((value % 1) * 60), 0, 0);
    setChosen(next);
  };

  return {
    id: COSMIC_ID,
    group: "space",
    label: s.overlayCosmic,
    sources: SOURCES,
    periods: [],
    period: null,
    values: null,
    format: (value: number) => String(value),
    legendTitle: s.overlayCosmic,
    legend: earth ? <CosmicLegend earth={earth} lang={lang} /> : undefined,
    view: active && earth ? (
      <Suspense fallback={<p className="notice">{s.loading}</p>}>
        <EarthViewer
          earth={earth}
          at={at}
          relief={relief}
          milkyWay={asset(COSMOS_FILES.milkyWay)}
          start={START}
          hint={s.cosmicHint}
        />
      </Suspense>
    ) : undefined,
    controls: (
      <div className="cosmic__controls">
        <div className="cosmic__buttons">
          <button type="button" className={chosen === null ? "chip chip--on" : "chip"}
                  onClick={() => { setPlaying(false); setChosen(null); setNow(new Date()); }}>
            {s.cosmicNow}
          </button>
          <button type="button" className={playing ? "chip chip--on" : "chip"}
                  onClick={() => setPlaying((on) => !on)}>
            {playing ? s.cosmicPause : s.cosmicPlay}
          </button>
        </div>
        <label className="cosmic__field">
          <span>{s.cosmicDate}</span>
          <input type="date" value={iso.slice(0, 10)} onChange={(event) => { setPlaying(false); setDate(event.target.value); }} />
        </label>
        <label className="cosmic__field">
          <span>{s.cosmicHour} · {iso.slice(11, 16)}</span>
          <input type="range" min={0} max={23.75} step={0.25} value={hour}
                 onChange={(event) => { setPlaying(false); setHour(Number(event.target.value)); }} />
        </label>
        <label className="cosmic__field">
          <span>{s.cosmicRelief} · ×{relief.toFixed(1)}</span>
          <input type="range" min={0} max={3} step={0.1} value={relief}
                 onChange={(event) => setRelief(Number(event.target.value))} />
        </label>
        <p className="notice rail__note">
          {s.cosmicOverhead}: {place(sun.lat, sun.lon)}
          <br />
          {formatInstant(iso.slice(0, 10), lang)} {iso.slice(11, 16)} UTC{chosen === null ? ` · ${s.cosmicLive}` : ""}
        </p>
      </div>
    ),
    panel: () => <p className="notice">{s.cosmicNoProvince}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : earth ? null : s.loading,
  };
}
