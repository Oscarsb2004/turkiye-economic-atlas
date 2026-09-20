/**
 * The banding rules, which are the ones that would fail quietly.
 *
 * A map that shades a province wrong looks exactly like a map that shades it
 * right, so each rule here is one a reader could not catch by looking.
 */

import { describe, expect, it } from "vitest";

import { quantileBands } from "./bins";

/** plaka -> value, for however many provinces a test needs. */
function values(figures: Array<number | null>): Map<number, number | null> {
  return new Map(figures.map((value, index) => [index + 1, value]));
}

describe("quantileBands", () => {
  it("puts an equal number of provinces in each shade", () => {
    const binning = quantileBands(values([...Array(12)].map((_, i) => (i + 1) * 100)), 4);
    expect(binning.bands.map((band) => band.count)).toEqual([3, 3, 3, 3]);
    expect(binning.bands.map((band) => band.index)).toEqual([0, 1, 2, 3]);
  });

  it("reports each band's real value range, not the cut points", () => {
    const binning = quantileBands(values([10, 20, 30, 40]), 2);
    expect(binning.bands[0]).toMatchObject({ min: 10, max: 20 });
    expect(binning.bands[1]).toMatchObject({ min: 30, max: 40 });
  });

  it("never splits equal values across two shades", () => {
    // Six provinces, four of them identical. However the cuts fall, the four
    // must land together: otherwise the map shows a difference the data does
    // not contain.
    const binning = quantileBands(values([5, 100, 100, 100, 100, 900]), 3);
    const bandsOfTheTied = [2, 3, 4, 5].map((plaka) => binning.byProvince.get(plaka));
    expect(new Set(bandsOfTheTied).size).toBe(1);
  });

  it("leaves a province with no published figure out of every band", () => {
    const binning = quantileBands(values([100, null, 300, 400]), 2);
    expect(binning.withoutFigure).toEqual([2]);
    expect(binning.byProvince.has(2)).toBe(false);
    // And it is not counted as a low value either.
    expect(binning.bands.reduce((total, band) => total + band.count, 0)).toBe(3);
  });

  it("drops a band nobody landed in rather than drawing an empty swatch", () => {
    // Three provinces into six shades: at most three bands can hold anyone.
    const binning = quantileBands(values([1, 2, 3]), 6);
    expect(binning.bands.length).toBeLessThanOrEqual(3);
    expect(binning.bands.every((band) => band.count > 0)).toBe(true);
  });

  it("survives a dataset where nothing is published", () => {
    const binning = quantileBands(values([null, null]), 6);
    expect(binning.bands).toEqual([]);
    expect(binning.withoutFigure).toEqual([1, 2]);
  });

  it("gives every province with a figure a band", () => {
    const figures = [...Array(81)].map((_, i) => 100_000 + i * 1_337);
    const binning = quantileBands(values(figures), 6);
    expect(binning.byProvince.size).toBe(81);
    expect(binning.bands.reduce((total, band) => total + band.count, 0)).toBe(81);
  });
});
