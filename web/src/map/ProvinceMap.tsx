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

import type { Geo, Lang, ProvinceProps } from "../data/bundle";

/** Türkiye, framed so the whole country sits in view at the opening zoom. */
const HOME = { center: [35.2, 39.0] as [number, number], zoom: 4.9 };

interface Props {
  geo: Geo;
  lang: Lang;
  selected: number | null;
  onSelect: (code: number | null, props: ProvinceProps | null) => void;
}

function ink(name: string, fallback: string): string {
  if (typeof window === "undefined") return fallback;
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
  return value || fallback;
}

export function ProvinceMap({ geo, lang, selected, onSelect }: Props) {
  const container = useRef<HTMLDivElement>(null);
  const map = useRef<maplibregl.Map | null>(null);
  const hovered = useRef<number | null>(null);
  const chosen = useRef<number | null>(null);

  // One effect builds the map; the language and selection effects below only
  // update it. Rebuilding on every prop change would reset the reader's pan.
  useEffect(() => {
    if (!container.current || map.current) return;

    const accent = ink("--accent-9", "#3b82f6");
    const surface = ink("--surface-2", "#16181d");
    const line = ink("--line", "#2a2e37");
    const waterColour = ink("--surface-1", "#0f1115");

    const instance = new maplibregl.Map({
      container: container.current,
      center: HOME.center,
      zoom: HOME.zoom,
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
              "fill-color": [
                "case",
                ["any", ["boolean", ["feature-state", "hover"], false], ["boolean", ["feature-state", "selected"], false]],
                accent,
                surface,
              ],
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

    map.current = instance;
    return () => {
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

  // The language does not change the map today — province labels arrive with
  // the first overlay — but the effect is here so the map is not rebuilt when
  // it does.
  useEffect(() => void lang, [lang]);

  return <div ref={container} className="map" />;
}
