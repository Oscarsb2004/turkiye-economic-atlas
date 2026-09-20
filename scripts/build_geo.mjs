/**
 * build_geo.mjs — the committed map geometry.
 *
 *     node scripts/build_geo.mjs [--force]
 *
 * Every source is PINNED. Natural Earth is read at tag v5.1.2 rather than from
 * a "current" path, because a moving source would change coastlines with no
 * commit to explain them, and mapshaper is a pinned devDependency called
 * through its Node API rather than npx, which would fetch whatever is current.
 *
 * WHY NATURAL EARTH FOR PROVINCES
 *
 * Türkiye's own geodata portal (TUCBS) forbids redistribution outright, so its
 * boundaries cannot be committed here. Natural Earth's admin-1 layer is public
 * domain and, checked 2026-09-20, carries exactly 81 Turkish features whose
 * `iso_3166_2` runs TR-01..TR-81 with no gaps. Those numbers ARE the plaka
 * codes, which is what YSK's il_ID and TÜİK's province tables both key on, so
 * one download gives geometry and the join key together. It also carries
 * name_tr and name_en, which is the published language pair.
 *
 * Measured the same day against YSK's own province list: same 81 codes, and
 * zero name disagreements.
 *
 * WHAT IS WRITTEN
 *
 *     provinces.json   81 il, simplified, keyed on the plaka code
 *     points.json      one point inside each il, where a flow arc starts and ends
 *     turkiye.json     the country outline, DISSOLVED from provinces.json
 *     world.json       every other country, for context around the edges
 *     water.json       lakes, so Van and Tuz are not painted as land
 *     SOURCES.json     what was downloaded and every command that shaped it
 *
 * turkiye.json is dissolved from the ALREADY-SIMPLIFIED provinces rather than
 * downloaded separately: mapshaper preserves topology, so the outline sits
 * exactly on the province fills at every zoom. Two independent simplifications
 * would leave slivers between them.
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

const SOURCES = {
  admin1: {
    url: `${NE}/ne_10m_admin_1_states_provinces.geojson`,
    file: "ne_10m_admin_1_states_provinces.geojson",
    publisher: "Natural Earth",
    licence: "public domain",
    note: "Provinces of every country at 1:10m; the 81 Turkish features carry iso_3166_2 TR-01..TR-81.",
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
};

//: Everything a reader can see around Türkiye at the zooms this map uses.
//: Anything outside it is weight in the committed file and nothing on screen.
const CONTEXT_BBOX = "19,32,52,46";

/** mapshaper command lines, kept verbatim so SOURCES.json can publish them. */
const BUILDS = {
  provinces: [
    "-i {admin1}",
    '-filter "iso_a2 === \'TR\'"',
    // The plaka code is the join key, so it is published as a number AND kept
    // as the feature id; everything else Natural Earth carries is dropped.
    '-each "code = +iso_3166_2.slice(3), name_tr = name_tr || name, name_en = name_en || name"',
    "-filter-fields code,name_tr,name_en",
    "-simplify 8% keep-shapes",
    "-clean",
    "-o {out}/provinces.json format=geojson precision=0.0001 id-field=code",
  ],
  // One point inside each province, for the ends of a flow arc. `inner` is not
  // a bbox centre and not a centroid: mapshaper picks a point that actually
  // lies within the polygon, which for a country of crescents and peninsulas
  // is the difference between an arc leaving the province and an arc leaving
  // the sea. Built FROM the simplified provinces, so a point and its province
  // can never drift apart.
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
  world: [
    "-i {countries}",
    '-filter "ISO_A2 !== \'TR\'"',
    '-each "name = NAME_EN"',
    "-filter-fields name",
    // Context, not data: the neighbours a reader can see past the border. The
    // whole world at 1:10m is 400 KB of coastline nobody looks at on this map.
    `-clip bbox=${CONTEXT_BBOX}`,
    "-simplify 4% keep-shapes",
    "-clean",
    "-o {out}/world.json format=geojson precision=0.01",
  ],
  water: [
    "-i {lakes}",
    `-clip bbox=${CONTEXT_BBOX}`,
    // Anything smaller than this is invisible at the zooms this map uses.
    '-filter "this.area > 0.02"',
    '-each "name = name || \'\'"',
    "-filter-fields name",
    "-simplify 10% keep-shapes",
    "-o {out}/water.json format=geojson precision=0.001",
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
  const response = await fetch(spec.url);
  if (!response.ok) throw new Error(`${spec.url}: HTTP ${response.status}`);
  await pipeline(Readable.fromWeb(response.body), createWriteStream(path));
  return path;
}

async function run(name, commands, paths) {
  const line = commands.join(" ").replace(/\{(\w+)\}/g, (_, key) => paths[key]);
  await mapshaper.runCommands(line);
  const body = JSON.parse(await readFile(join(OUT, `${name}.json`), "utf8"));
  const count = body.features?.length ?? body.geometries?.length ?? 0;
  console.log(`  built   ${name}.json  ${count} features`);
  return { features: count, command: commands.join(" ") };
}

await mkdir(RAW, { recursive: true });
await mkdir(OUT, { recursive: true });

const paths = { out: OUT };
for (const [key, spec] of Object.entries(SOURCES)) paths[key] = await download(spec);

const built = {};
for (const [name, commands] of Object.entries(BUILDS)) built[name] = await run(name, commands, paths);

// Every province must survive the simplification: a dropped one is a hole in
// every overlay that joins on the plaka code, and it would be invisible on a
// map of a country this shape.
const provinces = JSON.parse(await readFile(join(OUT, "provinces.json"), "utf8"));
const codes = provinces.features.map((f) => f.properties.code).sort((a, b) => a - b);
const missing = Array.from({ length: 81 }, (_, i) => i + 1).filter((c) => !codes.includes(c));
if (missing.length) throw new Error(`provinces.json is missing plaka codes: ${missing.join(", ")}`);
console.log(`  checked ${codes.length} provinces, plaka ${codes[0]}..${codes[codes.length - 1]}, none missing`);

// Every province needs its point, or an arc would have nowhere to start.
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
  notes: [
    "Natural Earth is pinned at tag v5.1.2; a moving source would change coastlines with no commit.",
    "turkiye.json is dissolved from the already-simplified provinces.json, so the outline sits exactly on the fills.",
    "iso_3166_2 TR-01..TR-81 are the plaka codes, which YSK's il_ID and TÜİK's province tables also use.",
    "Türkiye's own TUCBS geodata forbids redistribution, which is why the boundaries here are Natural Earth's.",
  ],
}, null, 2) + "\n", "utf8");
console.log("  wrote   SOURCES.json");
