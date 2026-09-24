# Türkiye Economic Atlas — fork plan

_The queue. T0 is done — this repository is its result. Everything below it is still ahead._

## Context

`canada-economic-atlas` reproduces Canadian government data as a map and charts, and was just
restructured (S0–S9) onto declared cards, one writer, and a byte-level identity gate — which is
what makes a fork cheap: the machinery no longer knows anything about Canada.

This forks it to model **Türkiye**, keeping the same visual format, and adds what the Canadian
atlas never had: **a value-driven choropleth with a time slider**, plus **flow layers between
provinces** and a **satellite nightlights overlay**.

## Decisions taken with the owner (2026-09-19)

| Question | Decision |
| --- | --- |
| Repo shape | **Fresh repo** (`turkiye-economic-atlas`), seeded from the atlas code, Canadian readers/cards/data stripped |
| Languages | **Turkish + English** — `Text` becomes `{tr, en}`, `Lang = "tr" \| "en"` |
| Vote map | **One party at a time, shaded by its published vote share** — keeps the validated five-slot palette intact |
| First milestone | **Boundaries + elections + GDP per capita**, with the slider |
| Connections | **All four, in stages**: internal migration first, then flights, then rail, then city GTFS |
| Satellite | **VIIRS nightlights** as a province activity layer beside TÜİK GDP per capita |
| Project pins | **Keystone projects only** — the flagship ones politicians and analysts actually talk about, each geolocated. Not the full SBB list |
| Source posture | **Personal, non-commercial project.** Prefer open datasets (OSM, public domain, open licences). Record each source's terms as read and dated, but a restrictive or missing licence is a note on the card, not a blocker — except where a publisher explicitly forbids reproduction, where we use an open alternative and cite them instead |

## Sources verified 2026-09-19

| Need | Source | Licence / terms | Verdict |
| --- | --- | --- | --- |
| GDP per capita by province | TÜİK *İl Bazında GSYH* (2024 bulletin `53930`), `veriportali.tuik.gov.tr` | Reuse permitted, attribution required, no permission needed (`tuik.gov.tr/Kurumsal/Yasal_Uyari`, undated → record "read 2026-09-19") | ✅ Use |
| Internal migration (il→il) | TÜİK Nüfus İstatistikleri Portalı, *İller Arası Göç* (`nip.tuik.gov.tr/?value=IllerArasiGoc`) | same TÜİK terms | ✅ **In, T7** — 81×80 pairs a year, 2008–2025, through `POST /Home/IlYilIcGocIllerArasiForTable`. Each flow appears twice, mirrored, which is the check. The derived national total reproduces TÜİK's own headline exactly |
| Election results | **YSK Açık Veri Portalı** `acikveri.ysk.gov.tr`, JSON API at `/api/get*` | no terms page found; record as read-and-undated, like `aisstream-unstated` | ✅ **Verified working** — district-level results, 2009–2026, no auth. See below |
| Province polygons | **geoBoundaries gbOpen TUR ADM1** (OSM-derived, pinned at commit `9469f09`), with `name_tr`/`name_en` joined from Natural Earth | CC-BY-SA 2.0 / public domain | ✅ Use, two tiers. Natural Earth admin-1 at 8% lost the Princes' Islands and put 49 of 1 334 stations outside every province; TUCBS/ATLAS forbids redistribution → out |
| Place names | OSM `place=city` + `place=town` via Overpass — 1 005 nodes | ODbL | ✅ Use. Natural Earth's populated places has 83 Turkish entries, so twelve provinces would have no name |
| Major roads | Natural Earth 1:10m roads, clipped to Türkiye — 1 457 segments | public domain | ✅ Use as a reference layer. The same question asked of OSM is 37 434 ways; KGM's own network cannot be reproduced (CLAUDE.md §3) |
| The cosmos | JPL Horizons (planets, orbits); HEASARC TAP — Hipparcos New Reduction, 2MASS Redshift Survey; NASA SVS Deep Star Maps 2020 (the Milky Way's glow); WMAP9 H0 from NASA LAMBDA | Horizons and HEASARC state no terms (recorded as unstated); SVS public domain | ✅ In, R2. Every distance is a formula over a catalogue column, stated in the file |
| USD→CAD rate | Bank of Canada Valet, series `FXAUSDCAD` (annual average) | permitted with attribution | ✅ Use. The only way a Canadian-dollar figure can exist here, and it is `DERIVED` with the formula and the rate published beside it |
| Rail network + stations | **OSM through the Overpass API** (`overpass-api.de`), asked for `railway=rail` with `usage=main` or `highspeed=yes`, and station/halt nodes | ODbL, attribution + share-alike | ✅ **In, T9** — 8 MB an answer, cached on the query body. Geofabrik's 612 MB PBF is too heavy and HDX's 800 KB HOT export carries no `usage`, `highspeed`, `electrified`, `gauge` or `operator`, which is exactly what distinguishes a YHT line |
| Roads / intercity links | OSM (same extract) | ODbL | ✅ Use. **KGM's own terms forbid reproducing its content**, so KGM PDFs are cited as corroboration, never re-hosted |
| Airports + flight network | OurAirports `airports.csv` (nightly, **public domain**); DHMİ *Havalimanları Karşılaştırmalı İstatistikleri* (monthly xlsx, cumulative) | public domain / no published terms — `dhmi-unstated` | ✅ **In, T8** for airports and their traffic. ⚠️ The ROUTE network is not: DHMİ publishes per-airport totals, not origin–destination pairs, and no open Turkish source does. OpenFlights' routes stopped being maintained in 2014 and OpenSky's flight tables now need an account |
| City transit | İstanbul `data.ibb.gov.tr`, *Public Transport GTFS Data* — eight CSVs, not a zip | İBB Open Data Licence, read 2026-09-20: copy, publish, distribute, adapt, commercially or not, with attribution | ✅ **In, T10**. Two departures from the spec: the files are Windows-1254 rather than UTF-8, and two lines are quoted end to end. İETT's separate bus feed is still out |
| Nightlights | **NASA GIBS WMTS** — `VIIRS_SNPP_GapFilled_BRDF_Corrected_DayNightBand_Radiance`, tiles, no account | NASA CC0, acknowledgement asked (read 2026-09-21) | ✅ **In, T11** as an imagery layer. Aggregating it per province would mean VNL v2 GeoTIFFs from EOG (which now need a token) or Black Marble HDF5 (Earthdata login) plus zonal statistics — a different undertaking |
| AIS | aisstream.io — MID **271** (TR) + **316** (CA) | no terms page exists (`/terms` 404) → `aisstream-unstated` licence card, as Canada already does | ✅ Use. Bounding box + client-side MID filter (the API caps MMSI filters at 200) |
| Turkish vessel register | No public machine-readable register exists. Build one from **Türk Loydu TL EASY** (`tleasy.turkloydu.org`, public search, IMO + flag + owner) plus UAB fleet statistics | no terms shown | ⚠️ Partial — TL-classed ships only. Canada keeps its full register join; document the asymmetry |
| Keystone projects | SBB *Yatırım Programı* (annual PDF, every project has a *proje numarası*), AYGM project pages (narrative, Turkish only) | no terms published | ⚠️ Scrape, hand-pick the flagships, geolocate from public information, mark placements `DERIVED` |

### The YSK API — spike done 2026-09-20, it works

Unauthenticated, returns district-level results. The four calls a reader needs:

| Call | Returns |
| --- | --- |
| `getSecimDetayList` | The catalogue: 7 election types, each election with `secim_ID`, date, name |
| `getIlList?secimId=&secimTuru=&sandikTuru=1&yurtIciDisi=1` | **All 81 provinces, `il_ID` = the plaka code** — the join key to TÜİK and to the map |
| `getSandikSecimSonucBaslikList?secimId=&secimTuru=` | The column map: which `partiN_ALDIGI_OY` / `bagimsizN_ALDIGI_OY` is which party or candidate |
| `getSecimSandikSonucList?…` (20 params) | The results, 138 fields per row |

**`sandikTuru=0&sorguTuru=1` is the combination that returns rows** — district (ilçe)
aggregates, which sum to province. `sandikTuru=1` gives `[]` for every `sorguTuru`.
**Do not use `getSecimList`**: it answers 200 with the right row count and every field null,
and looks like a dead stub. That dead end cost an hour on 2026-09-19.

Verified end to end on the 2023 presidential runoff (`secimId=20240`, `secimTuru=9`): Bayburt's
three districts give Erdoğan 82.48% and Kılıçdaroğlu 17.52% of candidate votes, matching the
published result.

Coverage: presidential 2014, 2018, 2023 (both rounds — the runoff has its own `secim_ID`);
parliamentary 2011, 2015 June, 2015 November, 2018, 2023; local 2009, 2014, 2019, 2024, plus
the 2019 İstanbul re-run, a 2024 renewal and a 2026 by-election; referendums 2010 and 2017.

**The 2023 parliamentary table carries 29 party columns** — the evidence behind the
one-party-at-a-time ramp: a winner-takes-all map would need 29 categorical colours against a
palette capped at five.

Results arrive per district, so province figures are **summed by us**, marked `DERIVED` with
the formula stated, while district figures stay exactly as published.

## What forks unchanged

`atlas/core/{clock,jsonio,frames,records}.py` · `atlas/run.py` (the only writer) ·
`atlas/shells/acquire/{fetcher,arcgis_layer,site_crawl,document_text,workbook_edition,commons_media}.py` ·
all of `atlas/shells/transform/` and `check/` · `atlas/status.py` · `verify/golden.py` +
`verify/golden_site/` · `verify/checks.py` (11 declarative check kinds) · `verify/geo.py` ·
root `run.py` · `.github/workflows/deploy.yml` · **`registry/palette.yaml` verbatim** ·
frontend `TabStrip`, `FilterRow`, `tabs/store.ts`, `charts/Plot.tsx`, `charts/TableView.tsx`,
`theme/applyPalette.ts`.

**Fix in the first commit** — two inherited duplicate definitions where an edit to the first
copy is silently discarded: `class Passage` twice in `atlas/core/records.py` (lines 71–85,
87–101) and `PASSAGE_COLUMNS`/`PASSAGE_KEYS` twice in `atlas/core/frames.py` (84–94, 96–106).

## What is replaced

All 13 `atlas/readers/` modules · all 21 `registry/sources/` cards · all 20
`registry/datasets/` cards · `registry/{sectors,provinces,events,strategies,corridors,budgets,mpo_naics,checks,licences}.yaml` ·
`verify/run.py` (1,152 lines, ~85% Canada-specific) · most of `web/src`.

`registry/schemas/source.schema.json` is a 51-property union with `additionalProperties: false`
and only `title/publisher/licence` required — start it near-empty, add one property per Turkish
card. Port `verify/run.py` **into `registry/checks.yaml`**, not branch by branch: its `regions:`
block already shows the pattern (`canada: {file: …, name_fields: [PRENAME, PRFNAME]}` becomes
`turkiye:` with `[NAME_TR, NAME_EN]`, no code change).

## The data model — no new record types

`Observation(entity, category, period, measure, value, unit, status, source_table, provenance)`
plus the existing `panel` frame profile fit every new overlay:

| Overlay | entity | category | period | measure | unit |
| --- | --- | --- | --- | --- | --- |
| Election | il code (`TR34`) | party/candidate | election date | `votes`, `vote_share` | `count`, `percent` |
| GDP per capita | il code | `""` | year | `gdp_per_capita` | `TRY`, `USD` |
| Nightlights | il code | `""` | year/month | `radiance_mean` | `nW/cm²/sr` |
| Migration | il code (destination) | il code (origin) | year | `migrants` | `count` |

Migration reuses `category` as the origin province, so an 81×81 matrix is ordinary panel rows —
no new record type, and the existing frame validation applies unchanged. Vote shares are
reproduced as YSK publishes them; anything we compute is `DERIVED` with its formula stated.

## Stages

Each stage ends green and is one PR, as S0–S9 were.

| Stage | What |
| --- | --- |
| **T0** | Seed the repo; strip Canadian readers/cards/data; fix the two duplicate definitions; `run.py --check` green and tests passing with zero datasets |
| **T1** | ✅ `Text{tr,en}` through the Python half: Turkish required, English optional and falling back to Turkish; every frame column renamed `_tr`/`_en`. The TypeScript mirror moved to T2, where the app and `tsc --noEmit` exist to prove it |
| **T2** | ✅ `web/` built fresh — `Lang = "tr" \| "en"`, the i18n dictionary Turkish-first, a MapLibre province map with hover and selection. Geometry from Natural Earth admin-1: 81 provinces whose `iso_3166_2` is the plaka code, cross-checked against YSK's own province list (same 81 codes, zero name disagreements). The whole committed geometry is 92 KB |
| **T3** | ✅ `province-gdp-per-capita` from TÜİK: 81 provinces, 810 observations, 2020–2024 in lira and dollars. The İBBS↔plaka crosswalk lives in `registry/provinces.yaml` (two provinces differ by a circumflex). Bundle, declared gates, and the first golden master `data-2026-09-20`, which replays identical |
| **T4** | ✅ The choropleth: six quantile bands from the palette's already-validated sequential ramp, a legend printing each band's real range and saying the banding is ours, a currency switch, and "no published figure" as its own swatch rather than the lowest shade. The app's chrome now comes from the palette too, since its contrast was measured against that surface |
| **T5** | ✅ Elections: the 2023 presidential rounds and the parliamentary election, every province as YSK publishes them, with its own national row reproduced so `map_sums_to_published_total` can check the 81 against the publisher's sum. Four provinces are split into electoral districts in a parliamentary election and are marked DERIVED with the formula. Overlay, election and option pickers on the map |
| **T6** | ✅ One clock for every overlay: the slider sets an instant and each overlay snaps its own periods to it, so the 2023 runoff and GDP per capita stay on the same moment across a switch. An overlay is now a module exporting a hook (`web/src/overlays/`), listed in a left rail with its own controls and its publisher read from meta.json; the elections became stops on the clock, which retired the picker that showed readers a slug. Election titles and dates come from a generated `elections/index.json`, gated like every other file |
| **T7** | ✅ **Connections stage 1** — TÜİK's province-to-province migration matrix, 2020–2025: 6 480 published flows a year, read from the population portal's DataTables endpoint (POST only, no year filter — the year comes out of the global search and is counted here). Every flow is published twice, once from each end, and the reader refuses a disagreement. Arrivals, departures and net are ours by addition, marked DERIVED with the formula, and `flow_totals` recomputes all 6 480 independently in verify/. The map shades a province by any of the three and draws the selected province's ten largest flows as arcs from `points.json`, an inner point per province built with the boundaries |
| **T8** | ✅ **Connections stage 2** — airports: DHMİ's comparative workbooks for 2020–2025, five measures (aircraft, commercial aircraft, passengers, freight, cargo) each split into domestic, international and total, joined to OurAirports for the code, the coordinate and the province. registry/airports.yaml is the one hand-made join — DHMİ publishes a NAME and no code — and a name it does not know stops the run. The overlay draws each airport as a circle sized by area and shades provinces by our sum of them. **The route network is not in: no publisher offers Turkish domestic origin–destination pairs openly** (see below) |
| **T9** | ✅ **Connections stage 3** — the railway from OpenStreetMap through Overpass: 7 758 main-line and high-speed ways joined into 1 352 lines (245 of them high-speed) and simplified at 50 m, plus 1 334 stations and halts, each placed in the province whose published boundary contains it. A new transform shell (`geometry`) does the joining, the Douglas–Peucker and the containment, with the OSM way ids kept so the join can be undone. The HOT extract was rejected: it is stripped to `railway` and `name`, and telling a high-speed line from a branch line is half the point |
| **T10** | ✅ **Connections stage 4** — İstanbul's rail and sea network from İBB's GTFS feed: 123 routes (15 metro and Marmaray, 3 tram, 3 funicular, 2 cable car, 100 ferry), 320 stops, six operators, drawn from the longest trip in each direction and simplified at 20 m. The feed's other 376 routes are minibüs and taxi-dolmuş — a different kind of service and 78% of its geometry — and the file says so. First overlay with no choropleth: it brings its own legend and its own view, and the map returns to the country when it is left |
| **T11** | ✅ Nightlights, as imagery rather than figures: NASA GIBS's gap-filled, BRDF-corrected VIIRS Day/Night Band, a night at a time by a stated rule — one a month for the last five calendar years and one a year back to 2012 (R1) — each date checked against the service's own published time extent and each proved with a tile. The first layer the reader's browser fetches live, so the template comes from the pipeline and not from the app. **No per-province figure**: that is a zonal statistic over a raster, which needs the raster itself and is not claimed here |
| **R1** | ✅ The owner's reading pass, 2026-09-21. The province panel exists only when a province is selected and the credits moved to the rail, folded, where they are always present; the rail folds too, and every legend is a `<details>`. The election map colours each province by whichever option LED it and lists every option on the ballot, which revisits CLAUDE.md §9 with the measurement that allows it. Hovering a province while another is selected says their flow. The railway lost its choropleth and its 1 335 dots and merged with GDP per capita into one tab, **Economy**. The boundaries became geoBoundaries at two tiers, which is what made İstanbul's transit readable and took the gates from 95 passed with 6 notes to 107 with none. A base layer of 1 005 OSM place names and Natural Earth's road network sits under any tab. Canadian dollars are derived from the Bank of Canada's annual rate, with the formula and the rate published beside them |
| **R2** | ✅ The owner's second pass, 2026-09-24. **A globe at every zoom** (`vertical-perspective`, never Mercator), with the whole planet as context rather than a box around Türkiye. **The night as NASA publishes it**: Black Marble 2012 and 2016, then one night a month for five years, labelled as months. **Less bulk**: every record on one line, `data/` served rather than copied, roads and stations fetched when used — 8.9 MB of published data to 2.2 MB before the cosmos. **The cosmos**: zoom out past the Earth to the planets (JPL Horizons), 30 546 stars (Hipparcos via HEASARC) and 43 507 galaxies (2MASS Redshift Survey via HEASARC), tethered to the Earth to 200 AU and free beyond. The İstanbul city explorer Codex began (58 MB of streets, published twice, read by nothing) is shelved outside the repository |
| **T12** | Keystone projects: scrape SBB + AYGM, hand-pick the flagships, geolocate with evidence, project viewer |
| **T13** | AIS for MID 271 and 316 — Turkish vessels by MMSI plus a TL EASY-derived register, Canadian vessels keeping their full register join |

## Verification

```bash
python run.py --check                     # registry against schemas, and STATUS.md
python -m pytest -q tests
python run.py --verify                    # declarative gates from registry/checks.yaml
python verify/golden.py replay --name <master>
python verify/golden.py live --manifest verify/golden/<master>/deployed.json --url <pages-url>
```

Existing declarative kinds (`unique_ids`, `record_count`, `fields_present`,
`sums_to_published_totals`, `geometry_within_region`, `records_are_reachable`,
`cross_source_agreement`) cover the new datasets in **YAML, not Python**. Genuinely new gates:
all 81 provinces present per election; vote shares reconcile to YSK's published totals; turnout
reproduces the published figure; every migration row's origin and destination are real il codes
and the matrix totals match TÜİK's own. Golden master recorded at T3 and re-recorded whenever the
published set changes: `data-2026-09-20` (GDP), `data-2026-09-20b` (the elections),
`data-2026-09-20c` (the election index the time slider reads), `data-2026-09-20d` (migration), `data-2026-09-20e` (airports), `data-2026-09-20f` (the railway), `data-2026-09-21` (İstanbul's transit), `data-2026-09-21b` (the nightlights layer), `data-2026-09-21c` and `data-2026-09-21d` (the two-tier boundaries, the base layer, Canadian dollars and the monthly nightlights), `data-2026-09-24` (R2: the globe, the night composites, the cosmos). Each replays byte-identical on
its own recorded inputs; the current one is `data-2026-09-24`. A master whose sources include a LIVE database is re-recorded when that database moves: the OSM railway changed by one station name between T9 and this recording, which the record's own `committed-vs-recorded` reported.

## Other avenues worth considering later

Earthquake hazard and AFAD/Kandilli event feeds (the 2023 quakes against infrastructure
investment is a striking overlay) · EPİAŞ transparency platform for electricity generation by
source, and EPDK's licensed power plants with coordinates · port tonnage and TEU from UAB,
joined to live AIS · tourism arrivals by province and border gate · ADNKS population by district
and age structure · vehicle registrations, construction permits and electricity consumption per
province · dams and irrigation from DSİ · universities and hospitals as public facility layers.

## Next

1. ~~Create the repo and do T0~~ — done 2026-09-20.
2. The YSK spike is **done** — the API works and the call sequence is written down above, so T5
   is now ordinary reader work rather than research.
3. Open question: which elections to load first. 2023 presidential (both rounds) plus the 2023
   parliamentary is the natural start; the archive reaches back to 2009 and every election is
   the same four calls, so adding more is cheap.
4. Still unverified: the province polygon source (Natural Earth admin-1 is the assumed default,
   and its Turkish province attributes have not been checked against the plaka codes).
