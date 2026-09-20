"""
atlas.core.registry — load the YAML registries, and refuse to load them wrong.

Validation happens at load time, not at use time. A missing province code or a
strategy slug with no matching feature should stop the pipeline where the
mistake is, not surface three stages later as an empty region on a map.

The registries are the project's configuration surface. Code is Python; what
the project covers — which events, which sectors, which geography — is YAML,
hand-editable and reviewable in a diff.

ONE VALIDATOR FOR EVERY FILE (docs/REBUILD.md, step S1)

Until 2026-09-17 this module loaded five of the ten registry files; the rest
were read with a bare `yaml.safe_load` by whichever stage used them, so a typo
in a field name was found, if at all, by a stage producing less than it should.
`validate_all()` now reads every file under registry/, refuses a file nobody
declared, and checks each against its JSON Schema in registry/schemas/ — which
refuses unknown fields and wrong types — before running the per-file rules
below. The schemas were derived from the files as they stood at `legacy-v1`
and are now the contract; editing a file's shape means editing its schema in
the same change.

Sources are cards: one file per source under registry/sources/, named by its
key, with the licences they may name in registry/licences.yaml (the Athena Data
card pattern). `sources()` assembles them into the shape callers have always
read, so nothing downstream changed.
"""

from __future__ import annotations

import ast
import json
from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
from typing import Any

import yaml
from jsonschema import Draft202012Validator

#: Repository root, resolved from this file rather than the working directory,
#: so a stage behaves the same however it was invoked.
ROOT = Path(__file__).resolve().parents[2]
REGISTRY_DIR = ROOT / "registry"
DATA_DIR = ROOT / "data"
WEB_PUBLIC_DIR = ROOT / "web" / "public"
WEB_DATA_DIR = ROOT / "web" / "public" / "data"
WEB_MEDIA_DIR = ROOT / "web" / "public" / "media"

class RegistryError(ValueError):
    """A registry file is malformed or internally inconsistent."""


#: Every file registry/ may hold, and the schema each is checked against.
#: A file not listed here is refused: a registry nobody loads is a registry
#: whose mistakes nobody sees.
REGISTRY_FILES = {
    "checks.yaml": "checks",
    "licences.yaml": "licences",
    "palette.yaml": "palette",
}
#: Folders of cards, one YAML file per card, and the schema every card meets.
CARD_DIRS = {"sources": "source", "shells": "shell", "datasets": "dataset"}
SCHEMA_DIR_NAME = "schemas"


class _TextDates(yaml.SafeLoader):
    """Leaves YAML dates as text, so `2025-06-26` reaches the schema as the string it is written as."""


_TextDates.yaml_implicit_resolvers = {
    first: [(tag, rx) for tag, rx in resolvers if tag != "tag:yaml.org,2002:timestamp"]
    for first, resolvers in yaml.SafeLoader.yaml_implicit_resolvers.items()
}


def _schema_errors(schema_name: str, path: Path) -> list[str]:
    schema_path = REGISTRY_DIR / SCHEMA_DIR_NAME / f"{schema_name}.schema.json"
    if not schema_path.exists():
        return [f"{path.name}: no schema at {schema_path.relative_to(ROOT).as_posix()}"]
    validator = Draft202012Validator(json.loads(schema_path.read_text(encoding="utf-8")))
    with path.open(encoding="utf-8") as fh:
        data = yaml.load(fh, Loader=_TextDates)
    rel = path.relative_to(REGISTRY_DIR).as_posix()
    return [
        f"{rel}: {'/'.join(str(p) for p in err.absolute_path) or '(top level)'}: {err.message}"
        for err in sorted(validator.iter_errors(data), key=lambda e: [str(p) for p in e.absolute_path])
    ]


def _load(name: str) -> dict[str, Any]:
    path = REGISTRY_DIR / name
    if not path.exists():
        raise RegistryError(f"missing registry file: {path}")
    with path.open(encoding="utf-8") as fh:
        data = yaml.safe_load(fh)
    if not isinstance(data, dict):
        raise RegistryError(f"{name}: expected a mapping at the top level")
    return data


# ── Sources ────────────────────────────────────────────────────────────────────

@lru_cache(maxsize=1)
def sources() -> dict[str, Any]:
    """
    Every external source, with the licences they name.

    Assembled from registry/licences.yaml and the cards in registry/sources/
    into `{"licences": ..., "sources": {key: card}}`, the shape every caller
    and `meta.json` have always read.
    """
    errors = _schema_errors("licences", REGISTRY_DIR / "licences.yaml")
    folder = REGISTRY_DIR / "sources"
    cards = sorted(folder.glob("*.yaml")) if folder.is_dir() else []
    for card in cards:
        errors += _schema_errors(CARD_DIRS["sources"], card)
    if errors:
        raise RegistryError("; ".join(errors))

    licences = _load("licences.yaml").get("licences", {})
    srcs: dict[str, Any] = {}
    for card in cards:
        with card.open(encoding="utf-8") as fh:
            srcs[card.stem] = yaml.safe_load(fh)
    for key, src in srcs.items():
        lic = src.get("licence")
        if lic and lic not in licences:
            raise RegistryError(
                f"sources/{key}.yaml claims licence {lic!r}, "
                f"which licences.yaml does not define"
            )
    return {"licences": licences, "sources": srcs}


def source(key: str) -> dict[str, Any]:
    """One source card by key."""
    srcs = sources()["sources"]
    if key not in srcs:
        raise RegistryError(f"no source card registry/sources/{key}.yaml")
    return srcs[key]

# ── Everything at once ─────────────────────────────────────────────────────────

def validate_all() -> list[str]:
    """
    Every problem in registry/, as messages. Empty means valid.

    Refuses undeclared files, checks every file and card against its schema,
    then runs each file's own loader so its rules (quoted codes, known nodes,
    declared joins) are checked too.
    """
    errors: list[str] = []
    allowed_dirs = set(CARD_DIRS) | {SCHEMA_DIR_NAME}
    for entry in sorted(REGISTRY_DIR.iterdir()):
        if entry.is_dir():
            if entry.name not in allowed_dirs:
                errors.append(f"registry/{entry.name}/: not a declared registry folder")
            elif entry.name in CARD_DIRS:
                for card in sorted(entry.iterdir()):
                    if card.is_dir() or card.suffix != ".yaml":
                        errors.append(f"registry/{entry.name}/{card.name}: card folders hold only .yaml files")
        elif entry.name not in REGISTRY_FILES:
            errors.append(f"registry/{entry.name}: not a declared registry file")
    for name, schema in REGISTRY_FILES.items():
        path = REGISTRY_DIR / name
        if not path.exists():
            errors.append(f"registry/{name}: missing")
        else:
            errors += _schema_errors(schema, path)
    if errors:
        return errors

    for card_dir, schema in CARD_DIRS.items():
        for card in sorted((REGISTRY_DIR / card_dir).glob("*.yaml")):
            errors += _schema_errors(schema, card)
    if errors:
        return errors
    errors += shell_errors()
    errors += dataset_errors()

    for loader in (sources,):
        cache_clear = getattr(loader, "cache_clear", None)
        if cache_clear:
            cache_clear()
        try:
            loader()
        except RegistryError as exc:
            errors.append(str(exc))
    return errors


# ── Shell cards ────────────────────────────────────────────────────────────────

SHELLS_DIR = ROOT / "atlas" / "shells"


def _defined_names(path: Path) -> set[str]:
    """Top-level functions, classes and assignments in a module, read without importing it."""
    tree = ast.parse(path.read_text(encoding="utf-8"))
    names: set[str] = set()
    for node in tree.body:
        if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)):
            names.add(node.name)
        elif isinstance(node, ast.Assign):
            names |= {t.id for t in node.targets if isinstance(t, ast.Name)}
        elif isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
            names.add(node.target.id)
    return names


def shell_errors() -> list[str]:
    """
    Every shell card agrees with the code, and every shell module has a card.

    A card is a promise about code, so each claim it makes that a program can
    check is checked: the module exists where its kind says, the names it lists
    are defined there, every file it says uses the shell mentions the module,
    and every test it cites exists.
    """
    errors: list[str] = []
    carded: set[Path] = set()
    for card in sorted((REGISTRY_DIR / "shells").glob("*.yaml")):
        where = f"shells/{card.name}"
        with card.open(encoding="utf-8") as fh:
            data = yaml.safe_load(fh)
        module = SHELLS_DIR / data["kind"] / f"{card.stem}.py"
        if data["module"] != f"atlas.shells.{data['kind']}.{card.stem}":
            errors.append(f"{where}: module must be atlas.shells.{data['kind']}.{card.stem}, not {data['module']}")
            continue
        if not module.exists():
            errors.append(f"{where}: {module.relative_to(ROOT).as_posix()} does not exist")
            continue
        carded.add(module)
        missing = sorted(set(data["functions"]) - _defined_names(module))
        if missing:
            errors.append(f"{where}: {module.relative_to(ROOT).as_posix()} defines no {', '.join(missing)}")
        for user in data["used_by"]:
            path = ROOT / user
            if not path.exists():
                errors.append(f"{where}: used_by {user} does not exist")
            elif card.stem not in path.read_text(encoding="utf-8"):
                errors.append(f"{where}: used_by {user} never mentions {card.stem}")
        for test in data["tests"]:
            file, _, name = test.partition("::")
            path = ROOT / file
            if not path.exists() or name not in _defined_names(path):
                errors.append(f"{where}: test {test} does not exist")
    for module in sorted(SHELLS_DIR.glob("*/*.py")):
        if module.name != "__init__.py" and module not in carded:
            errors.append(f"{module.relative_to(ROOT).as_posix()}: a shell module with no card in registry/shells/")
    return errors


# ── Dataset cards ──────────────────────────────────────────────────────────────

def datasets() -> dict[str, dict[str, Any]]:
    """Every dataset card, keyed by its id (the file name)."""
    out: dict[str, dict[str, Any]] = {}
    for card in sorted((REGISTRY_DIR / "datasets").glob("*.yaml")):
        with card.open(encoding="utf-8") as fh:
            out[card.stem] = yaml.safe_load(fh)
    return out


def dataset_groups() -> dict[str, list[str]]:
    """Group -> its dataset ids in run order."""
    groups: dict[str, list[tuple[int, str]]] = {}
    for dataset, card in datasets().items():
        groups.setdefault(card["group"], []).append((card["order"], dataset))
    return {g: [d for _, d in sorted(members)] for g, members in sorted(groups.items())}


def run_steps() -> dict[str, str]:
    """run.py's STAGES mapping, read without importing run.py (importing it would bootstrap a venv)."""
    tree = ast.parse((ROOT / "run.py").read_text(encoding="utf-8"))
    for node in tree.body:
        if isinstance(node, ast.Assign) and any(getattr(t, "id", None) == "STAGES" for t in node.targets):
            return ast.literal_eval(node.value)
    return {}


RUNNER_STEP = "-m atlas.run "


def dataset_errors() -> list[str]:
    """
    Every dataset card agrees with the repository, and every group is run.

    Checked: the builder is defined; the sources, shells and earlier cards it
    names exist; `after` points only at earlier cards in the same group; each
    output is a committed file AND is named by at least one declared consumer;
    each consumer names at least one output; each group is a step of a full run
    and each runner step names a real group; and every pull
    registry/sectors.yaml declares is made by some card.
    """
    errors: list[str] = []
    cards = datasets()
    try:
        srcs = sources()["sources"]
    except RegistryError as exc:
        return [str(exc)]
    shells = {p.stem for p in (REGISTRY_DIR / "shells").glob("*.yaml")}
    for dataset, card in cards.items():
        where = f"datasets/{dataset}.yaml"
        module, _, function = card["builder"].partition(":")
        path = ROOT / Path(*module.split(".")).with_suffix(".py")
        if not path.exists():
            errors.append(f"{where}: builder module {module} does not exist")
        elif function not in _defined_names(path):
            errors.append(f"{where}: {module} defines no {function}")
        errors += [f"{where}: no source card {s}" for s in card["sources"] if s not in srcs]
        errors += [f"{where}: no shell card {s}" for s in card["shells"] if s not in shells]
        for other in card["after"]:
            if other not in cards:
                errors.append(f"{where}: runs after {other}, which has no card")
            elif cards[other]["group"] != card["group"] or cards[other]["order"] >= card["order"]:
                errors.append(f"{where}: runs after {other}, which is not earlier in group {card['group']}")
        named: set[str] = set()
        for consumer in card["consumed_by"]:
            target = ROOT / consumer["path"]
            if not target.exists():
                errors.append(f"{where}: consumer {consumer['path']} does not exist")
                continue
            text = target.read_text(encoding="utf-8")
            names = {Path(out).name for out in card["outputs"] if Path(out).name in text}
            if not names:
                errors.append(f"{where}: consumer {consumer['path']} names none of this card's outputs")
            named |= names
        for out in card["outputs"]:
            if not (ROOT / out).exists():
                errors.append(f"{where}: output {out} is not in the repository")
            if Path(out).name not in named:
                errors.append(f"{where}: no consumer names {Path(out).name}")

    steps = run_steps()
    run_groups = {v[len(RUNNER_STEP):] for v in steps.values() if v.startswith(RUNNER_STEP)}
    card_groups = {c["group"] for c in cards.values()}
    errors += [f"run.py: step `{RUNNER_STEP}{g}` names a group with no dataset card" for g in sorted(run_groups - card_groups)]
    errors += [f"datasets: group {g} is not a step in run.py, so a full run never makes it"
               for g in sorted(card_groups - run_groups)]

    return errors
