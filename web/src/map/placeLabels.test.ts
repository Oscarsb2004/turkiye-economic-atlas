/**
 * Which place names a zoom has room for.
 *
 * The rule is a presentation choice made from a published figure, and the one
 * thing that would make it dishonest is a place appearing or vanishing for a
 * reason other than the rule — so the rule is tested rather than eyeballed.
 */

import { describe, expect, it } from "vitest";

import { floorAt, labelsFor, type Labelled } from "./placeLabels";

const TURKIYE: [number, number, number, number] = [25, 35, 45, 43];

function place(id: string, population: number | null, at: [number, number]): Labelled {
  return { id, population, point: at };
}

describe("floorAt", () => {
  it("asks for more people the further out the map is", () => {
    expect(floorAt(4)).toBe(500_000);
    expect(floorAt(6)).toBe(200_000);
    expect(floorAt(7)).toBe(75_000);
    expect(floorAt(8)).toBe(25_000);
    expect(floorAt(9)).toBe(0);
  });
});

describe("labelsFor", () => {
  // Spread across the country, because labels that would sit on one another
  // are dropped — which is its own test below, not a condition of these.
  const places = [
    place("istanbul", 15_701_602, [28.9, 41.0]),
    place("ankara", 5_864_049, [32.8, 39.9]),
    place("corum", 180_000, [34.9, 40.5]),
    place("kastamonu", 80_000, [33.7, 41.3]),
    place("sinop", 40_000, [35.1, 42.0]),
  ];

  it("draws only what the zoom has room for", () => {
    expect(labelsFor(places, 4, TURKIYE).map((p) => p.id)).toEqual(["istanbul", "ankara"]);
    expect(labelsFor(places, 7, TURKIYE).map((p) => p.id))
      .toEqual(["istanbul", "ankara", "corum", "kastamonu"]);
  });

  it("leaves out what is off the screen, however big it is", () => {
    // Everything east of 30°E, Ankara included, is outside this box.
    const west: [number, number, number, number] = [25, 35, 30, 43];
    expect(labelsFor(places, 4, west).map((p) => p.id)).toEqual(["istanbul"]);
  });

  it("drops the smallest first when there are more than fit", () => {
    expect(labelsFor(places, 9, TURKIYE, 3).map((p) => p.id))
      .toEqual(["istanbul", "ankara", "corum"]);
  });

  it("holds a place with no published population back to the closest zoom", () => {
    const unknown = [...places, place("unnamed-size", null, [38.5, 38.0])];
    expect(labelsFor(unknown, 8, TURKIYE).map((p) => p.id)).not.toContain("unnamed-size");
    expect(labelsFor(unknown, 9, TURKIYE).map((p) => p.id)).toContain("unnamed-size");
  });

  it("leaves out a label that would land on one already drawn", () => {
    // Two towns 0.01° apart — a few hundred metres — at a zoom where that is
    // a handful of pixels. Only the larger is drawn.
    const crowded = [
      place("big", 900_000, [29.0, 41.0]),
      place("beside-it", 800_000, [29.01, 41.0]),
      place("far", 700_000, [31.0, 41.0]),
    ];
    expect(labelsFor(crowded, 6, TURKIYE).map((p) => p.id)).toEqual(["big", "far"]);
    // Zoomed far enough in, those same few hundred metres are 116 px and both
    // names fit. The rule is about pixels, which is what an overlap is about.
    expect(labelsFor(crowded, 14, TURKIYE).map((p) => p.id))
      .toEqual(["big", "beside-it", "far"]);
  });

  it("orders the same way twice, so a pan back shows the same names", () => {
    const tied = [place("b", 1000, [30, 39]), place("a", 1000, [32, 39]), place("c", 1000, [34, 39])];
    expect(labelsFor(tied, 9, TURKIYE, 2).map((p) => p.id)).toEqual(["a", "b"]);
    expect(labelsFor([...tied].reverse(), 9, TURKIYE, 2).map((p) => p.id)).toEqual(["a", "b"]);
  });
});
