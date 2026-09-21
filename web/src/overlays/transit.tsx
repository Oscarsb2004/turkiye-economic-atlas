/**
 * transit.tsx — İstanbul's rail and sea network, which is not a choropleth.
 *
 * WHY THIS OVERLAY BRINGS ITS OWN LEGEND AND ITS OWN VIEW
 *
 * Every overlay before this one shades 81 provinces. This one is 123 routes in
 * one city: there is nothing to shade, and a national frame shows it as a
 * smudge on the Marmara. So it hands the map a focus — the extent of the
 * published stops — and a legend of its own, the five modes in the five colours
 * the palette validates. Switching to any other overlay clears the focus and
 * the map comes back to the country.
 *
 * THE COLOURS ARE THE PALETTE'S, NOT THE OPERATOR'S
 *
 * İstanbul's lines have famous colours — M2 green, M4 pink — and this feed
 * publishes none of them: `route_color` is empty in all 499 rows. So the modes
 * take the five validated slots and the legend says which is which, rather than
 * the map recalling colours from memory (CLAUDE.md §1, §9).
 */

import { useEffect, useState } from "react";

import {
  loadTransit,
  t,
  type Lang,
  type Marker,
  type NetworkLine,
  type Transit,
} from "../data/bundle";
import { formatInstant, formatInt, stringsFor } from "../i18n";
import { LegendBox } from "../map/LegendBox";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const TRANSIT_ID = "transit";

const SOURCE = "ibb_gtfs";

/**
 * Which palette slot each mode takes. Five modes, five validated slots, and no
 * sixth — if the feed ever publishes a sixth mode that has to be a decision,
 * not a colour that appears by itself (CLAUDE.md §9).
 */
const TONES: Record<string, number> = {
  metro: 1,
  cable_car: 2,
  tram: 3,
  funicular: 4,
  ferry: 5,
};

/** The modes, in their colours, with how many routes each has. */
function TransitLegend({ transit, lang }: { transit: Transit; lang: Lang }) {
  const s = stringsFor(lang);
  const modes = Object.entries(transit.feed.modes).filter(([, count]) => count > 0);

  return (
    <LegendBox title={t(transit.feed.label, lang)}>
      <ul className="legend__bands">
        {modes.map(([mode, count]) => (
          <li className="legend__band" key={mode}>
            <span className="legend__swatch"
                  style={{ background: `var(--series-${TONES[mode] ?? 1})` }} aria-hidden="true" />
            <span className="legend__range">{t(transit.feed.mode_labels[mode], lang)}</span>
            <span className="legend__count">{formatInt(count, lang)}</span>
          </li>
        ))}
      </ul>
      <p className="legend__method">
        {s.transitPublished}: {formatInstant(transit.feed.published_on, lang)} ·{" "}
        {transit.feed.derivation.simplified}
        <br />
        {s.transitNotIncluded} ({formatInt(transit.feed.not_included.routes, lang)}).
      </p>
    </LegendBox>
  );
}

export function useTransitOverlay({ lang, clock, active }: OverlayContext): Overlay {
  const [transit, setTransit] = useState<Transit | null>(null);
  const [mode, setMode] = useState("all");
  const [failed, setFailed] = useState<string | null>(null);
  const s = stringsFor(lang);

  useEffect(() => {
    if (!active || transit || failed) return;
    loadTransit().then(setTransit, (error: Error) => setFailed(error.message));
  }, [active, transit, failed]);

  // One period: when İBB last replaced a file in the feed. There is no
  // feed_info.txt, so this is the only edition it has.
  const day = transit?.feed.published_on ?? "";
  const periods: Period[] = day
    ? [{ key: `${TRANSIT_ID}:${day}`, at: day, label: formatInstant(day, lang) }]
    : [];
  const period = snapPeriod(periods, clock);

  const shown = transit
    ? transit.routes.filter((route) => mode === "all" || route.mode === mode)
    : [];

  const network: NetworkLine[] = shown.flatMap((route) =>
    route.shapes.map((shape, index) => ({
      id: `${route.id}:${index}`,
      line: shape,
      tone: TONES[route.mode] ?? 1,
    })),
  );

  const called = new Set(shown.flatMap((route) => route.stops));
  const markers: Marker[] = transit
    ? transit.stops
        .filter((stop) => called.has(stop.id))
        .map((stop) => ({ id: stop.id, point: stop.point, label: stop.name }))
    : [];

  return {
    id: TRANSIT_ID,
    group: "connections",
    label: s.overlayTransit,
    sources: [SOURCE],
    periods,
    period,
    // Nothing to shade: one city. The legend below says what the colours are.
    values: null,
    markers,
    network,
    focus: transit?.feed.view,
    legend: transit ? <TransitLegend transit={transit} lang={lang} /> : undefined,
    format: (value: number) => formatInt(value, lang),
    legendTitle: s.overlayTransit,
    controls: (
      <>
        <label className="control">
          <span className="control__label">{s.transitRoutes}</span>
          <select className="control__select" value={mode}
                  onChange={(event) => setMode(event.target.value)}>
            <option value="all">{s.railTotal}</option>
            {Object.entries(transit?.feed.modes ?? {})
              .filter(([, count]) => count > 0)
              .map(([key, count]) => (
                <option key={key} value={key}>
                  {t(transit?.feed.mode_labels[key], lang)} ({count})
                </option>
              ))}
          </select>
        </label>
        {transit && (
          <p className="notice rail__note">
            {s.transitRoutes}: {formatInt(shown.length, lang)} ·{" "}
            {s.transitStops}: {formatInt(markers.length, lang)}
            <br />
            {s.transitAgency}: {transit.feed.agencies.join(", ")}
          </p>
        )}
      </>
    ),
    panel: () => <p className="notice">{s.transitProvince}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : transit ? null : s.loading,
  };
}
