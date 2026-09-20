"""
verify/run.py — independent verification of the published files.

    python run.py --verify
    python -m verify.run

WHAT THIS IS FOR

The pipeline believes its own code. This does not: it opens the published files
and checks what they actually say, and it MUST NOT import `atlas` (CLAUDE.md
§7). Verification that imports the code it checks inherits that code's bugs, so
this module reads JSON off disk and nothing else.

DECLARED, NOT CODED

The checks live in `registry/checks.yaml` and their kinds in `verify/checks.py`.
Covering a new dataset is an entry in that file, not a new branch here. The
atlas this was forked from learned that the expensive way: its verify/run.py
reached 1,152 lines of per-dataset branches, and its own docstring said the
direction should have been declarative. This one starts that way and stays a
runner.

TWO SEVERITIES

A **gate** blocks a release: something published is wrong. A **note** is worth
reading and blocks nothing — a count that moved, a source that changed shape.
Anything that cannot decide which it is should be a gate.
"""

from __future__ import annotations

import sys
from dataclasses import dataclass, field

from verify.checks import run_declared_checks


@dataclass
class Report:
    """What was checked, and what failed."""

    passed: int = 0
    failures: list[str] = field(default_factory=list)
    notes: list[str] = field(default_factory=list)

    def gate(self, ok: bool, label: str, detail: str = "") -> bool:
        """One check that must hold. Returns whether it held, so callers can branch."""
        if ok:
            self.passed += 1
            print(f"  ok    {label}")
        else:
            self.failures.append(f"{label}: {detail}" if detail else label)
            print(f"  FAIL  {label}: {detail}")
        return ok

    def note(self, label: str) -> None:
        """Something a reader should know, which does not block a release."""
        self.notes.append(label)
        print(f"  note  {label}")


def main() -> int:
    if hasattr(sys.stdout, "reconfigure"):
        # Province names carry ı, ş, ğ and İ; a Windows console defaults to a
        # code page that cannot encode them and would fail the run on printing.
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")

    report = Report()
    run_declared_checks(report)

    print()
    if report.failures:
        print(f"{len(report.failures)} gate(s) failed, {report.passed} passed")
        for failure in report.failures:
            print(f"  - {failure}")
        return 1
    print(f"{report.passed} gate(s) passed, {len(report.notes)} note(s)")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
