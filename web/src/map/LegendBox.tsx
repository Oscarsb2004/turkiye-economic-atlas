/**
 * LegendBox.tsx — the box every legend sits in, and the one control it has.
 *
 * WHY THE LEGEND FOLDS
 *
 * A legend is over the map, which is the only place a reader can compare a
 * shade with the thing it shades. That also means it covers the map — and the
 * airport legend, with a line per band and a national total under it, covers
 * the part of the Aegean it is describing. So it folds to its title.
 *
 * `<details>` rather than state: the element already knows how to open and
 * close, keeps the reader's choice as they change measure or year, and is
 * reachable from the keyboard without this project writing any of that. The
 * arrow is CSS, because a marker that points the wrong way in a right-to-left
 * interface is a bug this way of doing it does not have.
 *
 * Every legend in the atlas uses this, so "can I get it out of the way" has one
 * answer everywhere rather than one per overlay.
 */

import type { ReactNode } from "react";

interface Props {
  /** What is being shown, already in the reader's language. */
  title: ReactNode;
  children: ReactNode;
}

export function LegendBox({ title, children }: Props) {
  return (
    <details className="legend" open>
      <summary className="legend__title">{title}</summary>
      {children}
    </details>
  );
}
