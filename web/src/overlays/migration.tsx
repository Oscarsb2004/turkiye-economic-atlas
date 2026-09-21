/**
 * migration.tsx — who moved where, as an overlay.
 *
 * THE FIRST OVERLAY THAT IS NOT A CHOROPLETH ALONE
 *
 * The map still shades all 81 provinces, by arrivals, departures or the
 * difference. What is new is the second half: select a province and its
 * biggest flows are drawn as arcs to the provinces on the other end of them.
 * That is why an overlay is given the selection (overlays/types.ts) — "who
 * moved here" is a question about one province, and no choropleth can answer it.
 *
 * PUBLISHED FLOWS, DERIVED TOTALS, AND THE INTERFACE SAYS WHICH
 *
 * TÜİK publishes the 6 480 province-to-province flows. It does not publish, in
 * this table, what each province's arrivals and departures add up to — those
 * are ours, by addition, and the panel says so under every one of them. The
 * arcs are the published flows themselves, unaggregated.
 *
 * AND THE OTHER SEVENTY PROVINCES
 *
 * Ten arcs are drawn, so seventy of the eighty flows a selected province has
 * are on the map only as an absence. Pointing at a province answers for that
 * one: its name, and its flow with the selected province under the measure on
 * screen. It is the same arithmetic the arcs are drawn from — not a second
 * figure computed a second way — and it appears only once a province is
 * selected, because before that there is no pair to report.
 *
 * ONE ARC PER LINE, TEN OF THEM
 *
 * A province has eighty flows in each direction and drawing all of them draws
 * a fog. The ten largest are what a reader can actually follow, and the panel
 * lists them with their figures so the map is never the only statement.
 */

import { Fragment, useEffect, useMemo, useRef, useState } from "react";

import {
  MIGRATION,
  flowsFor,
  loadMigration,
  t,
  type Lang,
  type Migration,
} from "../data/bundle";
import { formatInt, stringsFor, type Strings } from "../i18n";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const MIGRATION_ID = "migration";

const SOURCE = "tuik_internal_migration";

/** How many flows are drawn, and listed, for the selected province. */
const ARCS = 10;

/** The three figures a province can be shaded by. All three are DERIVED. */
type Measure = "net" | "received" | "given";

/**
 * One province's flow with another, from the FIRST one's point of view.
 *
 * `received` is what came to it from the other, `given` is what left it for the
 * other, and `net` is the difference — signed, so a province that lost people
 * to the one under the cursor reads as a negative rather than as a magnitude
 * with a colour to interpret. Both halves are published; the subtraction is
 * ours, and it is the same one flowsFor() draws the arcs from.
 */
function between(migration: Migration, plaka: number, other: number, measure: Measure): number | null {
  const mine = migration.provinces.find((province) => province.plaka === plaka);
  const theirs = migration.provinces.find((province) => province.plaka === other);
  if (!mine || !theirs) return null;
  const arrived = theirs.out[String(plaka)] ?? 0;
  const left = mine.out[String(other)] ?? 0;
  if (measure === "received") return arrived;
  if (measure === "given") return left;
  return arrived - left;
}

const MEASURES: Array<{ key: Measure; label: (s: Strings) => string }> = [
  { key: "net", label: (s) => s.migrationNet },
  { key: "received", label: (s) => s.migrationReceived },
  { key: "given", label: (s) => s.migrationGiven },
];

/** What is known about one province: its totals, and its largest flows. */
function MigrationFigures({ migration, plaka, measure, lang }: {
  migration: Migration; plaka: number; measure: Measure; lang: Lang;
}) {
  const s = stringsFor(lang);
  const province = migration.provinces.find((entry) => entry.plaka === plaka);
  const totals = migration.totals.by_plaka[String(plaka)];
  if (!province || !totals) return <p className="notice">{s.noFigures}</p>;
  const top = flowsFor(migration, plaka, measure).slice(0, ARCS);
  const named = (code: number) =>
    t(migration.provinces.find((entry) => entry.plaka === code)?.name, lang);

  return (
    <section className="figures">
      <h3 className="figures__label">{t(migration.migration.measure.label, lang)} · {migration.migration.year}</h3>
      <dl className="panel__facts">
        <dt>{s.migrationPopulation}</dt>
        <dd>{formatInt(province.population, lang)}</dd>
        <dt>{s.migrationReceived}</dt>
        <dd>{formatInt(totals.received, lang)}</dd>
        <dt>{s.migrationGiven}</dt>
        <dd>{formatInt(totals.given, lang)}</dd>
        <dt>{s.migrationNet}</dt>
        <dd>{formatInt(totals.net, lang)}</dd>
      </dl>
      <p className="notice">{s.migrationDerived}</p>

      <h3 className="figures__label">{s.migrationTop}</h3>
      <dl className="panel__facts">
        {top.map((flow) => (
          <Fragment key={`${flow.from}-${flow.to}`}>
            <dt>{flow.tone === "in" ? `${named(flow.from)} →` : `→ ${named(flow.to)}`}</dt>
            <dd>{formatInt(flow.value, lang)}</dd>
          </Fragment>
        ))}
      </dl>
    </section>
  );
}

export function useMigrationOverlay({ lang, clock, active, selected }: OverlayContext): Overlay {
  const [migration, setMigration] = useState<Migration | null>(null);
  const [measure, setMeasure] = useState<Measure>("net");
  const [failed, setFailed] = useState<string | null>(null);
  const cache = useRef(new Map<string, Migration>());
  const s = stringsFor(lang);

  // The years are known without fetching anything: one file each, declared.
  const periods: Period[] = useMemo(
    () => MIGRATION.map((entry) => ({
      key: `${MIGRATION_ID}:${entry.year}`, at: entry.year, label: entry.year,
    })),
    [],
  );

  const period = snapPeriod(periods, clock);
  const year = period?.at ?? "";

  useEffect(() => {
    if (!active || !year) return;
    const held = cache.current.get(year);
    if (held) {
      setMigration(held);
      return;
    }
    let current = true;
    loadMigration(year).then(
      (loaded) => {
        cache.current.set(year, loaded);
        if (current) setMigration(loaded);
      },
      (error: Error) => current && setFailed(error.message),
    );
    return () => { current = false; };
  }, [active, year]);

  // The year on screen, or nothing while the next one is on its way: last
  // year's figures must not be drawn under this year's title.
  const shown = migration && migration.migration.year === year ? migration : null;

  const values = useMemo(() => {
    if (!shown) return null;
    const found = new Map<number, number | null>();
    for (const province of shown.provinces) {
      found.set(province.plaka, shown.totals.by_plaka[String(province.plaka)]?.[measure] ?? null);
    }
    return found;
  }, [shown, measure]);

  const flows = useMemo(
    () => (shown && selected !== null ? flowsFor(shown, selected, measure).slice(0, ARCS) : []),
    [shown, selected, measure],
  );

  const measureLabel = MEASURES.find((entry) => entry.key === measure)?.label(s) ?? s.overlayMigration;

  /**
   * What the province under the cursor is, with the selected one.
   *
   * Nothing until a province is selected: without a pair there is no flow to
   * report, and a label that says only the province's name is the map already
   * telling the reader what they are pointing at.
   */
  const hint = useMemo(() => {
    if (!shown || selected === null) return undefined;
    return (plaka: number): string | null => {
      if (plaka === selected) {
        const totals = shown.totals.by_plaka[String(plaka)];
        if (!totals) return null;
        return `${measureLabel}: ${formatInt(totals[measure], lang)} (${s.migrationSelf})`;
      }
      const value = between(shown, selected, plaka, measure);
      if (value === null) return null;
      return `${measureLabel}: ${formatInt(value, lang)} (${s.migrationWith})`;
    };
  }, [shown, selected, measure, measureLabel, lang, s]);

  return {
    id: MIGRATION_ID,
    group: "connections",
    label: s.overlayMigration,
    sources: [SOURCE],
    periods,
    period,
    values,
    flows,
    hint,
    format: (value: number) => formatInt(value, lang),
    legendTitle: `${measureLabel} · ${year}`,
    controls: (
      <>
        <label className="control">
          <span className="control__label">{s.measure}</span>
          <select className="control__select" value={measure}
                  onChange={(event) => setMeasure(event.target.value as Measure)}>
            {MEASURES.map((entry) => (
              <option key={entry.key} value={entry.key}>{entry.label(s)}</option>
            ))}
          </select>
        </label>
        {shown && (
          <p className="notice rail__note">
            {s.migrationMoved}: {formatInt(shown.national.moved, lang)}
          </p>
        )}
      </>
    ),
    panel: (plaka: number) =>
      shown
        ? <MigrationFigures migration={shown} plaka={plaka} measure={measure} lang={lang} />
        : <p className="notice">{s.loading}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : shown ? null : s.loading,
  };
}
