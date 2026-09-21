/**
 * shading.ts — what colour each province takes, and where that colour came from.
 *
 * TWO WAYS A PROVINCE CAN BE COLOURED, ONE THING THE MAP DRAWS
 *
 * A figure puts it in a band on the sequential ramp (bins.ts). A class puts it
 * in one of the palette's five categorical slots — which party led it, and
 * later whatever else is a kind rather than an amount. The map should not know
 * the difference, so both become the same small thing: an index per province,
 * and the colours those indices point at.
 *
 * FIVE SLOTS, AND FIVE IS THE CAP
 *
 * `registry/palette.yaml` carries its validator's recorded output: all-pairs
 * normal-vision ΔE of 15.9 against a floor of 15, for FIVE categorical colours.
 * A sixth is not a colour this project has, so `leaders` gives the five biggest
 * classes the five slots and puts everything after them in one muted class that
 * the legend names. Measured on the three elections this atlas publishes, the
 * fifth slot is never reached: the 2023 ballots have two, two and three
 * provinces-leading options between them, out of 4, 2 and 29 on the ballot.
 */

import { toneInk } from "./style";
import type { Binning } from "./bins";

/** How many categorical colours the validated palette has (CLAUDE.md §9). */
export const SLOTS = 5;

/** One class in a categorical shading, and the palette slot it takes. */
export interface Shade {
  /** The class itself, as the data names it. */
  key: string;
  /** What to call it in the legend — a publisher's word, reproduced. */
  label: string;
  /** 1..5, a validated categorical slot; 0 is the muted "everything else". */
  tone: number;
  /** How many provinces are in this class. */
  count: number;
}

/** plaka -> class key, and the classes themselves, biggest first. */
export interface Classes {
  byProvince: Map<number, string>;
  shades: Shade[];
}

/** What the map paints with: one colour index per province, and the colours. */
export interface Shading {
  byProvince: Map<number, number>;
  colours: string[];
}

/**
 * Turn "which class won each province" into classes with colours.
 *
 * Ordered by how many provinces each class holds, so the biggest class is
 * always the first slot and a map does not change colour because a class
 * gained a province. Ties break on the key, so the order is stable across
 * reloads rather than depending on iteration order.
 */
export function leaders(
  byProvince: Map<number, string>,
  label: (key: string) => string,
): Classes {
  const counted = new Map<string, number>();
  for (const key of byProvince.values()) counted.set(key, (counted.get(key) ?? 0) + 1);

  const shades: Shade[] = [...counted.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([key, count], index) => ({
      key,
      label: label(key),
      // Past the fifth, the muted slot: a sixth categorical colour is not a
      // colour this palette has, and inventing one un-validates the other five.
      tone: index < SLOTS ? index + 1 : 0,
      count,
    }));

  return { byProvince, shades };
}

/** A banded shading, as the map paints it. */
export function shadingOfBands(binning: Binning, ramp: string[]): Shading {
  return { byProvince: binning.byProvince, colours: ramp };
}

/**
 * A categorical shading, as the map paints it.
 *
 * Every class that shares the muted slot shares one colour, which is what
 * "everything else" means — the legend is where they are told apart.
 */
export function shadingOfClasses(classes: Classes): Shading {
  const colours = classes.shades.map((shade) => toneInk(shade.tone));
  const index = new Map(classes.shades.map((shade, position) => [shade.key, position]));
  const byProvince = new Map<number, number>();
  for (const [plaka, key] of classes.byProvince) {
    const position = index.get(key);
    if (position !== undefined) byProvince.set(plaka, position);
  }
  return { byProvince, colours };
}
