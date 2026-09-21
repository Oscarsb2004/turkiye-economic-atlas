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

import type { Flow, Lang, Marker, NetworkLine, Raster } from "../data/bundle";
import type { BandsRead } from "../map/Legend";
import type { Classes } from "../map/shading";
import type { Clock, Period } from "./timeline";

/**
 * The rail's sections, in the order they are shown.
 *
 * `economic` holds what a province produces and what it is connected to by
 * rail; `elections` holds how it voted; `connections` holds the flow layers;
 * `activity` holds what the country looks like rather than what it reports —
 * the nightlights today, and whatever else is observed rather than published.
 *
 * The railway sits with GDP per capita rather than with the flows because a
 * reader comparing provinces reads them together, which is the owner's call
 * and the reason this list is declared rather than inferred from the overlays.
 */
export const OVERLAY_GROUPS = ["economic", "elections", "connections", "activity"] as const;

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
  /**
   * A categorical shading instead of a banded one: each province takes one of
   * a few named classes, in the palette's own five slots.
   *
   * An election's winner is the case this exists for. `values` and `classes`
   * are alternatives — a province is shaded by a figure or by a class, never
   * by both — and the overlay chooses which question its map answers.
   */
  classes?: Classes;
  /** How one value reads: money, a percentage, a count. */
  format: (value: number) => string;
  /**
   * Whether the legend prints each band's range, or only the direction.
   *
   * `relative` is for a figure a reader compares rather than reads; the exact
   * figure is in the panel (map/Legend.tsx). Defaults to printing ranges.
   */
  bands?: BandsRead;
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
  /**
   * Places to draw on the map, sized by their figure, or none.
   *
   * The same division as `flows`: the overlay knows what is worth drawing and
   * how much it is, the map knows how to draw it. An overlay whose subject is
   * not a province — airports, stations, projects — lives here.
   */
  markers?: Marker[];
  /**
   * Published lines to draw — a railway, and later a route or a corridor.
   *
   * Unlike `flows`, these are not pairs with a figure against them: they are
   * geometry a publisher published, and the map draws them as they are.
   */
  network?: NetworkLine[];
  /**
   * A legend of this overlay's own, where the shared one cannot speak for it.
   *
   * The shared legend explains a choropleth's bands. An overlay that shades
   * nothing — İstanbul's transit is lines and stops in one city — would
   * otherwise leave the reader with colours and no key.
   */
  legend?: ReactNode;
  /**
   * Imagery to draw under the map, from a publisher's own tile service.
   *
   * The only thing in this atlas the reader's browser fetches from a publisher
   * live, which is why the template comes from a dataset and not from here.
   */
  raster?: Raster;
  /**
   * [west, south, east, north] the map should open on, where the country is the
   * wrong frame. Clearing it returns the map to Türkiye.
   */
  focus?: number[];
  /** This overlay's own controls — a currency, a candidate — shown in the rail. */
  controls: ReactNode;
  /** What is known about one province under this overlay. */
  panel: (plaka: number) => ReactNode;
  /**
   * One line about a province the reader is pointing at, or nothing.
   *
   * A choropleth needs none: the shade is the answer. A flow overlay does —
   * once a province is selected, every OTHER province carries a figure that is
   * only visible as an arc's width, and hovering is how a reader asks for it.
   */
  hint?: (plaka: number) => string | null;
  /** Why there is nothing to draw, in the reader's language; null when there is. */
  unavailable: string | null;
}
