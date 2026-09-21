/**
 * style.ts — the MapLibre style this atlas draws, as a value.
 *
 * WHY THIS IS NOT INSIDE THE COMPONENT ANY MORE
 *
 * A style is validated by MapLibre when the map is built, and an invalid one is
 * REFUSED WHOLE: no layers, no sources, a blank map, and one line in a console
 * nobody is watching. It happened here — a `["zoom"]` nested inside a `case`,
 * which MapLibre allows only at the top of an expression — and it was invisible
 * in a preview pane that was not painting anyway.
 *
 * As a value it can be handed to the style specification's own validator in a
 * test (style.test.ts), which is the only way to know a map draws without
 * looking at it.
 *
 * The colours come from the palette through CSS custom properties, so the style
 * cannot hold a colour the validated palette does not (CLAUDE.md §9). Outside a
 * browser — in that test — each falls back to the value the palette records.
 */

import type { StyleSpecification } from "maplibre-gl";

import type { Geo } from "../data/bundle";

/** One CSS custom property's value, or the fallback the palette records. */
export function ink(name: string, fallback: string): string {
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
export function fillColour(accent: string, noFigure: string, ramp: string[]) {
  const bands = ramp.flatMap((hex, index) => [index, hex]);
  return [
    "case",
    ["boolean", ["feature-state", "selected"], false], accent,
    ["boolean", ["feature-state", "hover"], false], accent,
    bands.length
      ? ["match", ["coalesce", ["feature-state", "band"], -1], ...bands, noFigure]
      : noFigure,
  ] as never;
}

/** The whole style, built from the geometry the app has loaded. */
export function mapStyle(geo: Geo): StyleSpecification {
  const accent = ink("--accent-9", "#0090ff");
  const surface = ink("--surface-2", "#222222");
  const line = ink("--line", "#3a3a3a");
  const waterColour = ink("--surface-1", "#191919");
  const noFigure = ink("--no-figure", "#2a2a2a");

  return {
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
  } as StyleSpecification;
}
