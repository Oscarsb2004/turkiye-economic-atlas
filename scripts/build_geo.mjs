/**
 * build_geo.mjs — the committed map geometry.
 *
 *     node scripts/build_geo.mjs [--force]
 *
 * Every source is PINNED — Natural Earth at tag v5.1.2, geoBoundaries at the
 * commit its own API names — because a moving source would change coastlines
 * with no commit to explain them. mapshaper is a pinned devDependency called
 * through its Node API rather than npx, which would fetch whatever is current.
 *
 * WHY THE PROVINCES ARE GEOBOUNDARIES' AND THE NAMES ARE NATURAL EARTH'S
 *
 * Türkiye's own geodata portal (TUCBS) forbids redistribution outright, so its
 * boundaries cannot be committed here. That left Natural Earth's admin-1 layer,
 * which is public domain and correctly coded TR-01..TR-81 — and far too coarse
 * for a city. At the 8% it shipped at, 49 of 1 334 railway stations sat outside
 * every province, Sabiha Gökçen's coordinate landed in Kocaeli, and the
 * Princes' Islands were not in the file at all, which put İstanbul's ferry
 * piers 6–8 km out to sea. The İstanbul transit overlay is unreadable on it.
 *
 * geoBoundaries' gbOpen ADM1 for Türkiye is OpenStreetMap-derived, open, and
 * carries `shapeISO` = TR-01..TR-81 — the same plaka codes, so the join key is
 * unchanged. It has all 81 provinces in 366 193 points and 712 rings, which
 * includes the islands. What it does NOT carry is an English name, so the
 * `name_tr`/`name_en` pair is joined on from Natural Earth, which still
 * supplies the world, the lakes and the roads.
 *
 * TWO TIERS, AND THE FINER ONE IS WHAT THE PIPELINE MEASURES AGAINST
 *
 *     provinces.json          2%, 200 KB — what the map draws over the country
 *     provinces-detail.json   15%, 1.2 MB — fetched by the app past DETAIL_ZOOM
 *
 * Measured: at 2% the Princes' Islands and the Kadıköy shore are gone and at
 * 15% all four islands, Kadıköy, Sabiha Gökçen, Bozcaada and Gökçeada are each
 * inside the province they belong to. So the DETAIL tier is what a coordinate
 * is placed against (atlas/datasets/rail_network.py) and what the declared
 * geometry checks use, and the overview tier is only ever drawn.
 *
 * WHAT IS WRITTEN
 *
 *     provinces.json          81 il, keyed on the plaka code
 *     provinces-detail.json   the same 81, at the detail tier
 *     points.json             one point inside each il, where a flow arc ends
 *     turkiye.json            the country outline, DISSOLVED from provinces
 *     turkiye-detail.json     and from the detail tier, for the same reason
 *     world.json              every other country, the whole planet, for the globe
 *     water.json              the larger lakes of the world, so Van is not land
 *     roads.json              the main road network, as a reference layer
 *     SOURCES.json            what was downloaded and every command that shaped it
 *
 * Each outline is dissolved from the ALREADY-SIMPLIFIED provinces of its own
 * tier rather than simplified separately: mapshaper preserves topology, so the
 * outline sits exactly on the province fills at every zoom. Two independent
 * simplifications would leave slivers between them.
 */

import { createWriteStream } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";

// mapshaper ships CJS; under ESM the API hides behind .default on some
// versions and not others, so unwrap rather than assume (the atlas this was
// forked from hit the same thing).
import mapshaperPkg from "mapshaper";

const mapshaper = mapshaperPkg.default ?? mapshaperPkg;

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const RAW = join(ROOT, "data", "raw", "geo");
const OUT = join(ROOT, "web", "public", "geo");
const FORCE = process.argv.includes("--force");

const NE = "https://raw.githubusercontent.com/nvkelso/natural-earth-vector/v5.1.2/geojson";

//: The commit geoBoundaries' own API named for the current gbOpen release of
//: TUR ADM1 (read 2026-09-21). A release path would move; this one cannot.
const GB = "https://github.com/wmgeolab/geoBoundaries/raw/9469f09/releaseData/gbOpen/TUR/ADM1";

const SOURCES = {
  boundaries: {
    url: `${GB}/geoBoundaries-TUR-ADM1.geojson`,
    file: "geoBoundaries-TUR-ADM1.geojson",
    publisher: "geoBoundaries (William & Mary geoLab)",
    licence: "Creative Commons Attribution-ShareAlike 2.0, from OpenStreetMap",
    note: "The 81 il as OpenStreetMap draws them; shapeISO is TR-01..TR-81, the plaka codes.",
  },
  admin1: {
    url: `${NE}/ne_10m_admin_1_states_provinces.geojson`,
    file: "ne_10m_admin_1_states_provinces.geojson",
    publisher: "Natural Earth",
    licence: "public domain",
    note: "Read for the name_tr/name_en pair only; the boundaries come from geoBoundaries.",
  },
  countries: {
    url: `${NE}/ne_10m_admin_0_countries.geojson`,
    file: "ne_10m_admin_0_countries.geojson",
    publisher: "Natural Earth",
    licence: "public domain",
    note: "Neighbouring countries, drawn as context and never as data.",
  },
  lakes: {
    url: `${NE}/ne_10m_lakes.geojson`,
    file: "ne_10m_lakes.geojson",
    publisher: "Natural Earth",
    licence: "public domain",
    note: "Van, Tuz and the rest, painted over the province fill so they are not land.",
  },
  roads: {
    url: `${NE}/ne_10m_roads.geojson`,
    file: "ne_10m_roads.geojson",
    publisher: "Natural Earth",
    licence: "public domain",
    note: "The reference road network. Not a highway map: 1 304 segments cover Türkiye, and KGM's own network cannot be reproduced here (CLAUDE.md §3).",
  },
};

//: Türkiye and a little sea around it, for clipping the road network.
const COUNTRY_BBOX = "25,35,45.5,42.5";

/**
 * How hard each tier is simplified.
 *
 * Measured on the probe points in the header: 2% loses the islands and the
 * Kadıköy shore, 5% recovers three of the four Princes' Islands, 15% recovers
 * all of them and is still a 1.2 MB file rather than a dataset. 25% adds
 * another 670 KB and no probe point changes.
 */
const OVERVIEW = "2%";
const DETAIL = "15%";

/** mapshaper command lines, kept verbatim so SOURCES.json can publish them. */
const BUILDS = {
  // The name pair, extracted first so the province builds can join it on. Kept
  // as a file rather than inlined into a -define, so SOURCES.json publishes a
  // command a person can run rather than 81 names on one line.
  names: [
    "-i {admin1}",
    '-filter "iso_a2 === \'TR\'"',
    '-each "code = +iso_3166_2.slice(3), name_tr = name_tr || name, name_en = name_en || name"',
    "-filter-fields code,name_tr,name_en",
    "-o {raw}/province-names.csv format=csv",
  ],
  provinces: [
    "-i {boundaries}",
    // The plaka code is the join key, so it is published as a number AND kept
    // as the feature id; everything else geoBoundaries carries is dropped.
    '-each "code = +shapeISO.slice(3)"',
    "-filter-fields code",
    "-join {raw}/province-names.csv keys=code,code field-types=code:number",
    `-simplify ${OVERVIEW} keep-shapes`,
    "-clean",
    "-o {out}/provinces.json format=geojson precision=0.0001 id-field=code",
  ],
  "provinces-detail": [
    "-i {boundaries}",
    '-each "code = +shapeISO.slice(3)"',
    "-filter-fields code",
    "-join {raw}/province-names.csv keys=code,code field-types=code:number",
    `-simplify ${DETAIL} keep-shapes`,
    "-clean",
    "-o {out}/provinces-detail.json format=geojson precision=0.00001 id-field=code",
  ],
  // One point inside each province, for the ends of a flow arc. `inner` is not
  // a bbox centre and not a centroid: mapshaper picks a point that actually
  // lies within the polygon, which for a country of crescents and peninsulas
  // is the difference between an arc leaving the province and an arc leaving
  // the sea. Built FROM the overview provinces, which is the tier the arcs are
  // drawn over, so a point and its province can never drift apart.
  points: [
    "-i {out}/provinces.json",
    "-points inner",
    "-o {out}/points.json format=geojson precision=0.0001 id-field=code",
  ],
  turkiye: [
    "-i {out}/provinces.json",
    "-dissolve2",
    // A field forces a FeatureCollection; with no attributes mapshaper writes a
    // bare GeometryCollection, which is valid GeoJSON but a different shape for
    // every consumer to special-case.
    "-each \"name = 'Türkiye'\"",
    "-o {out}/turkiye.json format=geojson precision=0.0001",
  ],
  "turkiye-detail": [
    "-i {out}/provinces-detail.json",
    "-dissolve2",
    "-each \"name = 'Türkiye'\"",
    "-o {out}/turkiye-detail.json format=geojson precision=0.00001",
  ],
  // THE WHOLE PLANET, BECAUSE THE MAP IS A GLOBE
  //
  // This was clipped to a box around Türkiye while the map was a flat Web
  // Mercator square, where nothing past the box was ever on screen. On a globe
  // the box is a rectangle of countries floating on an empty sphere — the "2D
  // square of the world" the owner asked to be rid of. 6% of Natural Earth's
  // 1:10m countries is 639 KB for all 257, measured against 3% (347 KB, visibly
  // faceted coastlines on a turning globe) and 10% (1 MB, no difference a reader
  // can see at the zooms the rest of the world is drawn at).
  world: [
    "-i {countries}",
    '-filter "ISO_A2 !== \'TR\'"',
    '-each "name = NAME_EN"',
    "-filter-fields name",
    "-simplify 6% keep-shapes",
    "-clean",
    "-o {out}/world.json format=geojson precision=0.001",
  ],
  water: [
    "-i {lakes}",
    // The larger lakes of the whole world — the Caspian, the Great Lakes and
    // Victoria as well as Van and Tuz. `this.area` is square METRES for
    // unprojected data, not square degrees: a threshold of 0.3 kept all 1 355
    // lakes, which is how that was found. 500 km² keeps Tuz Gölü, the smallest
    // lake this atlas names, and drops the specks.
    '-filter "this.area > 5e8"',
    '-each "name = name || \'\'"',
    "-filter-fields name",
    "-simplify 10% keep-shapes",
    "-o {out}/water.json format=geojson precision=0.001",
  ],
  // The reference layer a reader reaches for when a railway or a flow needs a
  // place on it. `type` is Natural Earth's own word for what a segment is, kept
  // as `kind` so the map can draw a motorway heavier than a lane; `label` is
  // the E-road number where the source carries one, and empty where it does not.
  roads: [
    "-i {roads}",
    `-clip bbox=${COUNTRY_BBOX}`,
    // Ferry routes and one track share this layer and are not roads. A
    // reference layer that draws a ferry crossing as a road is worse than one
    // that leaves it out, and the ferries this atlas does draw are İBB's own
    // published routes, with timetables behind them (overlays/transit.tsx).
    '-filter "type !== \'Ferry Route\' && type !== \'Ferry, seasonal\' && type !== \'Track\'"',
    '-each "kind = type || \'\', label = label || \'\'"',
    "-filter-fields kind,label",
    "-simplify 15% keep-shapes",
    "-o {out}/roads.json format=geojson precision=0.001",
  ],
};

async function download(spec) {
  const path = join(RAW, spec.file);
  const exists = await readFile(path).then(() => true, () => false);
  if (exists && !FORCE) {
    console.log(`  cached  ${spec.file}`);
    return path;
  }
  console.log(`  fetch   ${spec.url}`);
  const response = await fetch(spec.url, { redirect: "follow" });
  if (!response.ok) throw new Error(`${spec.url}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
  return path;
}

async function run(name, commands, paths) {
  const line = commands.join(" ").replace(/\{(\w+)\}/g, (_, key) => paths[key]);
  await mapshaper.runCommands(line);
  // The names build writes a CSV, which has no features to count.
  if (name === "names") {
    const rows = (await readFile(join(RAW, "province-names.csv"), "utf8")).trim().split("\n");
    console.log(`  built   province-names.csv  ${rows.length - 1} names`);
    return { rows: rows.length - 1, command: commands.join(" ") };
  }
  const body = JSON.parse(await readFile(join(OUT, `${name}.json`), "utf8"));
  const count = body.features?.length ?? body.geometries?.length ?? 0;
  console.log(`  built   ${name}.json  ${count} features`);
  return { features: count, command: commands.join(" ") };
}

await mkdir(RAW, { recursive: true });
await mkdir(OUT, { recursive: true });

const paths = { out: OUT, raw: RAW };
for (const [key, spec] of Object.entries(SOURCES)) paths[key] = await download(spec);

const built = {};
for (const [name, commands] of Object.entries(BUILDS)) built[name] = await run(name, commands, paths);

// Every province must survive the simplification, in BOTH tiers: a dropped one
// is a hole in every overlay that joins on the plaka code, and it would be
// invisible on a map of a country this shape. The name join is checked here
// too — a province whose name did not come across would render as a blank
// heading in the panel and nothing would say why.
for (const tier of ["provinces", "provinces-detail"]) {
  const provinces = JSON.parse(await readFile(join(OUT, `${tier}.json`), "utf8"));
  const codes = provinces.features.map((f) => f.properties.code).sort((a, b) => a - b);
  const missing = Array.from({ length: 81 }, (_, i) => i + 1).filter((c) => !codes.includes(c));
  if (missing.length) throw new Error(`${tier}.json is missing plaka codes: ${missing.join(", ")}`);
  const unnamed = provinces.features.filter((f) => !f.properties.name_tr || !f.properties.name_en);
  if (unnamed.length) {
    throw new Error(`${tier}.json has ${unnamed.length} provinces with no name: `
      + unnamed.map((f) => f.properties.code).join(", "));
  }
  console.log(`  checked ${tier}: ${codes.length} provinces, plaka ${codes[0]}..${codes[codes.length - 1]}, all named`);
}

// Every province needs its point, or an arc would have nowhere to start.
const provinces = JSON.parse(await readFile(join(OUT, "provinces.json"), "utf8"));
const codes = provinces.features.map((f) => f.properties.code).sort((a, b) => a - b);
const points = JSON.parse(await readFile(join(OUT, "points.json"), "utf8"));
const pointCodes = new Set(points.features.map((f) => f.properties.code));
const withoutPoint = codes.filter((c) => !pointCodes.has(c));
if (withoutPoint.length) throw new Error(`points.json is missing plaka codes: ${withoutPoint.join(", ")}`);
console.log(`  checked ${pointCodes.size} inner points, one per province`);

await writeFile(join(OUT, "SOURCES.json"), JSON.stringify({
  generated_by: "scripts/build_geo.mjs",
  mapshaper: JSON.parse(await readFile(join(ROOT, "node_modules", "mapshaper", "package.json"), "utf8")).version,
  sources: SOURCES,
  builds: built,
  tiers: { overview: OVERVIEW, detail: DETAIL },
  notes: [
    "Natural Earth is pinned at tag v5.1.2 and geoBoundaries at commit 9469f09; a moving source would change coastlines with no commit.",
    "The province shapes are geoBoundaries' (OpenStreetMap-derived); the name_tr/name_en pair is joined on from Natural Earth.",
    "shapeISO TR-01..TR-81 are the plaka codes, which YSK's il_ID and TÜİK's province tables also use.",
    "Each outline is dissolved from the already-simplified provinces of its own tier, so the outline sits exactly on the fills.",
    "The DETAIL tier is what coordinates are placed against and what the declared geometry checks use; the overview tier is only drawn.",
    "Türkiye's own TUCBS geodata forbids redistribution, which is why the boundaries here are not the government's.",
  ],
}, null, 2) + "\n", "utf8");
console.log("  wrote   SOURCES.json");
