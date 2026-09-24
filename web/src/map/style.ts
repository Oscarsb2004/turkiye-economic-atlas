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
 * The colour a published line takes for its palette slot.
 *
 * Tone 0 is the muted line a network is drawn in when nothing distinguishes
 * it; 1..5 are the palette's five validated slots, and there is no sixth
 * (CLAUDE.md §9). Exported because a legend has to name the same colours the
 * map draws — two lists of hexes that drift apart is a legend that lies.
 */
export function toneInk(tone: number): string {
  switch (tone) {
    case 1: return ink("--series-1", "#0090ff");
    case 2: return ink("--series-2", "#a35829");
    case 3: return ink("--series-3", "#46a758");
    case 4: return ink("--series-4", "#d6409f");
    case 5: return ink("--series-5", "#6e56cf");
    default: return ink("--text-2", "#b4b4b4");
  }
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
  const land = ink("--map-land", "#161d29");
  const border = ink("--map-border", "#2b3547");
  const line = ink("--line", "#3a3a3a");
  const waterColour = ink("--map-ocean", "#050b16");
  const noFigure = ink("--no-figure", "#2a2a2a");

  return {
  version: 8,
  // ALWAYS A GLOBE
  //
  // `vertical-perspective` at every zoom, not MapLibre's own "globe" preset —
  // that one hands over to Web Mercator past zoom 10, which is the flat square
  // of the world the owner asked never to see again. Nothing this atlas draws
  // is detailed enough for the globe's precision limit to show before that.
  projection: { type: "vertical-perspective" },
  // The thin blue edge of the planet, seen from space, lit from one side the
  // way a planet is. Tried lit from the front: the atmosphere then hazes the
  // WHOLE disk and washes the choropleth out, which is decoration winning over
  // data. Gone by the time a province fills the screen.
  sky: {
    "sky-color": "#0b1d3a",
    "horizon-color": "#2c5b9e",
    "fog-color": "#0b1d3a",
    "atmosphere-blend": ["interpolate", ["linear"], ["zoom"], 0, 0.8, 3, 0.6, 6, 0],
  },
  sources: {
    world: { type: "geojson", data: geo.world },
    turkiye: { type: "geojson", data: geo.turkiye },
    // The plaka code becomes the feature id, so feature-state and every
    // future data join key on the same number.
    provinces: { type: "geojson", data: geo.provinces, promoteId: "code" },
    water: { type: "geojson", data: geo.water },
    // The reference road network. In the style from the start and hidden, so
    // turning it on is a layout property rather than a source being added to a
    // live map — which is the operation that needs the style to be ready.
    roads: { type: "geojson", data: geo.roads },
    // Both empty until an overlay has something to put in them; the
    // effects below set their data.
    flows: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    markers: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
    network: { type: "geojson", data: { type: "FeatureCollection", features: [] } },
  },
  layers: [
    { id: "background", type: "background", paint: { "background-color": waterColour } },
    { id: "world", type: "fill", source: "world", paint: { "fill-color": land, "fill-opacity": 1 } },
    { id: "world-line", type: "line", source: "world", paint: { "line-color": border, "line-width": 0.6 } },
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
    // The roads a reader turns on to find out where they are looking. Over
    // the province fills, under everything this atlas publishes as a subject:
    // it is there to locate the other layers, not to compete with them.
    {
      id: "roads",
      type: "line",
      source: "roads",
      layout: { visibility: "none", "line-cap": "round", "line-join": "round" },
      paint: {
        "line-color": ink("--text-3", "#7c7c7c"),
        // Natural Earth's own class, drawn heavier for the bigger road. ZOOM
        // IS THE OUTSIDE of the expression; a `["zoom"]` nested inside the
        // match would have MapLibre refuse the whole style (see above).
        "line-width": ["interpolate", ["linear"], ["zoom"],
                       4, ["match", ["get", "kind"],
                           "Major Highway", 0.9, "Secondary Highway", 0.6, 0.4],
                       10, ["match", ["get", "kind"],
                            "Major Highway", 3.4, "Secondary Highway", 2.2, 1.4]],
        "line-opacity": 0.8,
      },
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
        "line-color": [
          "match", ["get", "tone"],
          1, toneInk(1), 2, toneInk(2), 3, toneInk(3), 4, toneInk(4), 5, toneInk(5),
          toneInk(0),
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
