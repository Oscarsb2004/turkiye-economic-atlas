/**
 * timeline.ts — the clock every overlay reads, and how each one snaps to it.
 *
 * ONE CLOCK, MANY CALENDARS
 *
 * The overlays do not share a calendar. TÜİK publishes a figure per YEAR, YSK
 * publishes a result on a DATE, and what comes next publishes on its own
 * schedule again — nightlights monthly, migration yearly. A slider per overlay
 * would make "the same moment" mean something different in each.
 *
 * So there is one clock — an instant — and every overlay answers the same
 * question: which of MY periods is the one at that instant? Moving the slider
 * sets the clock; switching overlay re-asks the question. A reader looking at
 * the 2023 runoff who switches to GDP per capita lands on 2023, not on whatever
 * that overlay happened to be showing before.
 *
 * TWO FIELDS, NOT ONE, AND THE ELECTION THAT FORCED IT
 *
 * A period carries `at` (when it is) and `key` (which one it is), because on
 * 14 May 2023 Türkiye voted twice: the presidential first round and the
 * parliamentary ballot share a date. With `at` alone, choosing one of them
 * would snap to the other and the slider would refuse to stay where it was put.
 * The clock therefore carries the exact key as well, honoured by the overlay
 * that owns it and ignored by every other one, which falls back to the instant.
 *
 * COMPARING INSTANTS OF DIFFERENT GRAIN
 *
 * `at` is an ISO prefix — "2024" or "2023-05-28" — and instants are compared as
 * strings, which for ISO is chronological. A year therefore sorts as the START
 * of that year: from the May 2023 runoff, the GDP overlay lands on 2023.
 */

/** One stop on the slider: a period some publisher actually published. */
export interface Period {
  /** Unique across the whole app; each overlay prefixes its own id. */
  key: string;
  /** When it is, as an ISO prefix: "2024", "2023-05-28". */
  at: string;
  /** What the reader sees. Published text wherever a publisher named it. */
  label: string;
}

/** Where the reader has put the clock. Null until they move it. */
export interface Clock {
  at: string;
  key: string;
}

/** Ascending by instant, keeping the order an overlay declared for ties. */
export function sortPeriods(periods: Period[]): Period[] {
  // Array.prototype.sort is stable, so two elections on one date stay in the
  // order their overlay listed them.
  return [...periods].sort((a, b) => (a.at < b.at ? -1 : a.at > b.at ? 1 : 0));
}

/**
 * The period this overlay shows at that clock.
 *
 *   - the exact period, if the clock names one of ours;
 *   - otherwise the newest period at or before the instant;
 *   - otherwise — the clock predates everything here — the earliest;
 *   - and with no clock at all, the newest, which is what a reader opening the
 *     atlas should see first.
 *
 * Never null unless the overlay has no periods, so an overlay always has
 * something to draw rather than going blank on a clock it cannot match.
 */
export function snapPeriod(periods: Period[], clock: Clock | null): Period | null {
  if (periods.length === 0) return null;
  const ordered = sortPeriods(periods);
  if (!clock) return ordered[ordered.length - 1];

  const exact = ordered.find((period) => period.key === clock.key);
  if (exact) return exact;

  let chosen = ordered[0];
  for (const period of ordered) {
    if (period.at <= clock.at) chosen = period;
  }
  return chosen;
}

/** The clock a period sets when the reader picks it. */
export function clockOf(period: Period): Clock {
  return { at: period.at, key: period.key };
}
