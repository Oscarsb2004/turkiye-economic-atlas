/**
 * TimeSlider.tsx — the clock, and what it will not pretend.
 *
 * The stops are periods some publisher published, so the slider moves by INDEX,
 * not by date: TÜİK's years are a year apart and YSK's elections are two weeks
 * and four years apart, and a date-proportional track would put two 2023
 * elections on top of each other. The caption says the gaps are uneven rather
 * than letting the spacing imply otherwise, and both ends are labelled with
 * their real instant.
 *
 * It is presentational: it holds no state, and knows nothing about what the
 * clock is driving.
 */

import type { Lang } from "../data/bundle";
import { formatInstant, stringsFor } from "../i18n";
import { sortPeriods, type Period } from "./timeline";

interface Props {
  periods: Period[];
  /** Where the clock has landed for this overlay. */
  period: Period | null;
  onPick: (period: Period) => void;
  lang: Lang;
}

export function TimeSlider({ periods, period, onPick, lang }: Props) {
  const s = stringsFor(lang);
  const ordered = sortPeriods(periods);

  if (ordered.length === 0) {
    return (
      <div className="timebar">
        <div className="timebar__head">
          <span className="timebar__label">{s.time}</span>
          <span className="timebar__now">{s.noPeriod}</span>
        </div>
      </div>
    );
  }

  const at = ordered.findIndex((entry) => entry.key === period?.key);
  const first = ordered[0];
  const last = ordered[ordered.length - 1];

  return (
    <div className="timebar">
      <div className="timebar__head">
        <span className="timebar__label">{s.time}</span>
        <span className="timebar__now">{period?.label ?? first.label}</span>
      </div>
      <input
        className="timebar__range"
        type="range"
        min={0}
        max={ordered.length - 1}
        step={1}
        value={at < 0 ? 0 : at}
        // One published period is a fact, not a range: the slider says so by
        // being there and inert rather than by disappearing.
        disabled={ordered.length < 2}
        aria-label={s.time}
        aria-valuetext={period?.label ?? first.label}
        onChange={(event) => onPick(ordered[Number(event.target.value)])}
      />
      <div className="timebar__ends">
        <span>{formatInstant(first.at, lang)}</span>
        <span className="timebar__note">{s.timeNote}</span>
        <span>{formatInstant(last.at, lang)}</span>
      </div>
    </div>
  );
}
