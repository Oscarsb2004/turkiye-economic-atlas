/**
 * Legend.tsx — what the shades mean, and how they were chosen.
 *
 * The bands are quantiles, which is a choice this project made rather than
 * something TÜİK published, so the legend says so and prints each band's real
 * value range. A reader can then see both the figures and the decision.
 *
 * "No published figure" gets its own swatch. It is not the bottom of the ramp.
 */

import type { Lang } from "../data/bundle";
import { formatMoney, stringsFor } from "../i18n";
import type { Binning } from "./bins";

interface Props {
  binning: Binning;
  ramp: string[];
  currency: string;
  year: string;
  lang: Lang;
}

export function Legend({ binning, ramp, currency, year, lang }: Props) {
  const s = stringsFor(lang);
  if (binning.bands.length === 0) return null;

  return (
    <figure className="legend">
      <figcaption className="legend__title">
        {s.legendTitle} · {currency} · {year}
      </figcaption>
      <ul className="legend__bands">
        {binning.bands.map((band) => (
          <li key={band.index} className="legend__band">
            <span className="legend__swatch" style={{ background: ramp[band.index] }} aria-hidden="true" />
            <span className="legend__range">
              {formatMoney(band.min, currency, lang)} – {formatMoney(band.max, currency, lang)}
            </span>
            <span className="legend__count">{band.count}</span>
          </li>
        ))}
        {binning.withoutFigure.length > 0 && (
          <li className="legend__band">
            <span className="legend__swatch legend__swatch--none" aria-hidden="true" />
            <span className="legend__range">{s.noFigureLegend}</span>
            <span className="legend__count">{binning.withoutFigure.length}</span>
          </li>
        )}
      </ul>
      <p className="legend__method">{s.legendMethod}</p>
    </figure>
  );
}
