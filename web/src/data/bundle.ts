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

// ── Published data ───────────────────────────────────────────────────────────

/** `data/provinces/gdp-per-capita.json`, as the pipeline writes it. */
export interface PerCapitaGdp {
  generated_at: string;
  measure: { key: string; label: Text; currencies: string[]; years: Record<string, string[]> };
  provinces: Array<{
    plaka: number;
    nuts3: string;
    name: Text;
    per_capita_gdp: Record<string, Record<string, number>>;
  }>;
  sources: Array<{ url: string; licence: string; retrieved_at: string }>;
}

export async function loadPerCapitaGdp(): Promise<PerCapitaGdp> {
  const response = await fetch(asset("data/provinces/gdp-per-capita.json"));
  if (!response.ok) throw new Error(`gdp-per-capita.json: HTTP ${response.status}`);
  return (await response.json()) as PerCapitaGdp;
}

/**
 * The newest year a province has a figure for, in one currency, or null.
 *
 * Null is not zero: a province TÜİK has not published is shown as unpublished,
 * never as a zero that would sit at the bottom of any future ramp.
 */
export function latestFigure(
  gdp: PerCapitaGdp,
  plaka: number,
  currency: string,
): { year: string; value: number } | null {
  const series = gdp.provinces.find((p) => p.plaka === plaka)?.per_capita_gdp?.[currency];
  if (!series) return null;
  const years = Object.keys(series).sort();
  const year = years[years.length - 1];
  return year === undefined ? null : { year, value: series[year] };
}

/** `data/meta.json` — the sources and licences, generated from the cards. */
export interface Meta {
  app: string;
  schema_version: string;
  generated_at: string;
  licences: Record<string, { name: string; url: string; attribution?: string }>;
  sources: Record<string, { title: string; publisher: string; licence: string; page: string }>;
  files: string[];
}

export async function loadMeta(): Promise<Meta> {
  const response = await fetch(asset("data/meta.json"));
  if (!response.ok) throw new Error(`meta.json: HTTP ${response.status}`);
  return (await response.json()) as Meta;
}

/**
 * `data/palette.json` — registry/palette.yaml, a validated artifact.
 *
 * The app reads the colours rather than carrying its own copy: the palette was
 * produced by a documented derivation and checked by a validator, and a second
 * copy in CSS would be an unvalidated one (CLAUDE.md §9).
 */
export interface Palette {
  surface: { chart: string; page: string };
  ink: Record<string, string>;
  categorical: Array<{ slot: number; hue: string; step: number; hex: string }>;
  sequential: { hue: string; steps: string[] };
}

export async function loadPalette(): Promise<Palette | null> {
  const response = await fetch(asset("data/palette.json"));
  if (!response.ok) return null;
  return (await response.json()) as Palette;
}

/**
 * Set every colour the palette defines, so the file is the single source.
 *
 * Surfaces included: the palette's contrast results were measured against its
 * own surface, so a page that paints a different background is not the page
 * that was validated.
 */
export function applyPalette(palette: Palette | null): void {
  if (!palette) return;
  const root = document.documentElement;
  root.style.setProperty("--surface-0", palette.surface.page);
  root.style.setProperty("--surface-1", palette.surface.chart);
  root.style.setProperty("--text-1", palette.ink.primary);
  root.style.setProperty("--text-2", palette.ink.secondary);
  root.style.setProperty("--text-3", palette.ink.muted);
  root.style.setProperty("--line", palette.ink.axis);
  for (const entry of palette.categorical) {
    root.style.setProperty(`--series-${entry.slot}`, entry.hex);
  }
  palette.sequential.steps.forEach((hex, i) => {
    root.style.setProperty(`--seq-${i}`, hex);
  });
}
