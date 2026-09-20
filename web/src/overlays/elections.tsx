/**
 * elections.tsx — YSK's results, one ballot position at a time, through time.
 *
 * THE ELECTIONS ARE THE PERIODS
 *
 * There is no separate "which election" control any more: an election IS a stop
 * on the clock, labelled with the title and the date the pipeline published.
 * That is what the time slider was asked for — the past results, in order — and
 * it retires the picker that showed readers a slug.
 *
 * ONE OPTION AT A TIME, DELIBERATELY
 *
 * The map shades one candidate's or party's share, never a winner: the 2023
 * parliamentary ballot had 29 parties and the validated palette holds five
 * categorical colours, so a winner map would mean inventing 24 more
 * (CLAUDE.md §9). The option survives a move along the slider if that option
 * stood in the election the reader lands on, and otherwise resets to the first
 * ballot position — a party is not carried into an election it did not contest.
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
import { snapPeriod, type Period } from "./timeline";
import type { Overlay, OverlayContext } from "./types";

export const ELECTION_ID = "election";

const SOURCE = "ysk_election_results";

/** A period's key carries the slug, so the loader can get back to the file. */
const slugOf = (period: Period | null): string | null =>
  period ? period.key.slice(ELECTION_ID.length + 1) : null;

/** One province's result: the chosen option's votes and share, and the turnout. */
function ElectionFigures({ election, option, plaka, lang }: {
  election: Election; option: string; plaka: number; lang: Lang;
}) {
  const s = stringsFor(lang);
  const province = election.provinces.find((p) => p.plaka === plaka);
  if (!province) return <p className="notice">{s.noFigures}</p>;
  const share = voteShare(election, plaka, option);

  return (
    <section className="figures">
      <h3 className="figures__label">{option}</h3>
      <dl className="panel__facts">
        <dt>{s.votes}</dt>
        <dd>{formatInt(province.votes[option] ?? 0, lang)}</dd>
        <dt>{s.share}</dt>
        <dd>{share === null ? "—" : formatPercent(share, lang)}</dd>
        <dt>{s.turnoutValid}</dt>
        <dd>{formatInt(province.turnout.valid, lang)}</dd>
        <dt>{s.turnoutRegistered}</dt>
        <dd>{formatInt(province.turnout.registered, lang)}</dd>
      </dl>
      <p className="notice">{s.shareNote}</p>
      {province.provenance === "derived" && <p className="notice">{s.summedNote}</p>}
    </section>
  );
}

export function useElectionOverlay({ lang, clock, active }: OverlayContext): Overlay {
  const [index, setIndex] = useState<ElectionIndex | null>(null);
  const [election, setElection] = useState<Election | null>(null);
  const [option, setOption] = useState("");
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

  useEffect(() => {
    if (!shown) return;
    setOption((chosen) =>
      shown.options.some((entry) => entry.name === chosen) ? chosen : shown.options[0].name);
  }, [shown]);

  const values = useMemo(() => {
    if (!shown || !option) return null;
    const found = new Map<number, number | null>();
    for (const province of shown.provinces) {
      found.set(province.plaka, voteShare(shown, province.plaka, option));
    }
    return found;
  }, [shown, option]);

  return {
    id: ELECTION_ID,
    group: "provinces",
    label: s.overlayElection,
    source: SOURCE,
    periods,
    period,
    values,
    format: (value: number) => formatPercent(value, lang),
    legendTitle: shown ? `${option} · ${t(shown.election.title, lang)}` : s.overlayElection,
    controls: (
      <label className="control">
        <span className="control__label">{s.option}</span>
        <select className="control__select" value={option}
                onChange={(event) => setOption(event.target.value)}>
          {(shown?.options ?? []).map((entry) => (
            <option key={entry.column} value={entry.name}>{entry.name}</option>
          ))}
        </select>
      </label>
    ),
    panel: (plaka: number) =>
      shown && option
        ? <ElectionFigures election={shown} option={option} plaka={plaka} lang={lang} />
        : <p className="notice">{s.loading}</p>,
    unavailable: failed ? `${s.failed}: ${failed}` : shown && option ? null : s.loading,
  };
}
