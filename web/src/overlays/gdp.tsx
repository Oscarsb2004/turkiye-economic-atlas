/**
 * gdp.tsx — TÜİK's provincial GDP per capita, as an overlay.
 *
 * TWO DIMENSIONS, AND ONLY ONE OF THEM IS TIME
 *
 * The bulletin publishes every year in two currencies. The year is time and
 * belongs to the shared clock; the currency is not, so it stays a control of
 * this overlay's own. A period's key is therefore the year alone — switching
 * currency keeps the reader on the year they were reading.
 *
 * The years are read FROM the data, never assumed: TÜİK adds one every
 * December, and the slider grows by itself when it does.
 */

import { Fragment, useEffect, useMemo, useState } from "react";

import { figureAt, loadPerCapitaGdp, t, type PerCapitaGdp } from "../data/bundle";
import { formatMoney, stringsFor } from "../i18n";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const GDP_ID = "gdp";

const SOURCE = "tuik_provincial_gdp";

/** One province's figure in every currency TÜİK publishes, for the chosen year. */
function GdpFigures({ gdp, plaka, year, lang }: {
  gdp: PerCapitaGdp; plaka: number; year: string; lang: OverlayContext["lang"];
}) {
  const s = stringsFor(lang);
  return (
    <section className="figures">
      <h3 className="figures__label">{t(gdp.measure.label, lang)} · {year}</h3>
      <dl className="panel__facts">
        {/* Every currency, including one with nothing published for this year:
            an absent figure is said, not dropped (CLAUDE.md §10). */}
        {gdp.measure.currencies.map((currency) => {
          const value = figureAt(gdp, plaka, currency, year);
          return (
            <Fragment key={currency}>
              <dt>{currency}</dt>
              <dd>{value === null ? s.noFigureLegend : formatMoney(value, currency, lang)}</dd>
            </Fragment>
          );
        })}
      </dl>
      <p className="notice">{s.perCapitaNote}</p>
    </section>
  );
}

export function useGdpOverlay({ lang, clock, active }: OverlayContext): Overlay {
  const [gdp, setGdp] = useState<PerCapitaGdp | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const [currency, setCurrency] = useState("TRY");
  const s = stringsFor(lang);

  useEffect(() => {
    if (!active || gdp || failed) return;
    loadPerCapitaGdp().then(setGdp, (error: Error) => setFailed(error.message));
  }, [active, gdp, failed]);

  const periods: Period[] = useMemo(() => {
    const years = gdp?.measure.years[currency] ?? [];
    return years.map((year) => ({ key: `${GDP_ID}:${year}`, at: year, label: year }));
  }, [gdp, currency]);

  const period = snapPeriod(periods, clock);
  const year = period?.at ?? "";

  const values = useMemo(() => {
    if (!gdp || !year) return null;
    const found = new Map<number, number | null>();
    for (const province of gdp.provinces) {
      found.set(province.plaka, province.per_capita_gdp?.[currency]?.[year] ?? null);
    }
    return found;
  }, [gdp, currency, year]);

  return {
    id: GDP_ID,
    group: "economic",
    label: s.overlayGdp,
    source: SOURCE,
    periods,
    period,
    values,
    format: (value: number) => formatMoney(value, currency, lang),
    // Six bands of six-digit lira ranges is a table sitting on the map. The
    // shades say where a province stands against the others; the figure itself
    // is one click away in the panel, which is where it reads (map/Legend.tsx).
    bands: "relative",
    legendTitle: gdp ? `${t(gdp.measure.label, lang)} · ${currency} · ${year}` : s.overlayGdp,
    controls: (
      <label className="control">
        <span className="control__label">{s.currency}</span>
        <select className="control__select" value={currency}
                onChange={(event) => setCurrency(event.target.value)}>
          {(gdp?.measure.currencies ?? [currency]).map((code) => (
            <option key={code} value={code}>{code}</option>
          ))}
        </select>
      </label>
    ),
    panel: (plaka: number) =>
      gdp && year
        ? <GdpFigures gdp={gdp} plaka={plaka} year={year} lang={lang} />
        : <p className="notice">{s.loading}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : gdp ? null : s.loading,
  };
}
