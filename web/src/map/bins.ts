/**
 * bins.ts — putting provinces into shades, and saying so.
 *
 * WHY QUANTILES, AND WHY THE LEGEND MUST SAY IT
 *
 * Türkiye's per-capita GDP is not evenly spread: İstanbul, Kocaeli and Ankara
 * sit far above the rest, so equal-width bands would put ~70 provinces in the
 * darkest shade and show almost nothing. Quantile bands — equal COUNT per
 * shade — separate the provinces a reader is actually comparing.
 *
 * That is a presentation choice, not a published fact, so the legend prints the
 * real value range of every band and says the bands hold equal numbers of
 * provinces. The atlas never implies a ranking the publisher did not make
 * (CLAUDE.md §1); it shows TÜİK's figures and states how they were shaded.
 *
 * A province with no published figure gets NO band. It is drawn in its own
 * colour and labelled, never folded into the lowest shade, because "not
 * published" and "lowest" are different facts (CLAUDE.md §10).
 */

export interface Band {
  /** Index into the sequential ramp, 0 = least. */
  index: number;
  min: number;
  max: number;
  count: number;
}

export interface Binning {
  bands: Band[];
  /** plaka -> band index, for every province that has a figure. */
  byProvince: Map<number, number>;
  withoutFigure: number[];
}

/**
 * Quantile bands over the provinces that have a figure.
 *
 * Ties do not straddle a boundary: a value equal to a cut goes in the lower
 * band, so two provinces with identical figures always get the same shade —
 * otherwise the map would show a difference the data does not contain.
 */
export function quantileBands(
  values: Map<number, number | null>,
  bandCount: number,
): Binning {
  const withFigure = [...values.entries()].filter(
    (entry): entry is [number, number] => typeof entry[1] === "number",
  );
  const withoutFigure = [...values.entries()]
    .filter(([, value]) => typeof value !== "number")
    .map(([plaka]) => plaka)
    .sort((a, b) => a - b);

  if (withFigure.length === 0) {
    return { bands: [], byProvince: new Map(), withoutFigure };
  }

  const sorted = withFigure.map(([, value]) => value).sort((a, b) => a - b);
  const cuts: number[] = [];
  for (let i = 1; i < bandCount; i += 1) {
    cuts.push(sorted[Math.floor((sorted.length * i) / bandCount)]);
  }

  const bandOf = (value: number): number => {
    let index = 0;
    while (index < cuts.length && value >= cuts[index]) index += 1;
    return index;
  };

  const byProvince = new Map<number, number>();
  const members: number[][] = Array.from({ length: bandCount }, () => []);
  for (const [plaka, value] of withFigure) {
    const index = bandOf(value);
    byProvince.set(plaka, index);
    members[index].push(value);
  }

  const bands: Band[] = members
    .map((band, index) => ({
      index,
      min: band.length ? Math.min(...band) : 0,
      max: band.length ? Math.max(...band) : 0,
      count: band.length,
    }))
    // A band nobody landed in is not drawn: an empty swatch in a legend reads
    // as a range the data has, and it does not.
    .filter((band) => band.count > 0);

  return { bands, byProvince, withoutFigure };
}
