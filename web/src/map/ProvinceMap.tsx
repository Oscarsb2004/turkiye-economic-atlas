/**
 * ProvinceMap.tsx — Türkiye's 81 provinces, and nothing it has not been given.
 *
 * The fill is deliberately NEUTRAL here. A province takes a colour only when
 * the reader hovers or selects it, because at T2 there is no published figure
 * to shade it by, and a map that colours provinces before it has data is
 * inventing a story. The data-driven fill arrives with the first overlay
 * (docs/PLAN.md, T4), at which point this layer's paint becomes an expression
 * over the joined value and the legend says what the shades mean.
 *
 * WHY feature-state AND NOT setPaintProperty
 *
 * Hover and selection are per-feature state, not per-layer paint. Setting paint
 * on every mouse move would rebuild the style and repaint 81 polygons; a
 * feature-state expression repaints one. `promoteId` makes the plaka code the
 * feature id, so the state key is the same number everything else joins on.
 */

import maplibregl from "maplibre-gl";
import { useEffect, useRef } from "react";

import type { Flow, Geo, GeoJson, Lang, Marker, NetworkLine, ProvinceProps } from "../data/bundle";
import type { Binning } from "./bins";

/** Where the map looks if the geometry cannot say — it always can, in practice. */
const HOME = { center: [35.2, 39.0] as [number, number], zoom: 4.9 };

/**
 * The extent of a published geometry.
 *
 * The opening view is FITTED to the country rather than set to a zoom chosen by
 * hand, because the map pane is not a fixed width: the overlay rail took 220px
 * of it, and a hardcoded zoom cropped the east of the country as soon as it
 * did. Fitting derives the framing from the geometry the atlas actually ships.
 */
function extentOf(geo: GeoJson): [number, number, number, number] | null {
  let west = 180, south = 90, east = -180, north = -90;
  let seen = false;
  const walk = (node: unknown): void => {
    if (!Array.isArray(node)) return;
    if (typeof node[0] === "number" && typeof node[1] === "number") {
      const [lon, lat] = node as [number, number];
      west = Math.min(west, lon); east = Math.max(east, lon);
      south = Math.min(south, lat); north = Math.max(north, lat);
      seen = true;
      return;
    }
    for (const child of node) walk(child);
  };
  for (const feature of geo.features) {
    walk((feature.geometry as { coordinates?: unknown }).coordinates);
  }
  return seen ? [west, south, east, north] : null;
}

interface Props {
  geo: Geo;
  lang: Lang;
  selected: number | null;
  onSelect: (code: number | null, props: ProvinceProps | null) => void;
  /** Which shade each province takes, or null before any figures are loaded. */
  binning: Binning | null;
  /** The sequential ramp from the validated palette. */
  ramp: string[];
  /**
   * Flows to draw between provinces, or none.
   *
   * The overlay decides WHICH flows and how big (overlays/types.ts); the ends
   * are this map's business, because it is the half that holds the geometry.
   */
  flows: Flow[];
  /** Places to draw, sized by their figure: airports today, stations later. */
  markers: Marker[];
  /** Published lines to draw as they are: the railway, and later a corridor. */
  network: NetworkLine[];
  /**
   * [west, south, east, north] to frame, or none for the whole country.
   *
   * An overlay about one city has to be able to say so; leaving the reader
   * over İstanbul when they switch back to a national overlay would be worse.
   */
  focus?: number[];
}

/**
 * The markers, as GeoJSON, sized by AREA rather than by radius.
 *
 * A circle whose radius is proportional to its figure looks like the square of
 * it: İstanbul against Sinop is 1 100 times the passengers, which as a radius
 * is a disc that swallows the country. The square root puts the figure in the
 * area, which is how a reader actually reads a circle.
 *
 * `r` is relative to the largest on screen, so sizes compare within one reading
 * and never across years — the same rule the flow widths follow.
 */
function markersOf(markers: Marker[]): GeoJson {
  // A marker with no figure against it gets r = 0, which the paint draws at its
  // smallest radius: a place, not a quantity (data/bundle.ts, Marker.value).
  const most = Math.max(1, ...markers.map((marker) => marker.value ?? 0));
  return {
    type: "FeatureCollection",
    features: markers.map((marker) => ({
      type: "Feature" as const,
      properties: {
        r: marker.value ? Math.sqrt(marker.value / most) : 0,
        label: marker.label,
        value: marker.value ?? null,
      },
      geometry: { type: "Point" as const, coordinates: marker.point },
    })),
  } as GeoJson;
}

/** Published lines, as they were published, each carrying its palette slot. */
function networkOf(lines: NetworkLine[]): GeoJson {
  return {
    type: "FeatureCollection",
    features: lines.map((line) => ({
      type: "Feature" as const,
      properties: { tone: line.tone ?? 0 },
      geometry: { type: "LineString" as const, coordinates: line.line },
    })),
  } as GeoJson;
}

/**
 * The arcs, as GeoJSON, between the provinces' own inner points.
 *
 * `points.json` carries a point INSIDE each province, built from the same
 * simplified polygons (scripts/build_geo.mjs), so an arc leaves the province it
 * says it leaves rather than a bounding box's middle — which for Muğla or
 * Hatay is out at sea.
 *
 * A flow whose province has no point is DROPPED rather than drawn from
 * somewhere plausible. `w` is the flow against the largest flow on screen, so
 * the widths compare within one reading and never across years.
 */
function arcsOf(points: GeoJson, flows: Flow[]): GeoJson {
  const at = new Map<number, [number, number]>();
  for (const feature of points.features ?? []) {
    const code = Number((feature.properties as { code?: number } | null)?.code);
    const where = (feature.geometry as { coordinates?: unknown })?.coordinates;
    if (Number.isFinite(code) && Array.isArray(where) && where.length >= 2) {
      at.set(code, [Number(where[0]), Number(where[1])]);
    }
  }
  const most = Math.max(1, ...flows.map((flow) => flow.value));
  return {
    type: "FeatureCollection",
    features: flows.flatMap((flow) => {
      const from = at.get(flow.from);
      const to = at.get(flow.to);
      if (!from || !to) return [];
      return [{
        type: "Feature" as const,
        properties: { w: flow.value / most, tone: flow.tone, value: flow.value },
        geometry: { type: "LineString" as const, coordinates: [from, to] },
      }];
    }),
  } as GeoJson;
}

function ink(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

/**
 * What colour a province takes.
 *
 * Selection and hover win, so a reader pointing at a province always sees which
 * one they are pointing at, whatever it is shaded. Below that the band decides.
 * A province with no band — none published — falls through to `noFigure` and is
 * never painted as the lowest shade (CLAUDE.md §10). With no ramp yet, every
 * province falls through, which is the neutral map T2 shipped.
 */
function fillColour(accent: string, noFigure: string, ramp: string[]) {
  const bands = ramp.flatMap((hex, index) => [index, hex]);
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false], accent,
    ["boolean", ["feature-state", "hover"], false], accent,
    bands.length
      ? ["match", ["coalesce", ["feature-state", "band"], -1], ...bands, noFigure]
      : noFigure,
  ] as unknown as maplibregl.ExpressionSpecification;
}

/**
 * Put data on a source as soon as the source exists, and never wait for "load".
 *
 * THE TRAP, WHICH COST AN HOUR
 *
 * `map.once("load", ...)` sounds like "when the map is ready". It is not: the
 * load event needs a rendered FRAME, and a browser pane that is hidden gives no
 * animation frames at all — `map.loaded()` and `isStyleLoaded()` both stay
 * false indefinitely while the style, the sources and the paint are all fine.
 * Flows and markers queued behind "load" then never appear, silently, on a map
 * that is otherwise drawing correctly (the province shading survived because it
 * listens for `sourcedata` instead).
 *
 * `getSource` answers as soon as the style's sources are registered, which does
 * not need a frame, so the rule is: try now, and retry on `styledata` until it
 * answers. Returns the cleanup for the listener it may have added.
 */
function feedSource(instance: maplibregl.Map, id: string, data: GeoJson): () => void {
  const apply = () => {
    const source = instance.getSource(id) as maplibregl.GeoJSONSource | undefined;
    if (!source) return false;
    source.setData(data as never);
    return true;
  };
  if (apply()) return () => undefined;
  const retry = () => {
    if (apply()) instance.off("styledata", retry);
  };
  instance.on("styledata", retry);
  return () => instance.off("styledata", retry);
}


export function ProvinceMap({ geo, lang, selected, onSelect, binning, ramp, flows, markers, network, focus }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const hovered = useRef<number | null>(null);
  const chosen = useRef<number | null>(null);

  // One effect builds the map; the language and selection effects below only
  // update it. Rebuilding on every prop change would reset the reader's pan.
  useEffect(() => {
    if (!container.current || map.current) return;

    const accent = ink("--accent-9", "#0090ff");
    const surface = ink("--surface-2", "#222222");
    const line = ink("--line", "#3a3a3a");
    const waterColour = ink("--surface-1", "#191919");
    const noFigure = ink("--no-figure", "#2a2a2a");

    const extent = extentOf(geo.turkiye);
    const instance = new maplibregl.Map({
      container: container.current,
      ...(extent
        ? { bounds: extent, fitBoundsOptions: { padding: 16 } }
        : { center: HOME.center, zoom: HOME.zoom }),
      attributionControl: false,
      style: {
        version: 8,
        sources: {
          world: { type: "geojson", data: geo.world },
          turkiye: { type: "geojson", data: geo.turkiye },
          // The plaka code becomes the feature id, so feature-state and every
          // future data join key on the same number.
          provinces: { type: "geojson", data: geo.provinces, promoteId: "code" },
          water: { type: "geojson", data: geo.water },
          // Both empty until an overlay has something to put in them; the
          // effects below set their data.
          flows: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
          markers: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
          network: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
        },
        layers: [
          { id: "background", type: "background", paint: { "background-color": waterColour } },
          { id: "world", type: "fill", source: "world", paint: { "fill-color": surface, "fill-opacity": 0.45 } },
          { id: "world-line", type: "line", source: "world", paint: { "line-color": line, "line-width": 0.6 } },
          {
            id: "provinces-fill",
            type: "fill",
            source: "provinces",
            paint: {
              "fill-color": fillColour(accent, noFigure, []),
              "fill-opacity": ["interpolate", ["linear"], ["zoom"], 4, 0.85, 7, 0.95],
            },
          },
          { id: "provinces-line", type: "line", source: "provinces", paint: { "line-color": line, "line-width": 0.7 } },
          // Lakes sit OVER the province fill: Van is not land, and at this
          // simplification the province polygons cover it.
          { id: "water", type: "fill", source: "water", paint: { "fill-color": waterColour, "fill-opacity": 0.9 } },
          {
            id: "turkiye-outline",
            type: "line",
            source: "turkiye",
            paint: { "line-color": ink("--text-2", "#9aa3b2"), "line-width": 1.4 },
          },
          // Flows sit above everything: they are the answer to a question the
          // reader asked by selecting a province.
          {
            id: "flows",
            type: "line",
            source: "flows",
            layout: { "line-cap": "round" },
            paint: {
              // Two data colours from the validated palette: one for what came
              // in, one for what left (CLAUDE.md §9 — --series-* is data).
              // Slots 3 and 2 rather than 1, which is the accent a selected
              // province is already painted in.
              "line-color": [
                "match", ["get", "tone"],
                "in", ink("--series-3", "#46a758"),
                ink("--series-2", "#a35829"),
              ],
              "line-width": ["interpolate", ["linear"], ["get", "w"], 0, 1, 1, 7],
              "line-opacity": 0.85,
            },
          },
          // A published network, under the markers that sit on it. High-speed
          // is drawn heavier and in its own colour, because that distinction is
          // the point of the layer and it is a published tag, not our judgement.
          {
            id: "network",
            type: "line",
            source: "network",
            layout: { "line-cap": "round", "line-join": "round" },
            paint: {
              // Tone 0 is the muted line a network is drawn in when nothing
              // distinguishes it; 1..5 are the palette's five validated slots,
              // and there is no sixth (CLAUDE.md §9).
              "line-color": [
                "match", ["get", "tone"],
                1, ink("--series-1", "#0090ff"),
                2, ink("--series-2", "#a35829"),
                3, ink("--series-3", "#46a758"),
                4, ink("--series-4", "#d6409f"),
                5, ink("--series-5", "#6e56cf"),
                ink("--text-2", "#b4b4b4"),
              ],
              "line-width": ["interpolate", ["linear"], ["zoom"],
                             4, ["case", ["==", ["get", "tone"], 0], 1.1, 2.2],
                             9, ["case", ["==", ["get", "tone"], 0], 2.4, 5]],
              "line-opacity": 0.9,
            },
          },
          // Places, over everything: a marker is a published figure about a
          // point, not about the province it happens to sit in.
          {
            id: "markers",
            type: "circle",
            source: "markers",
            paint: {
              // r = 0 is a place with no figure against it — 1 334 railway
              // stations are, and at that many a dot with a heavy ring reads as
              // a dotted line and hides the railway it is sitting on. Those grow
              // with the zoom instead: a texture on the line from far away, a
              // station you can point at once you are close.
              //
              // ZOOM HAS TO BE THE OUTSIDE OF THE EXPRESSION. MapLibre refuses
              // a style where ["zoom"] sits inside anything but a top-level
              // step or interpolate — and refusing the style means no layers at
              // all, so the map draws nothing and the console says why once.
              "circle-radius": [
                "interpolate", ["linear"], ["zoom"],
                4, ["case", ["==", ["get", "r"], 0], 1.6, ["+", 4, ["*", 18, ["get", "r"]]]],
                9, ["case", ["==", ["get", "r"], 0], 5, ["+", 4, ["*", 18, ["get", "r"]]]],
              ],
              // Slot 4 of the validated palette: the ramp under it is blue, and
              // a marker has to be a different thing at a glance (CLAUDE.md §9).
              "circle-color": ink("--series-4", "#d6409f"),
              "circle-opacity": 0.65,
              "circle-stroke-color": ink("--text-1", "#eeeeee"),
              "circle-stroke-width": ["case", ["==", ["get", "r"], 0], 0.4, 0.75],
            },
          },
        ],
      },
    });

    instance.addControl(new maplibregl.NavigationControl({ showCompass: false }), "top-right");
    instance.on("mousemove", "provinces-fill", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const code = Number(feature.id);
      if (hovered.current === code) return;
      if (hovered.current !== null) {
        instance.setFeatureState({ source: "provinces", id: hovered.current }, { hover: false });
      }
      hovered.current = code;
      instance.setFeatureState({ source: "provinces", id: code }, { hover: true });
      instance.getCanvas().style.cursor = "pointer";
    });
    instance.on("mouseleave", "provinces-fill", () => {
      if (hovered.current !== null) {
        instance.setFeatureState({ source: "provinces", id: hovered.current }, { hover: false });
      }
      hovered.current = null;
      instance.getCanvas().style.cursor = "";
    });
    instance.on("click", "provinces-fill", (event) => {
      const feature = event.features?.[0];
      if (!feature) return;
      const code = Number(feature.id);
      onSelect(code, feature.properties as unknown as ProvinceProps);
    });
    // A click on the sea clears the selection, so there is always a way out.
    instance.on("click", (event) => {
      const hits = instance.queryRenderedFeatures(event.point, { layers: ["provinces-fill"] });
      if (hits.length === 0) onSelect(null, null);
    });

    // MapLibre sizes its canvas once and does not watch its container, so a
    // pane that changes width leaves the map drawing at the old size — the
    // country slides out of frame without anything erroring. Observing the
    // container keeps the two in step, and resize() also gives the map the
    // paint it needs after a spell where the page was not drawing at all.
    const observer = new ResizeObserver(() => instance.resize());
    observer.observe(container.current);

    map.current = instance;
    // A handle for the console while developing, and nothing in a build: the
    // "load never fires in a hidden pane" bug above was invisible without one.
    if (import.meta.env.DEV) (window as unknown as { __map?: unknown }).__map = instance;
    return () => {
      observer.disconnect();
      instance.remove();
      map.current = null;
    };
  }, [geo, onSelect]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    if (chosen.current !== null) {
      instance.setFeatureState({ source: "provinces", id: chosen.current }, { selected: false });
    }
    chosen.current = selected;
    if (selected !== null) {
      instance.setFeatureState({ source: "provinces", id: selected }, { selected: true });
    }
  }, [selected]);

  // The ramp arrives with palette.json, after the map is already on screen, so
  // the paint is updated rather than the map rebuilt — rebuilding would throw
  // away the reader's pan and zoom.
  useEffect(() => {
    const instance = map.current;
    if (!instance || ramp.length === 0) return;
    const apply = () => instance.setPaintProperty(
      "provinces-fill", "fill-color",
      fillColour(ink("--accent-9", "#0090ff"), ink("--no-figure", "#2a2a2a"), ramp),
    );
    if (instance.isStyleLoaded()) apply();
    else instance.once("load", apply);
  }, [ramp]);

  // Each province's band, as feature-state. Set per feature rather than baked
  // into the source, so changing currency or year repaints without rebuilding
  // the GeoJSON.
  //
  // WAITING FOR THE SOURCE, NOT THE STYLE
  //
  // `isStyleLoaded()` goes true while a GeoJSON source is still parsing, and
  // feature state set before its source has data is dropped without an error.
  // The map then paints every province in the "no figure" colour, which is a
  // plausible-looking map of nothing: shades gone, legend intact, console
  // clean. It survived a first look only because the source happened to win
  // the race that time.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const apply = () => {
      for (const feature of geo.provinces.features ?? []) {
        const plaka = Number((feature.properties as { code: number }).code);
        const band = binning?.byProvince.get(plaka);
        instance.setFeatureState(
          { source: "provinces", id: plaka },
          // undefined would leave the previous band in place; null is what the
          // expression's coalesce reads as "no figure published".
          { band: band === undefined ? null : band },
        );
      }
    };

    if (instance.isStyleLoaded() && instance.isSourceLoaded("provinces")) {
      apply();
      return;
    }
    const whenReady = () => {
      if (!instance.isStyleLoaded() || !instance.isSourceLoaded("provinces")) return;
      apply();
      instance.off("sourcedata", whenReady);
    };
    instance.on("sourcedata", whenReady);
    return () => {
      instance.off("sourcedata", whenReady);
    };
  }, [binning, geo]);

  // Where the map is looking. An overlay that is about one city says so with a
  // focus; without one the frame is the country, so switching back comes back.
  const framed = useRef<string>("");
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    const extent = (focus && focus.length === 4 ? focus : extentOf(geo.turkiye)) as
      [number, number, number, number] | null;
    if (!extent) return;
    const key = extent.join(",");
    if (framed.current === key) return;
    // The first framing is the one the map was built with; only a CHANGE moves
    // the reader, and never while they are reading the same overlay.
    if (framed.current !== "") instance.fitBounds(extent, { padding: 24, duration: 600 });
    framed.current = key;
  }, [focus, geo]);

  // The flows for the selected province, and the places an overlay wants drawn.
  // Both go on their source rather than into the style, so drawing them never
  // disturbs the reader's pan or zoom.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    return feedSource(instance, "flows", arcsOf(geo.points, flows));
  }, [flows, geo]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    return feedSource(instance, "markers", markersOf(markers));
  }, [markers]);

  useEffect(() => {
    const instance = map.current;
    if (!instance) return;
    return feedSource(instance, "network", networkOf(network));
  }, [network]);

  // The language does not change the map today — province labels arrive with
  // the first overlay — but the effect is here so the map is not rebuilt when
  // it does.
  useEffect(() => void lang, [lang]);

  return <div ref={container} className="map" />;
}
