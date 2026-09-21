# CLAUDE.md — working in this repo

Read `STATUS.md` first: it is generated from `registry/` and says what exists today.
`docs/PLAN.md` is the queue. This file is the invariants — things that are true by decision
and stay true unless a decision is revisited.

This project is a fork of `canada-economic-atlas`, which is where most of the machinery here
was proven. Where a rule below cites something that happened, it happened there.

---

## 1. This project reproduces data. It does not create it.

Every figure is a publisher's: TÜİK, YSK, and whoever else a source card names. A figure of our
own is allowed only as the output of a **stated formula over published inputs** — a sum over a
declared crosswalk, a ratio, a published component subtracted from its aggregate — marked
`DERIVED`, with the formula written beside it. No estimates, no judgements, and no rankings or
top-N lists of our own making.

YSK publishes results per district. Province figures are therefore **summed by us** and carry
`DERIVED`; the district figures stay exactly as published.

The same rule binds what we write ABOUT the data. Every number in a document, a registry
comment, a commit message or a pull request is **pasted from the output of a command run in the
same change**, and that command's query must match the claim's wording.

## 2. Published text is reproduced, never authored

Where a source publishes words — a project description, a party name, a motto — they are
reproduced as written. Do not summarise, paraphrase, round, or "clean up" a sentence. Numbers
embedded in prose stay in prose: if a number needs plotting it comes from a machine-readable
dataset, not from a sentence.

## 2b. Turkish is the required side of every pair

Published strings are a `Text` pair, `{tr, en}`. `tr` has no default and `en` does, because
TÜİK publishes bilingually but YSK, SBB, AYGM and KGM publish in Turkish only — English is the
side that is routinely absent, and a record must not be constructable without the language its
source actually has. `.get("en")` falls back to Turkish rather than rendering nothing.

Frame columns follow: `name_tr`/`name_en`, `text_tr`/`text_en`. A pair whose English side is
empty is normal and is shown as Turkish, never hidden and never machine-translated.

## 3. A source's terms are read before its data is used

Every entry in `registry/licences.yaml` records what the publisher's terms actually say, read
from the terms page and **dated**, never what we hope they allow. A source with no published
terms says so — `ysk-unstated` and `aisstream-unstated` both do.

**This is a personal, non-commercial project**, and that is what makes most of the list usable.
It does not make everything usable: KGM's terms forbid reproducing or redistributing its
content at all, so KGM data is not reproduced here. The road layer comes from OpenStreetMap
and KGM is cited, not copied.

## 4. Configuration is YAML, code is Python

`registry/` is the whole configuration surface: source cards, shell cards, dataset cards,
licences, checks, the palette. `python run.py --check` validates every file against its JSON
Schema in `registry/schemas/` — unknown files and unknown fields are refused — and a full run
does so before any step.

**A shell module with no card is refused**, and a card naming a function, a user or a test that
does not exist is refused. That is why this repository starts with one shell rather than
fourteen: each comes back when a dataset needs it, with its card.

`registry/schemas/source.schema.json` is deliberately small. The Canadian copy grew to 51
properties, one per thing some card happened to need, and `additionalProperties: false` then
made the schema the real definition of a source. Add a property when a card needs it.

## 5. Only `atlas/run.py` writes

Builders return what they made; the runner writes published files (only when content changed),
byte copies, frames and receipts. One writer is what makes "a re-run leaves a zero-line diff" a
property of the project rather than of each step.

## 6. Re-running a step must produce a zero-line git diff

The acceptance test for every step. Current-state files are written only when content actually
differs, which also gives `retrieved_at` its meaning.

**Hash an HTML page by its visible text, never its bytes.** Publishers inject per-request
tokens — the Canadian atlas found an Akamai script on canada.ca and a bot-manager token on an
Ontario budget page, each different on every request, which made byte hashes useless as change
detectors. Hash what the reader sees.

## 7. `verify/` must never import `atlas/`

Verification that imports the code it checks inherits that code's bugs. A test AST-scans the
package and fails on any such import, so the rule is mechanical rather than aspirational.

Prefer a declared check in `registry/checks.yaml` over a new branch in Python: the kinds in
`verify/checks.py` are generic over a dataset's declared shape.

## 8. Nothing under `data/raw/` is committed

It is all re-fetchable input. The `.gitignore` rule is the whole directory, deliberately: a
per-directory allowlist fails open, and in the Canadian repo 28 MB of zips were committed
before anyone noticed.

## 9. The palette is a validated artifact, not a preference

`registry/palette.yaml` carries its validator's recorded output. **Five categorical slots, and
five is the cap** — all-pairs normal-vision ΔE is 15.9 against a floor of 15. A sixth breaks it.

`--accent-*` is chrome; `--series-*` is data.

**The election map colours each province by whichever option led it** (decided by the owner,
2026-09-21, replacing "one party at a time on a sequential ramp"). The cap is unchanged and the
reasoning that set it was measured rather than assumed: the number of options that LEAD A
PROVINCE is not the number on the ballot. Across the three elections published here it is 2, 2
and 3, out of 4, 2 and 29 standing. `leaders()` gives the five largest classes the five slots
and puts anything past the fifth in one muted class the legend names, so a future election with
six leaders loses a distinction rather than the palette losing its validation
(`web/src/map/shading.ts`, `shading.test.ts`).

## 10. Rendering a collection is a TOTAL function, never a filter

Iterate the whole collection, decide per member, and make the decision exhaustive, so a new
member cannot disappear silently. A province with **no published figure is not zero** — it
renders as "no figure published" and says so.

---

## Commands

```bash
python run.py            # every stage, the tests, verification, and a summary of the three
python run.py --web      # the atlas in a browser, on a port it prints before it opens
python run.py --check    # every registry file against its schema, and STATUS.md
python run.py --status   # rewrite STATUS.md from the registry
python run.py --test     # pytest
python -m atlas.run --list               # every dataset card, by group
python -m atlas.run --dataset <id>       # one dataset
python run.py --verify   # the declared gates in registry/checks.yaml
python verify/golden.py replay --name data-2026-09-21d   # the identity check
python verify/golden.py record --ref HEAD --name <name>   # a new master, per data state
```

## House style

Dataset cards in `registry/`, builders in `atlas/datasets/`, one operation per shell in
`atlas/shells/`, one overlay per module in `web/src/overlays/`, and only `atlas/run.py` writes.

`# ── Section ──` banners. Module docstrings explain *why*, and name the thing that went wrong
before — a comment that only restates the code is not worth the line. Pinned dependencies. LF
endings via `.gitattributes`.

An overlay is a hook returning the shape in `web/src/overlays/types.ts`: its own fetching, its
own controls, its own periods. It reads the shared clock and snaps to it (`timeline.ts`), and it
names its SOURCE CARDS rather than their publishers, so the rail's attribution comes from
meta.json and the app carries no publisher's name of its own. Adding one is a module and a line
in `web/src/overlays/index.ts`.

**One tab is one question, not one publisher.** The economy tab shades TÜİK's GDP per capita,
derives its Canadian figures from a Bank of Canada rate and draws OpenStreetMap's railway over
the result, because "what does this province produce and what runs through it" is one question
(decided by the owner, 2026-09-21, merging what were two overlays). A tab that reads more than
one publisher lists them all, in the order it credits them.

## Things that fail silently — Turkish specifics

The dotted and dotless İ/ı: `"İSTANBUL".lower()` is wrong in any locale-naive language, so
**join on codes, never on names** · province names differ between YSK and TÜİK spellings ·
YSK's `getSecimList` returns HTTP 200 with the right row count and every field null — it is a
dead stub, use `getSecimDetayList` · YSK results need `sandikTuru=0&sorguTuru=1`; `sandikTuru=1`
returns `[]` · TÜİK's population portal (nip.tuik.gov.tr) answers the migration matrix only to a
POST and has NO year filter: the year goes in DataTables' global search, which also matches any
population or count containing those digits, so the year is filtered and the 6 480 pairs counted
in the reader · every migration flow is published twice, once from each end, so a disagreement
between them is the publisher catching us · the 2012 metropolitan municipality reform changed district counts, so a district
series crosses a definition break · TÜİK revises provincial GDP, so a year's figure is not
final when first published · DHMİ's workbooks put TWO years side by side and a percentage block
whose header names BOTH of them, so a year is found by reading the headers, never by column
position · DHMİ's figures are cumulative, so December is the year · DHMİ TOPLAMI is not the sum
of the rows above it (it leaves out the airports marked (*)); TÜRKİYE GENELİ is.

**OpenStreetMap through Overpass** answers HTTP 200 with an empty element list both for "there is
none" and for an area filter that silently failed, so an empty answer is refused rather than
published as an empty map. OSM splits a railway at every bridge and attribute change (7 758 ways
for the main-line network), so fragments are joined before anything is published — and the join
is recorded, way id by way id, so it can be undone. OSM has no edition: the period is
`timestamp_osm_base`, the moment the answer was current.

**An invalid MapLibre style is refused WHOLE.** Not the bad layer — the whole style: no layers, no
sources, a blank map, and one line in a console nobody is watching. `["zoom"]` inside a `case` did
it. The style is therefore built as a value (`web/src/map/style.ts`) and handed to the style
specification's own validator in a test, which is the only way to know a map draws without looking
at it — reintroduce the bug and `style.test.ts` prints the same message the browser did.

**A live source moves under the golden master.** OSM has no edition and edits arrive continuously:
a recording made two hours after T9 was built reported two committed files changed, and the change
was one station renamed to "Eryaman YHT Garı". That line in a recording is the source moving, not
a fault — the identity gate is the REPLAY, which runs on the recording's own inputs.

**And two Overpass answers minutes apart can disagree in both directions.** A refresh and the
recording that followed it returned: one station in one and not the other, one moved 1.5 km across
the Malatya/Adıyaman border, and `Eryaman` carrying its full name `Eryaman YHT Garı` in the later
answer and not the earlier one — a name it had already been given hours before. Edits alone do not
explain a name coming back; the likeliest explanation is that Overpass is several mirrors and they
are not at the same replication point, which makes "current as of `timestamp_osm_base`" a claim
about the mirror that answered. Chasing a recording to zero changed files is therefore not a goal.

**A GTFS feed is not automatically GTFS.** İstanbul's is Windows-1254 where the spec requires
UTF-8 — `BEŞİKTAŞ` is not valid UTF-8 and a spec-trusting reader dies on the fourth line — and two
of its records are wrapped in quotes end to end, so a CSV reader sees one field where the header
has nine. Both are repaired, counted, and published as counted.

**Published boundaries are simplified, and things fall outside them.** At Natural Earth 8%,
49 of 1 334 railway stations — 18 of them Marmaray — sat outside every province, Sabiha Gökçen's
coordinate landed in Kocaeli, and the Princes' Islands were not in the file at all, which put
twelve İstanbul ferry piers 6–8 km out to sea. A point is placed in the province that contains
it, or in the nearest one within a stated distance, and the record says which.

**The boundaries are two tiers now, and a COORDINATE is placed against the finer one.**
`provinces.json` is geoBoundaries at 2% (208 KB) and is only ever drawn; `provinces-detail.json`
is the same source at 15% (1.4 MB), is fetched by the app past zoom 6.5, and is what
`R.boundaries()` and the declared geometry checks read. Measured on the day it landed: 1 334
railway stations, 0 outside every boundary and 3 placed by proximity, against 49 outside before;
the İstanbul stops check went from a 10 km tolerance to 2 km; and the gates went from 95 passed
with 6 notes to 107 passed with none. Natural Earth still supplies the name pair, the world, the
lakes and the roads.

**`setFeatureState` THROWS on a style that has not finished loading**, and thrown from a React
effect it unmounts the tree: the map is removed, the pane goes blank, and two lines appear in a
console nobody is watching. MapLibre defers `Style.loadJSON` to an animation frame, so in a pane
that is not painting the style never loads at all and the first click on a province ends the
session. Every feature-state write therefore goes through `stateOn`, which returns false rather
than throwing, and its callers retry through `whenReady`.

**And `styledata` stops firing.** The retry that works around the `load` trap below was
written to re-try on `styledata` alone, which fires while a style is settling and then never
again — so a check that was false when the listener went on and true a moment later never gets
its retry. The failure looks identical to the one it was written to fix: an unshaded country,
a correct legend, correct feature-state, a clean console, and a listener still attached waiting
for an event that will not come. `whenReady` now retries on `sourcedata` too, and its callers
test for the LAYER rather than for a loaded style.

**A map built into a container with no size fits its bounds to nothing.** `bounds` is turned
into a centre and a zoom against the viewport, and a viewport of 0×0 makes that meaningless:
the map opens at the centre of the world with Türkiye three pixels across, nothing errors, and
`resize()` afterwards keeps whatever framing it has. In dev the stylesheet arrives after the
first render often enough that this is the usual case. The framing is therefore re-applied
whenever the container's size changes and the READER has not moved the map — which is also what
keeps the whole country in view when the province panel opens beside it.

**MapLibre's `load` event needs a rendered frame.** A hidden desktop pane gives no animation
frames at all, so `map.loaded()` and `isStyleLoaded()` stay false indefinitely while the style,
the sources and the paint are all fine, and anything queued behind `once("load")` never happens
— silently, on a map that is otherwise drawing. `getSource` answers without a frame, so data
goes on a source by trying at once and retrying on `styledata` (web/src/map/ProvinceMap.tsx).
