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
  loadPlaces,
  loadRoads,
  provinceName,
  t,
  type Geo,
  type GeoJson,
  type Lang,
  type Meta,
  type Palette,
  type Places,
  type ProvinceProps,
} from "./data/bundle";
import { BaseLayer } from "./BaseLayer";
import { LANGUAGE_NAME, formatInt, initialLang, rememberLang, stringsFor } from "./i18n";
import { Sources } from "./Sources";
import { Legend } from "./map/Legend";
import { ProvinceMap, type PlaceLabel } from "./map/ProvinceMap";
import { quantileBands } from "./map/bins";
import { shadingOfBands, shadingOfClasses } from "./map/shading";
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
  // The rail and the province panel are both chrome around the map, and on a
  // laptop they are half its width between them. The rail folds by choice; the
  // panel is simply not there until the reader has picked a province to read.
  const [railOpen, setRailOpen] = useState(true);
  // The reference layer, which is not an overlay: place names and roads have to
  // be available UNDER whatever is on screen (BaseLayer.tsx). Its data is
  // fetched the first time it is switched on, and never before.
  const [basemap, setBasemap] = useState(false);
  const [places, setPlaces] = useState<Places | null>(null);
  const [roads, setRoads] = useState<GeoJson | null>(null);
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

  useEffect(() => {
    if (!basemap) return;
    // A failed reference layer leaves the map without names or roads on it,
    // which is the state it was in a moment ago; not worth an error over it.
    if (!places) loadPlaces().then(setPlaces, () => undefined);
    if (!roads) loadRoads().then(setRoads, () => undefined);
  }, [basemap, places, roads]);

  /** The names to draw, in the reader's language, or none while it is off. */
  const labels: PlaceLabel[] = useMemo(() => {
    if (!basemap || !places) return [];
    return places.places.map((place) => ({
      id: place.id,
      label: t(place.name, lang),
      population: place.population,
      point: place.point,
    }));
  }, [basemap, places, lang]);

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

  /**
   * What colour each province takes, whichever question the overlay is asking.
   *
   * An amount goes through the quantile bands and the sequential ramp; a class
   * — which party led a province — goes through the palette's five categorical
   * slots. Both arrive at the map as an index and a list of colours, so the map
   * draws one thing and this is the only place that knows there are two
   * (map/shading.ts).
   */
  const shading = useMemo(() => {
    if (overlay.classes) return shadingOfClasses(overlay.classes);
    if (binning && palette) return shadingOfBands(binning, palette.sequential.steps);
    return null;
  }, [overlay.classes, binning, palette]);

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

      <main className={[
        "app__body",
        selected ? "app__body--panel" : "",
        railOpen ? "" : "app__body--folded",
      ].filter(Boolean).join(" ")}>
        <OverlayRail
          overlays={overlays}
          activeId={overlay.id}
          onPick={setActiveId}
          publisher={(source) => meta?.sources[source]?.publisher ?? ""}
          open={railOpen}
          onToggle={() => setRailOpen((open) => !open)}
          chrome={
            <BaseLayer
              on={basemap}
              onToggle={setBasemap}
              labelled={basemap && places ? places.places.length : null}
              lang={lang}
            />
          }
          sources={<Sources meta={meta} lang={lang} />}
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
                  shading={shading}
                  hint={overlay.hint}
                  flows={overlay.flows ?? []}
                  markers={overlay.markers ?? []}
                  network={overlay.network ?? []}
                  focus={overlay.focus}
                  raster={overlay.raster}
                  roads={basemap ? roads : null}
                  places={labels}
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
                    bands={overlay.bands}
                    extra={overlay.legendExtra}
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

        {/* No province, no panel: an empty box saying "select a province" is
            320px of the map spent telling the reader what the cursor already
            tells them. The credits moved to the rail, where they are always
            present rather than behind a click (Sources.tsx). */}
        {selected && (
          <aside className="app__panel">
            <h2 className="panel__name">{provinceName(selected.props, lang)}</h2>
            <dl className="panel__facts">
              <dt>{s.plaka}</dt>
              <dd>{formatInt(selected.code, lang)}</dd>
            </dl>
            {overlay.panel(selected.code)}
          </aside>
        )}
      </main>
    </div>
  );
}
