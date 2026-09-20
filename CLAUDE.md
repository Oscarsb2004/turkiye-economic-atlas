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

This is why an election map shades **one party at a time** on a sequential ramp rather than
colouring each province by its winner: the 2023 parliamentary ballot had 29 parties, and 29
categorical colours cannot be distinguished. `--accent-*` is chrome; `--series-*` is data.

## 10. Rendering a collection is a TOTAL function, never a filter

Iterate the whole collection, decide per member, and make the decision exhaustive, so a new
member cannot disappear silently. A province with **no published figure is not zero** — it
renders as "no figure published" and says so.

---

## Commands

```bash
python run.py            # every step, then verification
python run.py --check    # every registry file against its schema, and STATUS.md
python run.py --status   # rewrite STATUS.md from the registry
python run.py --test     # pytest
python -m atlas.run --list               # every dataset card, by group
python -m atlas.run --dataset <id>       # one dataset
python verify/golden.py record --ref HEAD --name <name>   # record a golden master
python verify/golden.py replay --name <name>              # the identity check
```

## House style

Dataset cards in `registry/`, builders in `atlas/datasets/`, one operation per shell in
`atlas/shells/`, and only `atlas/run.py` writes. `# ── Section ──` banners. Module docstrings
explain *why*, and name the thing that went wrong before — a comment that only restates the
code is not worth the line. Pinned dependencies. LF endings via `.gitattributes`.

## Things that fail silently — Turkish specifics

The dotted and dotless İ/ı: `"İSTANBUL".lower()` is wrong in any locale-naive language, so
**join on codes, never on names** · province names differ between YSK and TÜİK spellings ·
YSK's `getSecimList` returns HTTP 200 with the right row count and every field null — it is a
dead stub, use `getSecimDetayList` · YSK results need `sandikTuru=0&sorguTuru=1`; `sandikTuru=1`
returns `[]` · the 2012 metropolitan municipality reform changed district counts, so a district
series crosses a definition break · TÜİK revises provincial GDP, so a year's figure is not
final when first published.
