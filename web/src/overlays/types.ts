/**
 * types.ts — what an overlay is, so that adding one is adding a module.
 *
 * An overlay is a hook. It owns its own fetching, its own controls and its own
 * periods, and it answers three questions for whatever is on screen: what value
 * does each province take right now, how should that value read, and what is
 * known about one province. Nothing outside knows it is GDP or an election.
 *
 * That is the whole extension point. Migration flows, nightlights and the
 * keystone projects (docs/PLAN.md T7–T12) each arrive as one module exporting
 * one hook, plus one line in overlays/index.ts.
 *
 * WHY THE PUBLISHER IS A KEY AND NOT A NAME
 *
 * An overlay names its source card, not its publisher. meta.json is generated
 * from those cards, so the rail shows what the pipeline actually read and the
 * app never carries a publisher's name of its own (atlas/export/bundle.py).
 */

import type { ReactNode } from "react";

import type { Flow, Lang } from "../data/bundle";
import type { Clock, Period } from "./timeline";

/**
 * The rail's sections, in the order they are shown.
 *
 * `connections` is declared now and filled at T7: it is where the flow layers
 * go, and declaring it here means they arrive without moving anything.
 */
export const OVERLAY_GROUPS = ["provinces", "connections"] as const;

export type OverlayGroup = (typeof OVERLAY_GROUPS)[number];

/** What every overlay hook is given. */
export interface OverlayContext {
  lang: Lang;
  /** The shared clock, or null before the reader has moved it. */
  clock: Clock | null;
  /** True only for the overlay on screen: an overlay must not fetch unasked. */
  active: boolean;
  /**
   * The province the reader has selected, if any.
   *
   * Most overlays ignore it: a choropleth shades all 81 whatever is selected.
   * A FLOW overlay cannot — "who moved here" is a question about one province —
   * so the selection is part of what an overlay is given (T7).
   */
  selected: number | null;
}

/** What every overlay hook returns. */
export interface Overlay {
  id: string;
  group: OverlayGroup;
  /** Interface text, in the reader's language. */
  label: string;
  /** The source card this overlay reads; the rail resolves it through meta.json. */
  source: string;
  /** Every period this overlay has, ascending. Empty until its index arrives. */
  periods: Period[];
  /** The period the clock snapped to, or null when there are none yet. */
  period: Period | null;
  /**
   * plaka -> value for the chosen period, null where nothing is published, and
   * the whole map null while there is nothing to draw. The map is TOTAL over
   * the 81 provinces: a missing province is an absent figure, never a zero
   * (CLAUDE.md §10).
   */
  values: Map<number, number | null> | null;
  /** How one value reads: money, a percentage, a count. */
  format: (value: number) => string;
  /** What the legend is titled, already in the reader's language. */
  legendTitle: string;
  /**
   * Lines to draw between provinces, biggest first, or none.
   *
   * The overlay says WHICH flows and how big; the map owns the geometry and
   * turns them into arcs between the provinces' inner points. Neither has to
   * know about the other's half (T8's flights and T9's rail land here too).
   */
  flows?: Flow[];
  /** This overlay's own controls — a currency, a candidate — shown in the rail. */
  controls: ReactNode;
  /** What is known about one province under this overlay. */
  panel: (plaka: number) => ReactNode;
  /** Why there is nothing to draw, in the reader's language; null when there is. */
  unavailable: string | null;
}
