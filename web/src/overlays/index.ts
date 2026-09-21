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
import { AVIATION_ID, useAviationOverlay } from "./aviation";
import { ECONOMY_ID, useEconomyOverlay } from "./economy";
import { ELECTION_ID, useElectionOverlay } from "./elections";
import { MIGRATION_ID, useMigrationOverlay } from "./migration";
import { NIGHTLIGHTS_ID, useNightlightsOverlay } from "./nightlights";
import { TRANSIT_ID, useTransitOverlay } from "./transit";
import type { Clock } from "./timeline";
import type { Overlay } from "./types";

/** What the atlas opens on: the figures that cover every province, every year. */
export const DEFAULT_OVERLAY = ECONOMY_ID;

export function useOverlays({ lang, clock, activeId, selected }: {
  lang: Lang; clock: Clock | null; activeId: string; selected: number | null;
}): Overlay[] {
  const context = (id: string) => ({ lang, clock, active: activeId === id, selected });
  return [
    useEconomyOverlay(context(ECONOMY_ID)),
    useElectionOverlay(context(ELECTION_ID)),
    useMigrationOverlay(context(MIGRATION_ID)),
    useAviationOverlay(context(AVIATION_ID)),
    useTransitOverlay(context(TRANSIT_ID)),
    useNightlightsOverlay(context(NIGHTLIGHTS_ID)),
  ];
}
