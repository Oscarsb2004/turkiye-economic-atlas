/**
 * nightlights.tsx — the Earth after dark, as NASA publishes it.
 *
 * THE ONE LAYER THAT IS NOT COMMITTED
 *
 * Every other overlay draws files this repository holds. This one draws tiles
 * the reader's browser fetches from NASA while they look at it. What the
 * pipeline publishes is the layers' descriptions — the templates, the dates,
 * and a tile per date fetched as proof it exists — so the URL the app asks for
 * is one a check has already held against NASA's own capabilities.
 *
 * TWO PRODUCTS ON ONE SLIDER, AND THE LEGEND SAYS WHICH
 *
 * The slider opens with NASA's Black Marble, the cloud-free composites of 2012
 * and 2016 — the picture of the Earth at night NASA publishes as a picture —
 * and then steps a month at a time through the last five years, one night per
 * month from the daily layer. A composite and a single night are different
 * things, so each stop draws its own layer and the legend names it: a brighter
 * month is not a busier one, and a composite is not a night.
 *
 * A MONTH IS LABELLED AS A MONTH
 *
 * The stops used to read as dates — 30/01/2024 — which made a monthly series
 * look like a daily one. They are labelled by what they stand for now, and the
 * night itself is in the legend.
 *
 * AND THE MAP GETS OUT OF THE WAY
 *
 * With nothing to shade, the province fills and the rest of the world go
 * transparent (ProvinceMap), so the imagery is the planet and only the borders
 * are drawn over it.
 */

import { useEffect, useMemo, useState } from "react";

import {
  loadNightlights,
  t,
  tilesFor,
  type Lang,
  type NightLayer,
  type NightStop,
  type Nightlights,
} from "../data/bundle";
import { LOCALE, formatInstant, stringsFor } from "../i18n";
import { LegendBox } from "../map/LegendBox";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const NIGHTLIGHTS_ID = "nightlights";

const SOURCE = "nasa_gibs";

/** A stop, and the layer it is drawn from. */
interface Stop {
  stop: NightStop;
  layer: NightLayer;
  composite: boolean;
}

/** "Mart 2024" / "March 2024" — the month, in the reader's own locale. */
function monthLabel(standsFor: string, lang: Lang): string {
  const [year, month] = standsFor.split("-").map(Number);
  return new Intl.DateTimeFormat(LOCALE[lang], {
    month: "long", year: "numeric", timeZone: "UTC",
  }).format(new Date(Date.UTC(year, month - 1, 1)));
}

/** What is on the globe, in words, with the caution that belongs to it. */
function NightlightsLegend({ at, lang }: { at: Stop; lang: Lang }) {
  const s = stringsFor(lang);
  return (
    <LegendBox title={t(at.layer.label, lang)}>
      <ul className="legend__bands">
        <li className="legend__band">
          <span className="legend__range">{at.composite ? s.nightlightsYear : s.nightlightsNight}</span>
          <span className="legend__count">
            {at.composite ? at.stop.stands_for : formatInstant(at.stop.date, lang)}
          </span>
        </li>
      </ul>
      <p className="legend__method">
        {at.composite ? s.nightlightsComposite : s.nightlightsCaution}
        <br />
        {at.layer.title}
        <br />
        {at.layer.attribution} — {s.nightlightsLive}
      </p>
    </LegendBox>
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

  // Every stop, composites first because they are older, each carrying the
  // layer it is drawn from. The key is the date, which is unique across both.
  const stops = useMemo(() => {
    if (!nightlights) return new Map<string, Stop>();
    const all: Stop[] = [
      ...nightlights.composites.map((stop) => ({ stop, layer: nightlights.black_marble, composite: true })),
      ...nightlights.dates.map((stop) => ({ stop, layer: nightlights.layer, composite: false })),
    ];
    return new Map(all.map((entry) => [`${NIGHTLIGHTS_ID}:${entry.stop.date}`, entry]));
  }, [nightlights]);

  const periods: Period[] = useMemo(
    () => [...stops.entries()].map(([key, entry]) => ({
      key,
      at: entry.stop.date,
      label: entry.composite ? `${entry.stop.stands_for} · Black Marble` : monthLabel(entry.stop.stands_for, lang),
    })),
    [stops, lang],
  );
  const period = snapPeriod(periods, clock);
  const at = period ? stops.get(period.key) ?? null : null;

  return {
    id: NIGHTLIGHTS_ID,
    group: "activity",
    label: s.overlayNightlights,
    sources: [SOURCE],
    periods,
    period,
    // Imagery, not figures: nothing to band, and the legend says what it is.
    values: null,
    raster: at
      ? {
          id: at.layer.id,
          tiles: tilesFor(at.layer, at.stop.date),
          maxZoom: at.layer.max_zoom,
          attribution: at.layer.attribution,
          opacity: 1,
        }
      : undefined,
    legend: at ? <NightlightsLegend at={at} lang={lang} /> : undefined,
    format: (value: number) => String(value),
    legendTitle: s.overlayNightlights,
    controls: nightlights ? (
      <p className="notice rail__note">
        {s.nightlightsRule}: {nightlights.composites.length} + {nightlights.dates.length}
      </p>
    ) : null,
    panel: () => <p className="notice">{s.nightlightsProvince}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : nightlights ? null : s.loading,
  };
}
