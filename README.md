# Türkiye Economic Atlas

A map and charts of Türkiye built only from published data: election results by area with a
time slider, GDP per capita by province, migration between provinces, transport networks, and
what activity looks like from orbit at night.

**Status: seeded, no data yet.** This repository is at step T0 of [`docs/PLAN.md`](docs/PLAN.md)
— the machinery is in place and verified, and the first dataset arrives at T3. `STATUS.md`
is generated from `registry/` and always says what actually exists.

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
python run.py --check    # registry against its schemas, and STATUS.md
python run.py --test     # the test suite
```

The first run bootstraps a virtual environment from `requirements.txt`.
