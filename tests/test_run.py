"""
The summary `python run.py --pipeline` ends with.

It reports what each step said about itself, so the only thing that can go
wrong here is misreading them — and a misread summary is worse than none,
because it is the line a reader believes without scrolling.
"""

from __future__ import annotations

import sys

import run


def test_colours_come_off_before_anything_is_read():
    """
    vitest paints its own output, escape sequences and all, and puts them
    BETWEEN the word and the number a summary wants.
    """
    painted = "\x1b[2m Tests \x1b[22m \x1b[1m\x1b[32m16 passed\x1b[39m\x1b[22m"
    assert run.plain(painted) == " Tests  16 passed"


def test_a_passing_run_is_quoted_not_recounted():
    line, failures = run.gate_summary("  ok    something\n\n95 gate(s) passed, 6 note(s)\n")
    assert line == "95 passed, 6 note(s)"
    assert failures == []


def test_a_failing_run_says_so_and_names_what_failed():
    output = (
        "  FAIL  migration-2025: flows add up: 1.given: 55,959 published, 55,960 from the flows\n"
        "\n1 gate(s) failed, 94 passed\n"
        "  - migration-2025: flows add up: 1.given: 55,959 published, 55,960 from the flows\n"
    )
    line, failures = run.gate_summary(output)
    assert line == "1 FAILED, 94 passed"
    assert failures == [
        "migration-2025: flows add up: 1.given: 55,959 published, 55,960 from the flows"
    ]


def test_a_shape_it_does_not_know_does_not_become_a_number():
    line, failures = run.gate_summary("verification crashed before it counted anything\n")
    assert line == "no result"
    assert failures == []


def test_every_stage_is_a_step_of_the_run():
    """The bundle sorts last, because it reads what the others wrote."""
    assert sorted(run.STAGES) == list(run.STAGES)
    assert max(run.STAGES) == "99", "the bundle stays the last stage"


def test_no_arguments_start_the_local_atlas(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["run.py"])
    monkeypatch.setattr(run, "app", lambda: 17)

    assert run.main() == 17


def test_test_flag_runs_only_the_test_suites(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["run.py", "--test"])
    monkeypatch.setattr(run, "tests", lambda: (0, "139 passed · web 29 passed"))

    assert run.main() == 0


def test_pipeline_flag_keeps_the_full_data_workflow_explicit(monkeypatch):
    monkeypatch.setattr(sys, "argv", ["run.py", "--pipeline", "--refresh"])
    seen = {}

    def fake_pipeline(*, refresh):
        seen["refresh"] = refresh
        return 19

    monkeypatch.setattr(run, "pipeline", fake_pipeline)

    assert run.main() == 19
    assert seen == {"refresh": True}
