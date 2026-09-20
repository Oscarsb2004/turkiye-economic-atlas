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
| Internal migration (il→il) | TÜİK Nüfus İstatistikleri Portalı, *İller Arası Göç* (`nip.tuik.gov.tr/?value=IllerArasiGoc`) | same TÜİK terms | ✅ Use — the 81×81 flow matrix, by year |
| Election results | **YSK Açık Veri Portalı** `acikveri.ysk.gov.tr`, JSON API at `/api/get*` | no terms page found; record as read-and-undated, like `aisstream-unstated` | ✅ **Verified working** — district-level results, 2009–2026, no auth. See below |
| Province polygons | Natural Earth admin-1 (already pinned in `build_geo.mjs`); OSM as fallback | public domain / ODbL | ✅ Use. TUCBS/ATLAS forbids redistribution → out |
| Rail network + stations | OSM: Geofabrik `turkey-latest` (612 MB PBF, 1.4 GB SHP, daily) or the HOT export on HDX (`hotosm_tur_railways`); OpenRailwayMap for the data model | ODbL, attribution + share-alike | ✅ Use. OSM rail is largely traced from satellite imagery, which is what makes it the practical "satellite-derived" rail source — no vendor produces rail vectors direct from imagery |
| Roads / intercity links | OSM (same extract) | ODbL | ✅ Use. **KGM's own terms forbid reproducing its content**, so KGM PDFs are cited as corroboration, never re-hosted |
| Airports + flight network | OurAirports `airports.csv` (nightly, **public domain**); DHMİ monthly passengers per airport | public domain / DHMİ stats | ✅ Use |
| City transit | İstanbul `data.ibb.gov.tr` GTFS (metro, Marmaray, ferries, minibüs, İETT) | İBB Open Data Licence (CC-BY-compatible, commercial use allowed) | ✅ Use, İstanbul first |
| Nightlights | NASA VIIRS / Black Marble | public domain | ✅ Use, aggregated per province |
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
| **T2** | The app: `web/` seeded with the portable pieces, `Lang = "tr" \| "en"` and the `i18n` dictionary Turkish-first, then geometry — `build_geo.mjs` repointed at Türkiye (Natural Earth admin-1, OSM water/places), map recentred, one detail tier rather than Canada's two |
| **T3** | `province-gdp-per-capita` from TÜİK; the bundle; **first golden master recorded** |
| **T4** | Choropleth + legend + a sequential ramp added to the palette and run through its validator; GDP per capita as the first overlay |
| **T5** | `ysk_api` acquire shell + `atlas/readers/ysk.py` → `election-results` cards (one per election, sharing a builder as the Canadian `economy` cards do) → party selector |
| **T6** | Time slider across election dates and years |
| **T7** | **Connections stage 1** — internal migration flows (TÜİK 81×81), drawn as province-to-province arcs |
| **T8** | **Connections stage 2** — airports and the domestic flight network (OurAirports + DHMİ) |
| **T9** | **Connections stage 3** — rail and YHT from OSM/OpenRailwayMap |
| **T10** | **Connections stage 4** — İstanbul GTFS transit detail |
| **T11** | Nightlights overlay per province, beside GDP per capita |
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
and the matrix totals match TÜİK's own. Golden master recorded at T3 and re-recorded per data
state, exactly as `data-2026-09-18` was.

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
