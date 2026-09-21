/**
 * Legend.tsx — what the shades mean, and how they were chosen.
 *
 * The bands are quantiles, which is a choice this project made rather than
 * something TÜİK published, so the legend says so. "No published figure" gets
 * its own swatch; it is not the bottom of the ramp.
 *
 * TWO WAYS TO READ THE SAME BANDS
 *
 * `values` prints each band's real range, which is what a reader wants when the
 * figure is the subject — passengers through an airport, people who moved.
 *
 * `relative` prints no numbers at all, only the ramp from less to more. That is
 * for a figure a reader compares rather than reads: per-capita GDP in lira runs
 * to six digits, and six bands of six-digit ranges is a table sitting on the
 * map that nobody adds up. The exact figure is one click away in the panel, and
 * the legend says so instead of repeating it in ranges.
 *
 * Either way the shading is identical — this is what the legend SAYS, not what
 * the map does.
 */

import type { ReactNode } from "react";

import type { Lang } from "../data/bundle";
import { stringsFor } from "../i18n";
import type { Binning } from "./bins";
import { LegendBox } from "./LegendBox";

/** How a legend reads its bands: as ranges, or as a position among the rest. */
export type BandsRead = "values" | "relative";

interface Props {
  binning: Binning;
  ramp: string[];
  /** What is being shaded, already in the reader's language. */
  title: string;
  /** How a band's bound reads: money for GDP, a percentage for a vote share. */
  format: (value: number) => string;
  /** Ranges, or only the direction. Defaults to ranges. */
  bands?: BandsRead;
  /** More key, from an overlay that draws something the bands do not explain. */
  extra?: ReactNode;
  lang: Lang;
}

/** The ramp end to end, with no figure on it: lower on the left, higher right. */
function Ramp({ binning, ramp, lang }: Pick<Props, "binning" | "ramp" | "lang">) {
  const s = stringsFor(lang);
  return (
    <>
      <div className="ramp" aria-hidden="true">
        {binning.bands.map((band) => (
          <span key={band.index} className="ramp__step" style={{ background: ramp[band.index] }} />
        ))}
      </div>
      <p className="ramp__ends">
        <span>{s.legendLower}</span>
        <span>{s.legendHigher}</span>
      </p>
    </>
  );
}

export function Legend({ binning, ramp, title, format, bands = "values", extra, lang }: Props) {
  const s = stringsFor(lang);
  if (binning.bands.length === 0) return null;
  const relative = bands === "relative";

  return (
    <LegendBox title={title}>
      {relative ? (
        <Ramp binning={binning} ramp={ramp} lang={lang} />
      ) : (
        <ul className="legend__bands">
          {binning.bands.map((band) => (
            <li key={band.index} className="legend__band">
              <span className="legend__swatch" style={{ background: ramp[band.index] }} aria-hidden="true" />
              <span className="legend__range">
                {format(band.min)} – {format(band.max)}
              </span>
              <span className="legend__count">{band.count}</span>
            </li>
          ))}
        </ul>
      )}
      {binning.withoutFigure.length > 0 && (
        <ul className="legend__bands">
          <li className="legend__band">
            <span className="legend__swatch legend__swatch--none" aria-hidden="true" />
            <span className="legend__range">{s.noFigureLegend}</span>
            <span className="legend__count">{binning.withoutFigure.length}</span>
          </li>
        </ul>
      )}
      <p className="legend__method">
        {relative ? `${s.legendRelative} ${s.legendPickProvince}` : s.legendMethod}
      </p>
      {extra}
    </LegendBox>
  );
}
