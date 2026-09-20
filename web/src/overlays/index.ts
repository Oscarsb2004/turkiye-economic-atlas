/**
 * index.ts — the overlays this atlas has, in the order the rail shows them.
 *
 * This list is the whole registration surface. An overlay is a module exporting
 * one hook; adding migration flows, nightlights or the keystone projects
 * (docs/PLAN.md T7–T12) is a module and a line here.
 *
 * The hooks are called unconditionally and in a fixed order, as hooks must be.
 * `active` is what keeps that cheap: an overlay nobody is looking at holds no
 * data and fetches nothing.
 */

import type { Lang } from "../data/bundle";
import { ELECTION_ID, useElectionOverlay } from "./elections";
import { GDP_ID, useGdpOverlay } from "./gdp";
import type { Clock } from "./timeline";
import type { Overlay } from "./types";

/** What the atlas opens on: the figures that cover every province, every year. */
export const DEFAULT_OVERLAY = GDP_ID;

export function useOverlays({ lang, clock, activeId }: {
  lang: Lang; clock: Clock | null; activeId: string;
}): Overlay[] {
  const context = (id: string) => ({ lang, clock, active: activeId === id });
  return [
    useGdpOverlay(context(GDP_ID)),
    useElectionOverlay(context(ELECTION_ID)),
  ];
}
