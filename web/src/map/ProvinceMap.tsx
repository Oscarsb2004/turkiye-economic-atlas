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

import type { Flow, Geo, GeoJson, Lang, ProvinceProps } from "../data/bundle";
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

export function ProvinceMap({ geo, lang, selected, onSelect, binning, ramp, flows }: Props) {
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
          // Empty until a province is selected; the effect below sets its data.
          flows: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
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

  // The flows for the selected province. Set on the source rather than rebuilt
  // into the style, so drawing them never disturbs the reader's pan or zoom.
  useEffect(() => {
    const instance = map.current;
    if (!instance) return;

    const apply = () => {
      const source = instance.getSource("flows") as maplibregl.GeoJSONSource | undefined;
      source?.setData(arcsOf(geo.points, flows) as never);
    };
    if (instance.isStyleLoaded()) {
      apply();
      return;
    }
    instance.once("load", apply);
  }, [flows, geo]);

  // The language does not change the map today — province labels arrive with
  // the first overlay — but the effect is here so the map is not rebuilt when
  // it does.
  useEffect(() => void lang, [lang]);

  return <div ref={container} className="map" />;
}
