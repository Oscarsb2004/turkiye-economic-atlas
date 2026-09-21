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
  /** One point inside each province, where a flow arc starts and ends. */
  points: GeoJson;
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
  const names = ["provinces", "points", "turkiye", "world", "water"] as const;
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
 * One province's figure in one currency for one year, or null.
 *
 * Null is not zero: a year TÜİK has not published for that province is shown as
 * unpublished, never as a zero that would sit at the bottom of the ramp
 * (CLAUDE.md §10). Which years exist is `measure.years`, read from the data —
 * TÜİK adds one every December.
 */
export function figureAt(
  gdp: PerCapitaGdp,
  plaka: number,
  currency: string,
  year: string,
): number | null {
  const series = gdp.provinces.find((p) => p.plaka === plaka)?.per_capita_gdp?.[currency];
  return series?.[year] ?? null;
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

// ── Elections ────────────────────────────────────────────────────────────────

/**
 * One election as the pipeline publishes it.
 *
 * Votes are counts, because counts are what YSK publishes. A share is
 * arithmetic over them, computed here and labelled in the interface rather than
 * written into the data as though a publisher had printed it.
 */
export interface Election {
  election: { slug: string; date: string; title: Text; secim_id: number; secim_turu: number };
  options: Array<{ order: number; name: string; column: string }>;
  provinces: Array<{
    plaka: number;
    name: Text;
    name_ysk: string;
    votes: Record<string, number>;
    turnout: { registered: number; voted: number; valid: number; invalid: number };
    provenance: string;
    formula?: string;
  }>;
  published_total: { votes: Record<string, number>; turnout: Record<string, number> };
}

/**
 * The elections the site offers, newest first, each with the file it reads.
 *
 * The paths are written out rather than built from the slug, because a dataset
 * card names its output and `run.py --check` refuses a card whose declared
 * consumer never mentions the file. A template literal satisfies the compiler
 * and leaves the registry unable to see the link — so the link is spelled out.
 */
export const ELECTIONS = [
  { slug: "2023-cumhurbaskani-2", file: "data/elections/2023-cumhurbaskani-2.json" },
  { slug: "2023-cumhurbaskani-1", file: "data/elections/2023-cumhurbaskani-1.json" },
  { slug: "2023-milletvekili", file: "data/elections/2023-milletvekili.json" },
] as const;

/**
 * `data/elections/index.json` — which elections exist, and what they are called.
 *
 * Generated by atlas/export/bundle.py from the election files themselves, so
 * the time slider can label its stops — the published title and the published
 * date — without fetching three result files, and without this app keeping a
 * hand-typed copy of either. A date shown beside a result is the publisher's.
 */
export interface ElectionIndex {
  generated_at: string;
  elections: Array<{ slug: string; date: string; title: Text }>;
}

export async function loadElectionIndex(): Promise<ElectionIndex> {
  const response = await fetch(asset("data/elections/index.json"));
  if (!response.ok) throw new Error(`index.json: HTTP ${response.status}`);
  return (await response.json()) as ElectionIndex;
}

export async function loadElection(slug: string): Promise<Election> {
  const entry = ELECTIONS.find((election) => election.slug === slug);
  if (!entry) throw new Error(`no such election: ${slug}`);
  const response = await fetch(asset(entry.file));
  if (!response.ok) throw new Error(`${entry.file}: HTTP ${response.status}`);
  return (await response.json()) as Election;
}

/**
 * An option's share of the valid votes in one province, as a percentage.
 *
 * DERIVED, and the interface says so: YSK publishes the counts, and this is our
 * division of one by the other. Null where the province recorded no valid votes
 * — never 0, which would read as "nobody voted for them".
 */
export function voteShare(election: Election, plaka: number, option: string): number | null {
  const province = election.provinces.find((p) => p.plaka === plaka);
  if (!province) return null;
  const valid = province.turnout.valid;
  const votes = province.votes[option];
  if (!valid || votes === undefined) return null;
  return (votes / valid) * 100;
}

// ── Migration ────────────────────────────────────────────────────────────────

/**
 * One year of TÜİK's province-to-province migration matrix.
 *
 * `out` is published: for each province, how many people moved from it to each
 * other province that year, keyed by the destination's plaka code as a string,
 * because JSON object keys are strings.
 *
 * `totals` and `national` are OURS, by addition over those published flows, and
 * carry the formula that made them. The pipeline marks them `derived` and the
 * interface repeats it — a figure this project computed never appears as though
 * a publisher printed it (CLAUDE.md §1).
 */
export interface Migration {
  generated_at: string;
  migration: { year: string; measure: { key: string; label: Text; unit: string } };
  provinces: Array<{
    plaka: number;
    name: Text;
    name_nip: string;
    population: number;
    out: Record<string, number>;
  }>;
  totals: {
    provenance: string;
    formula: string;
    by_plaka: Record<string, { received: number; given: number; net: number }>;
  };
  national: { provenance: string; formula: string; moved: number };
}

/**
 * The years the site offers, oldest first, each with the file it reads.
 *
 * Spelled out for the same reason as ELECTIONS: a dataset card names its output
 * and `run.py --check` refuses a card whose declared consumer never mentions
 * the file, which a template literal would hide.
 */
export const MIGRATION = [
  { year: "2020", file: "data/migration/2020.json" },
  { year: "2021", file: "data/migration/2021.json" },
  { year: "2022", file: "data/migration/2022.json" },
  { year: "2023", file: "data/migration/2023.json" },
  { year: "2024", file: "data/migration/2024.json" },
  { year: "2025", file: "data/migration/2025.json" },
] as const;

export async function loadMigration(year: string): Promise<Migration> {
  const entry = MIGRATION.find((known) => known.year === year);
  if (!entry) throw new Error(`no migration for ${year}`);
  const response = await fetch(asset(entry.file));
  if (!response.ok) throw new Error(`${entry.file}: HTTP ${response.status}`);
  return (await response.json()) as Migration;
}

/** People who moved between two provinces, as published. */
export interface Flow {
  from: number;
  to: number;
  value: number;
  /** Which way it runs for the province the reader has selected. */
  tone: "in" | "out";
}

/**
 * One province's flows with every other, biggest first.
 *
 * `out` is read in both directions — the province's own row for what left it,
 * and every other province's row for what arrived — so nothing here is a figure
 * this project made up. `net` is the difference, which IS ours, and the caller
 * labels it.
 */
export function flowsFor(migration: Migration, plaka: number, kind: "received" | "given" | "net"): Flow[] {
  const mine = migration.provinces.find((province) => province.plaka === plaka);
  if (!mine) return [];
  const flows: Flow[] = [];
  for (const other of migration.provinces) {
    if (other.plaka === plaka) continue;
    const arrived = other.out[String(plaka)] ?? 0;   // other -> me, as published
    const left = mine.out[String(other.plaka)] ?? 0; // me -> other, as published
    if (kind === "received") flows.push({ from: other.plaka, to: plaka, value: arrived, tone: "in" });
    else if (kind === "given") flows.push({ from: plaka, to: other.plaka, value: left, tone: "out" });
    else {
      const net = arrived - left;
      flows.push(net >= 0
        ? { from: other.plaka, to: plaka, value: net, tone: "in" }
        : { from: plaka, to: other.plaka, value: -net, tone: "out" });
    }
  }
  return flows.sort((a, b) => b.value - a.value);
}

// ── Airports ─────────────────────────────────────────────────────────────────

/**
 * One year of airport traffic, from DHMİ, placed by OurAirports.
 *
 * `traffic` on an airport is published: fifteen figures, five measures split
 * into domestic, international and total, exactly as DHMİ prints them, and
 * `published_total` is DHMİ's own national row.
 *
 * `by_province` is OURS, by addition — an airport's figures added into the
 * province OurAirports says it is in — and carries the formula that made it.
 * A province with no airport is absent from it, which the map draws as "no
 * published figure" rather than as a zero.
 */
export interface AirportTraffic {
  generated_at: string;
  traffic: { year: string; label: Text; measures: string[]; slices: string[] };
  airports: Array<{
    icao: string;
    iata: string;
    name: Text;
    kind: string;
    plaka: number;
    province: Text;
    /** [lon, lat], as published. */
    point: [number, number];
    traffic: Record<string, number>;
  }>;
  published_total: Record<string, number>;
  by_province: {
    provenance: string;
    formula: string;
    by_plaka: Record<string, Record<string, number>>;
  };
}

/** The years the site offers, oldest first, each with the file it reads. */
export const AIRPORTS = [
  { year: "2020", file: "data/airports/2020.json" },
  { year: "2021", file: "data/airports/2021.json" },
  { year: "2022", file: "data/airports/2022.json" },
  { year: "2023", file: "data/airports/2023.json" },
  { year: "2024", file: "data/airports/2024.json" },
  { year: "2025", file: "data/airports/2025.json" },
] as const;

export async function loadAirports(year: string): Promise<AirportTraffic> {
  const entry = AIRPORTS.find((known) => known.year === year);
  if (!entry) throw new Error(`no airport traffic for ${year}`);
  const response = await fetch(asset(entry.file));
  if (!response.ok) throw new Error(`${entry.file}: HTTP ${response.status}`);
  return (await response.json()) as AirportTraffic;
}

/**
 * A place on the map with a figure against it.
 *
 * The overlay says where and how much; the map decides how big to draw it, so
 * the two halves stay separable — T9's stations and T12's projects are markers
 * too.
 */
export interface Marker {
  id: string;
  point: [number, number];
  label: string;
  /**
   * What it is worth, where that is published.
   *
   * Absent means there is no figure against this place — a railway station is
   * a station — and the map draws it as a dot of one size rather than sizing it
   * by something invented.
   */
  value?: number;
}

// ── The railway ──────────────────────────────────────────────────────────────

/**
 * The railway network, as OpenStreetMap has it.
 *
 * Every attribute on a line is OSM's. Two things are this project's and the
 * file says so in `network.derivation`: fragments that share an end and agree
 * on every published attribute are joined into one line (with the OSM way ids
 * kept, so the join can be undone), and the geometry is simplified at 50 m.
 *
 * `current_as_of` is OSM's own timestamp for the answer, which is the only date
 * a map of OSM can honestly carry.
 */
export interface RailNetwork {
  generated_at: string;
  network: {
    current_as_of: string;
    label: Text;
    kinds: { highspeed: number; conventional: number };
    derivation: { provenance: string; joined: string; simplified: string; tolerance_m: number };
  };
  lines: Array<{
    id: string;
    name: Text;
    highspeed: boolean;
    usage: string;
    electrified: string;
    gauge: string;
    maxspeed: string;
    operator: string;
    osm_ways: number[];
    points: number;
    line: Array<[number, number]>;
  }>;
}

/**
 * Railway stations and halts, each placed in a province.
 *
 * `placement` says how: `contains` if the published boundary holds the
 * published coordinate, `nearest` where it does not and a province is within
 * two kilometres — Natural Earth's simplified coastline leaves Marmaray out at
 * sea — and `none` where neither is true, which is published as it is.
 */
export interface RailStations {
  generated_at: string;
  stations: Array<{
    id: string;
    name: Text;
    kind: string;
    station: string;
    operator: string;
    network: string;
    train: string;
    plaka: number | null;
    province: Text;
    placement: string;
    point: [number, number];
  }>;
  station_info: {
    current_as_of: string;
    label: Text;
    kinds: { station: number; halt: number };
    unplaced: number;
    placed_by_nearest: number;
  };
  by_province: {
    provenance: string;
    formula: string;
    by_plaka: Record<string, { total: number; halt: number; urban: number }>;
  };
}

export const RAIL_NETWORK_FILE = "data/rail/network.json";
export const RAIL_STATIONS_FILE = "data/rail/stations.json";

export async function loadRailNetwork(): Promise<RailNetwork> {
  const response = await fetch(asset(RAIL_NETWORK_FILE));
  if (!response.ok) throw new Error(`network.json: HTTP ${response.status}`);
  return (await response.json()) as RailNetwork;
}

export async function loadRailStations(): Promise<RailStations> {
  const response = await fetch(asset(RAIL_STATIONS_FILE));
  if (!response.ok) throw new Error(`stations.json: HTTP ${response.status}`);
  return (await response.json()) as RailStations;
}

/**
 * A published line to draw, and which of the palette's colours it takes.
 *
 * `tone` is a slot in registry/palette.yaml, not a colour: an overlay says
 * WHICH kind of line this is, and the map — which owns the palette — decides
 * what that looks like (CLAUDE.md §9). Absent, or 0, means the muted line a
 * network is drawn in when nothing distinguishes it.
 */
export interface NetworkLine {
  id: string;
  line: Array<[number, number]>;
  tone?: number;
}

// ── İstanbul's transit ───────────────────────────────────────────────────────

/**
 * İstanbul's rail and sea network, from the city's GTFS feed.
 *
 * Routes, their stops in the published order, and their shapes — simplified at
 * 20 m, which `feed.derivation` states along with the rest of what is ours: the
 * longest trip in each direction stands for that direction, and the opening
 * view is the extent of the published stops.
 *
 * The feed also carries 376 minibüs and taxi-dolmuş routes. `not_included`
 * says so, and why they are not here.
 */
export interface Transit {
  generated_at: string;
  feed: {
    city: Text;
    label: Text;
    published_on: string;
    services_from: string;
    services_to: string;
    modes: Record<string, number>;
    mode_labels: Record<string, Text>;
    agencies: string[];
    not_included: { routes: number; why: string };
    repaired_rows: number;
    derivation: {
      provenance: string;
      simplified: string;
      tolerance_m: number;
      representative_trip: string;
      view: string;
    };
    /** [west, south, east, north] — where the map should open. */
    view: number[];
  };
  routes: Array<{
    id: string;
    short_name: string;
    long_name: string;
    route_type: number;
    mode: string;
    mode_label: Text;
    agency: string;
    trips: number;
    stops: string[];
    shapes: Array<Array<[number, number]>>;
  }>;
  stops: Array<{ id: string; name: string; point: [number, number] }>;
}

export const TRANSIT_FILE = "data/transit/istanbul.json";

export async function loadTransit(): Promise<Transit> {
  const response = await fetch(asset(TRANSIT_FILE));
  if (!response.ok) throw new Error(`istanbul.json: HTTP ${response.status}`);
  return (await response.json()) as Transit;
}
