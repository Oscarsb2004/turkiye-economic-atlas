/**
 * The style the map draws, checked by the style specification's own validator.
 *
 * MapLibre refuses an invalid style WHOLE: no layers, no sources, a blank map
 * and one line in a console nobody is watching. It happened — a `["zoom"]`
 * nested inside a `case`, which the spec allows only at the top of an
 * expression — and no other test could see it, because every other test is
 * about data and the map is about paint.
 */

import { validateStyleMin } from "@maplibre/maplibre-gl-style-spec";
import { describe, expect, it } from "vitest";

import type { Geo, GeoJson } from "../data/bundle";
import { fillColour, mapStyle } from "./style";

const EMPTY: GeoJson = { type: "FeatureCollection", features: [] };
const GEO: Geo = { provinces: EMPTY, points: EMPTY, turkiye: EMPTY, world: EMPTY, water: EMPTY };

describe("the map's style", () => {
  it("is a style the specification accepts", () => {
    const errors = validateStyleMin(mapStyle(GEO) as never);
    expect(errors.map((error) => `${error.message}`)).toEqual([]);
  });

  it("carries every layer the overlays draw into", () => {
    const layers = mapStyle(GEO).layers.map((layer) => layer.id);
    // Each of these is fed by an effect in ProvinceMap; a renamed layer would
    // leave that effect writing to nothing.
    expect(layers).toContain("provinces-fill");
    expect(layers).toContain("flows");
    expect(layers).toContain("markers");
    expect(layers).toContain("network");
    // The reference layer is in the style from the start and hidden, so a
    // rename here would leave the base-layer switch toggling nothing.
    expect(layers).toContain("roads");
  });

  it("still validates once a ramp is painted into the province fill", () => {
    // The fill expression is rebuilt when the palette arrives, which is a
    // second style the validator never sees at start-up.
    const style = mapStyle(GEO);
    const fill = style.layers.find((layer) => layer.id === "provinces-fill");
    if (fill && "paint" in fill && fill.paint) {
      (fill.paint as Record<string, unknown>)["fill-color"] =
        fillColour("#0090ff", "#2a2a2a", ["#111", "#222", "#333", "#444", "#555", "#666"]);
    }
    expect(validateStyleMin(style as never).map((error) => `${error.message}`)).toEqual([]);
  });
});
