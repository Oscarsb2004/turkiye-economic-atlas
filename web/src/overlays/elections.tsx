/**
 * elections.tsx — YSK's results: who led each province, and every score behind it.
 *
 * THE ELECTIONS ARE THE PERIODS
 *
 * There is no "which election" control: an election IS a stop on the clock,
 * labelled with the title and the date the pipeline published. That is what the
 * time slider was asked for — the past results, in order.
 *
 * THE MAP SHOWS THE LEAD, THE PANEL SHOWS THE BALLOT
 *
 * This replaces shading one chosen option's share, which asked the reader to
 * pick a party from a dropdown before the map said anything, and then showed
 * them one number per province. A province is now coloured by whichever option
 * polled highest in it, and selecting it lists EVERY option on that ballot with
 * its votes and its share — 29 of them in 2023 — so nothing is behind a control
 * any more.
 *
 * AND FIVE COLOURS IS STILL THE CAP
 *
 * CLAUDE.md §9 rejected a winner map because the 2023 parliamentary ballot had
 * 29 parties and the validated palette holds five categorical colours. The
 * measurement that reopened it: the number of options that LEAD A PROVINCE is
 * not the number on the ballot. Across the three elections published here it is
 * 2, 2 and 3 — out of 4, 2 and 29 standing. The fifth slot is never reached, and
 * if a future election reaches a sixth, `leaders` puts everything past the fifth
 * in one muted class and the legend names them (map/shading.ts).
 *
 * WHY A CACHE
 *
 * A result file is fetched when the clock first reaches it and kept, so running
 * the slider back and forth across three elections is three requests, not
 * thirty. It is a ref, not state: filling it must not re-render.
 */

import { useEffect, useMemo, useRef, useState } from "react";

import {
  ELECTIONS,
  loadElection,
  loadElectionIndex,
  t,
  voteShare,
  type Election,
  type ElectionIndex,
  type Lang,
} from "../data/bundle";
import { formatInstant, formatInt, formatPercent, stringsFor } from "../i18n";
import { LegendBox } from "../map/LegendBox";
import { leaders, type Classes } from "../map/shading";
import { toneInk } from "../map/style";
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const ELECTION_ID = "election";

const SOURCE = "ysk_election_results";

/** A period's key carries the slug, so the loader can get back to the file. */
const slugOf = (period: Period | null): string | null =>
  period ? period.key.slice(ELECTION_ID.length + 1) : null;

/**
 * Which option polled highest in each province.
 *
 * Ties break on the name so the map is the same on every reload; a tie has not
 * happened in any published election, and a map that changes colour between two
 * reads of the same file would be worse than one that picks a rule.
 */
function leadingByProvince(election: Election): Map<number, string> {
  const led = new Map<number, string>();
  for (const province of election.provinces) {
    let best = "";
    let most = -1;
    for (const option of election.options) {
      const votes = province.votes[option.name] ?? 0;
      if (votes > most || (votes === most && option.name.localeCompare(best) < 0)) {
        best = option.name;
        most = votes;
      }
    }
    if (best) led.set(province.plaka, best);
  }
  return led;
}

/** The options that led somewhere, in their colours, with how many each led. */
function ElectionLegend({ classes, title, lang }: {
  classes: Classes; title: string; lang: Lang;
}) {
  const s = stringsFor(lang);
  const shared = classes.shades.filter((shade) => shade.tone === 0);

  return (
    <LegendBox title={title}>
      <ul className="legend__bands">
        {classes.shades.map((shade) => (
          <li key={shade.key} className="legend__band">
            <span className="legend__swatch"
                  style={{ background: toneInk(shade.tone) }} aria-hidden="true" />
            <span className="legend__range">{shade.tone === 0 ? s.electionOther : shade.label}</span>
            <span className="legend__count">{shade.count}</span>
          </li>
        ))}
      </ul>
      <p className="legend__method">
        {s.electionLeadNote}
        {shared.length > 0 && (
          <>
            <br />
            {s.electionSlots} {shared.map((shade) => shade.label).join(" · ")}
          </>
        )}
      </p>
    </LegendBox>
  );
}

/**
 * One province's whole ballot: every option, its votes and its share.
 *
 * Every option on the ballot, not only the ones that polled: an option with no
 * votes in a province is a published zero, and dropping it would leave a reader
 * counting the rows to work out which party is missing (CLAUDE.md §10). They
 * are ordered by votes, so the ones that matter here are at the top.
 */
function ElectionFigures({ election, plaka, lang }: {
  election: Election; plaka: number; lang: Lang;
}) {
  const s = stringsFor(lang);
  const province = election.provinces.find((p) => p.plaka === plaka);
  if (!province) return <p className="notice">{s.noFigures}</p>;

  const scored = election.options
    .map((option) => ({
      name: option.name,
      votes: province.votes[option.name] ?? 0,
      share: voteShare(election, plaka, option.name),
    }))
    .sort((a, b) => b.votes - a.votes);

  return (
    <section className="figures">
      <h3 className="figures__label">
        {t(election.election.title, lang)} · {formatInstant(election.election.date, lang)}
      </h3>
      <dl className="panel__facts">
        <dt>{s.turnoutValid}</dt>
        <dd>{formatInt(province.turnout.valid, lang)}</dd>
        <dt>{s.turnoutRegistered}</dt>
        <dd>{formatInt(province.turnout.registered, lang)}</dd>
      </dl>

      <h3 className="figures__label">{s.electionResults}</h3>
      <ol className="ballot">
        {scored.map((entry) => (
          <li key={entry.name} className="ballot__row">
            <span className="ballot__name">{entry.name}</span>
            <span className="ballot__share">
              {entry.share === null ? "—" : formatPercent(entry.share, lang)}
            </span>
            <span className="ballot__votes">{formatInt(entry.votes, lang)}</span>
          </li>
        ))}
      </ol>
      <p className="notice">{s.shareNote}</p>
      {province.provenance === "derived" && <p className="notice">{s.summedNote}</p>}
    </section>
  );
}

export function useElectionOverlay({ lang, clock, active }: OverlayContext): Overlay {
  const [index, setIndex] = useState<ElectionIndex | null>(null);
  const [election, setElection] = useState<Election | null>(null);
  const [failed, setFailed] = useState<string | null>(null);
  const cache = useRef(new Map<string, Election>());
  const s = stringsFor(lang);

  useEffect(() => {
    if (!active || index || failed) return;
    loadElectionIndex().then(setIndex, (error: Error) => setFailed(error.message));
  }, [active, index, failed]);

  const periods: Period[] = useMemo(() => {
    if (!index) return [];
    // Only elections the app is allowed to fetch become stops: a stop that
    // cannot load is worse than one that is not offered. ELECTIONS is the
    // declared list, and registry/datasets names it as the consumer.
    return index.elections
      .filter((entry) => ELECTIONS.some((known) => known.slug === entry.slug))
      .map((entry) => ({
        key: `${ELECTION_ID}:${entry.slug}`,
        at: entry.date,
        label: `${t(entry.title, lang)} · ${formatInstant(entry.date, lang)}`,
      }));
  }, [index, lang]);

  const period = snapPeriod(periods, clock);
  const slug = slugOf(period);

  useEffect(() => {
    if (!active || !slug) return;
    const held = cache.current.get(slug);
    if (held) {
      setElection(held);
      return;
    }
    let current = true;
    loadElection(slug).then(
      (loaded) => {
        cache.current.set(slug, loaded);
        if (current) setElection(loaded);
      },
      (error: Error) => current && setFailed(error.message),
    );
    return () => { current = false; };
  }, [active, slug]);

  // The election on screen, or nothing while the next one is on its way: the
  // previous election's figures must not be drawn under the new one's title.
  const shown = election && election.election.slug === slug ? election : null;

  const classes = useMemo(
    () => (shown ? leaders(leadingByProvince(shown), (key) => key) : undefined),
    [shown],
  );

  const title = shown
    ? `${s.electionLeading} · ${t(shown.election.title, lang)}`
    : s.overlayElection;

  return {
    id: ELECTION_ID,
    group: "elections",
    label: s.overlayElection,
    source: SOURCE,
    periods,
    period,
    // A winner is a kind, not an amount: there is nothing to band, and the
    // categorical shading is what the map draws instead (map/shading.ts).
    values: null,
    classes,
    format: (value: number) => formatPercent(value, lang),
    legendTitle: title,
    legend: classes ? <ElectionLegend classes={classes} title={title} lang={lang} /> : undefined,
    controls: shown ? (
      <p className="notice rail__note">
        {s.electionOnBallot}: {formatInt(shown.options.length, lang)}
      </p>
    ) : null,
    panel: (plaka: number) =>
      shown
        ? <ElectionFigures election={shown} plaka={plaka} lang={lang} />
        : <p className="notice">{s.loading}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : shown ? null : s.loading,
  };
}
