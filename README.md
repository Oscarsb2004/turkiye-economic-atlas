# Türkiye Economic Atlas

A map of Türkiye built only from published data, with one clock across every layer of it.

Six tabs, each one question:

| Tab | What it shows | Published by |
| --- | --- | --- |
| **Economy** | GDP per capita by province, 2020–2024, in lira, US dollars and Canadian ones — with the main-line and high-speed railway drawn over it | TÜİK · Bank of Canada · OpenStreetMap |
| **Election** | Which option led each province, and every option on that ballot with its votes and share | YSK |
| **Migration** | The 6 480 province-to-province flows, as arcs from the province you select | TÜİK |
| **Airport traffic** | Five measures over 56 airports, and this project's sum of them per province | DHMİ · OurAirports |
| **İstanbul transit** | 123 metro, tram, funicular, cable-car and ferry routes with their stops | İBB |
| **Nightlights** | One night a month for the last five years, and one a year back to 2012, as NASA's own tiles | NASA GIBS |

Under any of them, a base layer of 1 005 place names and the main road network.

**Status: nine stages, all green.** 45 published files, 125 Python tests and 29 web tests, and
107 declared verification gates with no notes outstanding. `STATUS.md` is generated from
`registry/` and always says what actually exists; [`docs/PLAN.md`](docs/PLAN.md) is the queue.

## Where it comes from

It is a fork of [`canada-economic-atlas`](https://github.com/Oscarsb2004/canada-economic-atlas),
taken after that project was restructured onto declared cards with a single writer and a
byte-level identity gate. What carried over is the machinery, not the data: the registry
validator, the record and frame model, the runner, the declarative verification kinds, and the
golden-master harness that replays a whole run on recorded inputs and compares the output byte
for byte. Every Canadian reader, card and figure was left behind.

## How it is put together

```
atlas/
  core/     records and frames, the registry validator, the published shapes, the clock
  shells/   one operation per module, each with a card in registry/shells/
  datasets/ the builders dataset cards name
  run.py    the runner: the only writer of dataset outputs, frames and receipts
registry/   configuration as YAML: source, shell and dataset cards, licences, checks, palette
verify/     independent verification; must NOT import atlas/
data/       pipeline outputs, committed so a clone can be checked without running anything
```

A dataset is a card in `registry/datasets/` naming a builder, its sources and its shells. The
runner refuses a builder that writes a file its card does not declare, and
`python run.py --check` refuses a card whose builder, sources, shells or outputs do not exist.

## Principles

1. **Others' data, reproduced.** Every figure is a publisher's; anything computed here is
   marked `DERIVED` with its formula stated.
2. **Terms read before use.** Each licence in `registry/licences.yaml` quotes what the
   publisher actually says, with the date it was read. Sources with no terms say so.
3. **Proven, not asserted.** A change ships when the golden master replays byte-identical and
   the declared checks pass.

See [`CLAUDE.md`](CLAUDE.md) for the invariants and [`docs/PLAN.md`](docs/PLAN.md) for what
happens next.

## Running it

```bash
python run.py            # every stage, the tests, verification, and a summary of what they found
python run.py --check    # registry against its schemas, and STATUS.md
python run.py --test     # the test suite: pytest, and the web tests
python run.py --web      # the atlas in a browser; it prints the address before it opens
```

A full run ends like this, and the last line is where to read the result:

```
=== summary ===
  registry   ok
  stages     8 of 8 ran
  data       43 published files, 8.1 MB
  tests      106 passed · web 16 passed
  gates      95 passed, 6 note(s)
  site       python run.py --web  ->  http://localhost:5173/
```

Nothing in that block is recounted: each figure is what the step itself printed, or what was
measured off disk. A failing gate is quoted under it, word for word, with the numbers that
disagreed.

The first run bootstraps a virtual environment from `requirements.txt`.
