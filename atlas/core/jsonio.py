"""
atlas.core.jsonio — write JSON only when the content actually changed.

Every pipeline stage needs the same thing: serialise a payload, but leave the
file alone if nothing meaningful moved, so that re-running a stage against
unchanged sources produces a zero-line git diff. That guarantee is the project's
acceptance test for every stage.

This lived as a near-identical private copy in all four stages, and the copies
had already drifted: stage 01 ignored both `generated_at` and `retrieved_at`
when comparing, while 02, 03 and 04 ignored only `generated_at`. The drift was
harmless in practice but it is exactly the kind of thing that makes a future
"why did this file rewrite?" unanswerable. One implementation, one rule.

THE RULE

`generated_at` and `retrieved_at` are excluded from the comparison. Both move on
every run regardless of content, so including them would rewrite the file every
time and defeat the whole mechanism. Excluding them also gives the stored
timestamps a better meaning: they record when the content was last seen to
CHANGE, not when the scraper last ran.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

#: Keys that move on every run no matter what the source said.
VOLATILE_KEYS = frozenset({"generated_at", "retrieved_at"})


def strip_volatile(obj: Any) -> Any:
    """A copy of `obj` with every volatile key removed, at any depth."""
    if isinstance(obj, dict):
        return {k: strip_volatile(v) for k, v in obj.items() if k not in VOLATILE_KEYS}
    if isinstance(obj, list):
        return [strip_volatile(v) for v in obj]
    return obj


def write_if_changed(path: Path, payload: dict) -> bool:
    """
    Write `payload` to `path` only if its non-volatile content differs.

    Returns True when the file was written. A malformed or unreadable existing
    file counts as "different" and is overwritten, because the alternative is
    refusing to repair a corrupt output.
    """
    path = Path(path)
    path.parent.mkdir(parents=True, exist_ok=True)

    if path.exists():
        try:
            existing = json.loads(path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, UnicodeDecodeError):
            existing = None
        # Compare against the payload AS IT WILL READ BACK, not as it was built.
        # A tuple serialises as a JSON array and loads as a list, and
        # `("E", "x") != ["E", "x"]` in Python — so a payload carrying any tuple
        # compared unequal to its own file on every run and was rewritten with a
        # fresh `generated_at`. Found in B2, when the quality codes stage 02 now
        # carries made capex-annual.json and employment-monthly.json change on a
        # re-run of unchanged sources.
        readback = json.loads(json.dumps(payload, ensure_ascii=False))
        if existing is not None and strip_volatile(existing) == strip_volatile(readback):
            return False

    path.write_text(dumps(payload), encoding="utf-8")
    return True


#: How many levels of a payload are indented. Below this, a value is one line.
INDENTED_LEVELS = 2


def dumps(payload: Any) -> str:
    """
    A payload as this project publishes it: one RECORD per line.

    WHY NOT `indent=2`, WHICH THIS WAS

    `indent=2` puts every number of every coordinate on a line of its own, so a
    railway of 12 925 kept points was 1 358 KB of mostly newlines and leading
    spaces, published twice (once here, once in the bundle) and downloaded by
    every reader. Measured over every file under data/ on 2026-09-24:

        indent=2              4 334 KB
        outer 2 levels only   2 270 KB    <- this
        fully compact         2 241 KB

    Indenting the outer two levels keeps what made indentation worth having —
    a git diff shows WHICH station, line or province changed, one per line —
    for 1% more than no whitespace at all. Keys stay sorted, so the same
    content is always the same bytes.
    """
    return _dump(payload, 0) + "\n"


def _dump(value: Any, depth: int) -> str:
    if depth >= INDENTED_LEVELS or not isinstance(value, (dict, list)) or not value:
        return json.dumps(value, ensure_ascii=False, separators=(",", ":"), sort_keys=True)
    pad, end = "  " * (depth + 1), "  " * depth
    if isinstance(value, dict):
        body = ",\n".join(
            f"{pad}{json.dumps(key, ensure_ascii=False)}: {_dump(value[key], depth + 1)}"
            for key in sorted(value)
        )
        return "{\n" + body + "\n" + end + "}"
    return "[\n" + ",\n".join(pad + _dump(item, depth + 1) for item in value) + "\n" + end + "]"
