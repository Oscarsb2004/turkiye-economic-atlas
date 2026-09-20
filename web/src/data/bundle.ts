/**
 * bundle.ts — the published shapes, mirrored from the Python side.
 *
 * This file mirrors `atlas/core/schema.py`. When the two disagree, the
 * dataclasses are right and the TypeScript is the bug: the pipeline publishes,
 * the app reads.
 *
 * THE LANGUAGE PAIR
 *
 * `Text` is {tr, en} with Turkish required, because TÜİK publishes bilingually
 * but YSK, SBB, AYGM and KGM publish in Turkish only — English is the side
 * routinely missing. `t()` falls back to Turkish rather than rendering nothing,
 * so a reader on the English interface sees the Turkish a publisher wrote
 * instead of a blank where a figure's label should be.
 */

import type { FeatureCollection, GeoJsonProperties, Geometry } from "geojson";

export type Lang = "tr" | "en";

export const LANGS: readonly Lang[] = ["tr", "en"] as const;

export interface Text {
  tr: string;
  en: string;
}

/** A published string in `lang`, falling back to Turkish. Never invents text. */
export function t(text: Text | undefined, lang: Lang): string {
  if (!text) return "";
  return lang === "en" && text.en ? text.en : text.tr;
}

// ── Geometry ─────────────────────────────────────────────────────────────────

/**
 * A province as `scripts/build_geo.mjs` publishes it.
 *
 * `code` is the plaka number (1..81), which is also YSK's `il_ID` and TÜİK's
 * province key. Everything joins on it and nothing joins on a name: "İSTANBUL"
 * lowercased by a locale-naive `toLowerCase()` is "i̇stanbul", not "istanbul".
 */
export interface ProvinceProps {
  code: number;
  name_tr: string;
  name_en: string;
}

// The GeoJSON types MapLibre itself uses, rather than a looser shape of our
// own: a source it cannot accept should be a type error here, not a blank map.
export type GeoJson = FeatureCollection<Geometry, GeoJsonProperties>;

export interface Geo {
  provinces: GeoJson;
  turkiye: GeoJson;
  world: GeoJson;
  water: GeoJson;
}

/** Where the committed geometry lives, honouring the Pages base path. */
export function asset(path: string): string {
  const base = import.meta.env.BASE_URL || "/";
  return `${base.replace(/\/$/, "")}/${path.replace(/^\//, "")}`;
}

export async function loadGeo(): Promise<Geo> {
  const names = ["provinces", "turkiye", "world", "water"] as const;
  const bodies = await Promise.all(
    names.map(async (name) => {
      const response = await fetch(asset(`geo/${name}.json`));
      if (!response.ok) throw new Error(`geo/${name}.json: HTTP ${response.status}`);
      return (await response.json()) as GeoJson;
    }),
  );
  return Object.fromEntries(names.map((name, i) => [name, bodies[i]])) as unknown as Geo;
}

/** The province name in `lang`, from the geometry's own properties. */
export function provinceName(props: ProvinceProps, lang: Lang): string {
  return t({ tr: props.name_tr, en: props.name_en }, lang);
}
