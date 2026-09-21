/**
 * App.tsx — the map, the overlay on it, and what is known about a province.
 *
 * WHAT THIS FILE KNOWS
 *
 * Almost nothing. It holds the geometry, the palette, the reader's language,
 * which overlay is chosen and where the clock is — and then asks the chosen
 * overlay for values, a format, a legend title and a province panel. It does
 * not know that one of them is TÜİK's GDP and another is a YSK result; that
 * lives in overlays/, one module each (overlays/types.ts).
 *
 * ONE CLOCK FOR EVERY OVERLAY
 *
 * The slider sets a single instant and each overlay snaps its own periods to
 * it, so moving from the 2023 runoff to GDP per capita lands on 2023 rather
 * than on wherever that overlay was left (overlays/timeline.ts). Overlays added
 * later — migration by year, nightlights by month — join the same clock without
 * touching this file.
 *
 * Whatever is shaded goes through the same banding, the same ramp and the same
 * legend, so a reader learns one way of reading the map and it keeps working.
 * A province with no published figure is never drawn as zero (CLAUDE.md §10).
 */

import { useCallback, useEffect, useMemo, useState } from "react";

import {
  applyPalette,
  loadGeo,
  loadMeta,
  loadPalette,
  provinceName,
  type Geo,
  type Lang,
  type Meta,
  type Palette,
  type ProvinceProps,
} from "./data/bundle";
import { LANGUAGE_NAME, formatInt, initialLang, rememberLang, stringsFor } from "./i18n";
import { Legend } from "./map/Legend";
import { ProvinceMap } from "./map/ProvinceMap";
import { quantileBands } from "./map/bins";
import { DEFAULT_OVERLAY, useOverlays } from "./overlays";
import { OverlayRail } from "./overlays/OverlayRail";
import { TimeSlider } from "./overlays/TimeSlider";
import { clockOf, type Clock } from "./overlays/timeline";

export function App() {
  const [geo, setGeo] = useState<Geo | null>(null);
  const [meta, setMeta] = useState<Meta | null>(null);
  const [palette, setPalette] = useState<Palette | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [lang, setLang] = useState<Lang>(initialLang);
  const [activeId, setActiveId] = useState<string>(DEFAULT_OVERLAY);
  // Null until the reader moves it: every overlay then opens on its newest
  // period, which is the figure a reader arriving at the atlas should see.
  const [clock, setClock] = useState<Clock | null>(null);
  const [selected, setSelected] = useState<{ code: number; props: ProvinceProps } | null>(null);
  const s = stringsFor(lang);

  useEffect(() => {
    loadGeo().then(setGeo, (error: Error) => setFailed(error.message));
    loadMeta().then(setMeta, () => undefined);
    // The palette is data, not chrome: read it rather than keeping a second,
    // unvalidated copy of its colours in CSS.
    loadPalette().then((loaded) => {
      applyPalette(loaded);
      setPalette(loaded);
    }, () => undefined);
  }, []);

  useEffect(() => {
    document.documentElement.lang = lang;
    rememberLang(lang);
  }, [lang]);

  // The selection is part of what an overlay is given: a flow overlay answers
  // a question about one province (overlays/types.ts).
  const overlays = useOverlays({ lang, clock, activeId, selected: selected?.code ?? null });
  // `??` rather than a lookup that can fail: the rail can only offer what this
  // list contains, and an unknown id falls back to the first overlay.
  const overlay = overlays.find((entry) => entry.id === activeId) ?? overlays[0];

  /**
   * Every province, then whatever the overlay has for it.
   *
   * The overlays only know their own subject — the airports overlay knows the
   * 52 provinces with an airport in them, not the 29 without — and a province
   * left out of the map entirely gets no band AND no line in the legend, so it
   * is painted "no figure" with nothing saying why. Filling the collection here
   * makes the legend total over all 81 (CLAUDE.md §10), once, for every overlay
   * there will ever be.
   */
  const values = useMemo(() => {
    if (!overlay.values) return null;
    if (!geo) return overlay.values;
    const all = new Map<number, number | null>();
    for (const feature of geo.provinces.features ?? []) {
      all.set(Number((feature.properties as { code: number }).code), null);
    }
    for (const [plaka, value] of overlay.values) all.set(plaka, value);
    return all;
  }, [overlay.values, geo]);

  const binning = useMemo(
    () => (values ? quantileBands(values, palette?.sequential.steps.length ?? 6) : null),
    [values, palette],
  );

  const onSelect = useCallback((code: number | null, props: ProvinceProps | null) => {
    setSelected(code === null || !props ? null : { code, props });
  }, []);

  return (
    <div className="app">
      <header className="app__bar">
        <div>
          <h1 className="app__title">{s.title}</h1>
          <p className="app__subtitle">{s.subtitle}</p>
        </div>

        <div className="app__langs" role="group" aria-label="Language">
          {(["tr", "en"] as const).map((code) => (
            <button key={code} type="button"
                    className={code === lang ? "lang lang--on" : "lang"}
                    aria-pressed={code === lang}
                    onClick={() => setLang(code)}>
              {LANGUAGE_NAME[code]}
            </button>
          ))}
        </div>
      </header>

      <main className="app__body">
        <OverlayRail
          overlays={overlays}
          activeId={overlay.id}
          onPick={setActiveId}
          publisher={(source) => meta?.sources[source]?.publisher ?? ""}
          lang={lang}
        />

        <section className="app__stage">
          <div className="app__map">
            {failed ? (
              <p className="notice notice--bad">{s.failed}: {failed}</p>
            ) : geo ? (
              <>
                <ProvinceMap
                  geo={geo}
                  lang={lang}
                  selected={selected?.code ?? null}
                  onSelect={onSelect}
                  binning={binning}
                  ramp={palette?.sequential.steps ?? []}
                  flows={overlay.flows ?? []}
                  markers={overlay.markers ?? []}
                  network={overlay.network ?? []}
                  focus={overlay.focus}
                />
                {/* An overlay that shades nothing brings its own key; one that
                    shades brings bands, and the shared legend explains them. */}
                {overlay.legend ? overlay.legend
                  : binning && palette ? (
                  <Legend
                    binning={binning}
                    ramp={palette.sequential.steps}
                    title={overlay.legendTitle}
                    format={overlay.format}
                    lang={lang}
                  />
                ) : (
                  <p className="notice legend legend--empty">{overlay.unavailable ?? s.loading}</p>
                )}
              </>
            ) : (
              <p className="notice">{s.loading}</p>
            )}
          </div>

          <TimeSlider
            periods={overlay.periods}
            period={overlay.period}
            onPick={(period) => setClock(clockOf(period))}
            lang={lang}
          />
        </section>

        <aside className="app__panel">
          {selected ? (
            <>
              <h2 className="panel__name">{provinceName(selected.props, lang)}</h2>
              <dl className="panel__facts">
                <dt>{s.plaka}</dt>
                <dd>{formatInt(selected.code, lang)}</dd>
              </dl>
              {overlay.panel(selected.code)}
            </>
          ) : (
            <p className="notice">{s.noSelection}</p>
          )}
          <footer className="panel__sources">
            <h3>{s.sources}</h3>
            <p>{s.geometrySource}</p>
            {/* One line per publisher AND licence, not per source card: TÜİK's
                GDP bulletin and its migration portal are two sources under one
                name and one set of terms, and saying so twice reads as a bug.
                Every card is still represented — the line is just shared. */}
            {meta
              ? [...new Map(Object.values(meta.sources).map((source) => [
                  `${source.publisher}|${source.licence}`, source,
                ])).values()].map((source) => (
                  <p key={`${source.publisher}|${source.licence}`}>
                    {source.publisher} — {meta.licences[source.licence]?.name ?? source.licence}
                  </p>
                ))
              : <p>{s.dataComingSoon}</p>}
          </footer>
        </aside>
      </main>
    </div>
  );
}
