/**
 * nightlights.tsx — Türkiye after dark, one night a year.
 *
 * THE ONE LAYER THAT IS NOT COMMITTED
 *
 * Every other overlay draws files this repository holds. This one draws tiles
 * the reader's browser fetches from NASA while they look at it. What the
 * pipeline publishes is the layer's description — the template, the dates, and
 * a tile per date fetched as proof it exists — so the URL the app asks for is
 * one a check has already held against NASA's own capabilities document.
 *
 * WHAT THE PICTURE IS NOT
 *
 * It is one night's radiance. Not activity, not population, not an economy.
 * Moon, snow and cloud differ from night to night even after NASA's gap-filling
 * and BRDF correction, so a brighter year is not a busier one — and the legend
 * says that under every date rather than leaving the reader to assume.
 *
 * AND THE MAP GETS OUT OF THE WAY
 *
 * With nothing to shade, the province fills go transparent (ProvinceMap), so
 * the imagery is the map and the borders are drawn over it.
 */

import { useEffect, useState } from "react";

import {
  loadNightlights,
  t,
  tilesFor,
  type Lang,
  type Nightlights,
} from "../data/bundle";
import { formatInstant, stringsFor } from "../i18n";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const NIGHTLIGHTS_ID = "nightlights";

const SOURCE = "nasa_gibs";

/** What is on the map, in words, with the caution attached to it. */
function NightlightsLegend({ layer, date, lang }: {
  layer: Nightlights["layer"]; date: string; lang: Lang;
}) {
  const s = stringsFor(lang);
  return (
    <figure className="legend">
      <figcaption className="legend__title">{t(layer.label, lang)}</figcaption>
      <ul className="legend__bands">
        <li className="legend__band">
          <span className="legend__range">{s.nightlightsNight}</span>
          <span className="legend__count">{formatInstant(date, lang)}</span>
        </li>
      </ul>
      <p className="legend__method">
        {s.nightlightsCaution}
        <br />
        {s.nightlightsRule} · {layer.title}
        <br />
        {layer.attribution} — {s.nightlightsLive}
      </p>
    </figure>
  );
}

export function useNightlightsOverlay({ lang, clock, active }: OverlayContext): Overlay {
  const [nightlights, setNightlights] = useState<Nightlights | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const s = stringsFor(lang);

  useEffect(() => {
    if (!active || nightlights || failed) return;
    loadNightlights().then(setNightlights, (error: Error) => setFailed(error.message));
  }, [active, nightlights, failed]);

  // One stop a year: the layer holds about five thousand days, which is not a
  // slider, and the dataset already chose by a stated rule.
  const periods: Period[] = (nightlights?.dates ?? []).map((entry) => ({
    key: `${NIGHTLIGHTS_ID}:${entry.date}`,
    at: entry.date,
    label: formatInstant(entry.date, lang),
  }));
  const period = snapPeriod(periods, clock);
  const date = period?.at ?? "";

  return {
    id: NIGHTLIGHTS_ID,
    group: "activity",
    label: s.overlayNightlights,
    source: SOURCE,
    periods,
    period,
    // Imagery, not figures: nothing to band, and the legend says what it is.
    values: null,
    raster: nightlights && date
      ? {
          id: nightlights.layer.id,
          tiles: tilesFor(nightlights.layer, date),
          maxZoom: nightlights.layer.max_zoom,
          attribution: nightlights.layer.attribution,
          opacity: 0.95,
        }
      : undefined,
    legend: nightlights && date
      ? <NightlightsLegend layer={nightlights.layer} date={date} lang={lang} />
      : undefined,
    format: (value: number) => String(value),
    legendTitle: s.overlayNightlights,
    controls: nightlights ? (
      <p className="notice rail__note">
        {s.nightlightsRule}: {nightlights.dates.length} · {nightlights.layer.id}
      </p>
    ) : null,
    panel: () => <p className="notice">{s.nightlightsProvince}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : nightlights ? null : s.loading,
  };
}
