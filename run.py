#!/usr/bin/env python3
"""
run.py — the only command this project needs.

    python run.py                 the whole pipeline, then the tests, then verification,
                                  and a summary that says what was found and where to read it
    python run.py --stage 01      run one stage (see --help for the list)
    python run.py --check         validate every registry file against its schema
    python run.py --status        rewrite STATUS.md from the registry
    python run.py --verify        independent verification only
    python run.py --test          the tests: pytest, and the web tests if npm install has been run
    python run.py --web           the atlas in your browser (needs `npm install` in web/)
    python run.py --live          the same
    python run.py --refresh       bypass the HTTP cache when pulling

On first use it creates `.venv`, installs `requirements.txt` into it, and
re-executes itself inside it. There is nothing to activate by hand.

The bootstrap is cached on a hash of the requirements file, so it reinstalls
only when the pins actually change — following African-Stability-Index's
`run_asi.py`, which is the one piece of that project this repo copies almost
verbatim because it solves the problem completely.
"""

from __future__ import annotations

import hashlib
import os
import re
import shlex
import shutil
import socket
import subprocess
import sys
from pathlib import Path

# Windows consoles are cp1252 by default, and a run reads back other people's
# output: vitest prints a ✓ for every file it passes. `print` of a character the
# console cannot encode raises UnicodeEncodeError and kills the run at the tests
# step — after every stage has succeeded, with a stack trace instead of a
# summary. Replacing what cannot be shown keeps the console's own encoding and
# loses one glyph instead of the whole run.
for stream in (sys.stdout, sys.stderr):
    if hasattr(stream, "reconfigure"):
        stream.reconfigure(errors="replace")

ROOT = Path(__file__).resolve().parent
VENV = ROOT / ".venv"
PY = VENV / ("Scripts/python.exe" if os.name == "nt" else "bin/python")
STAMP = VENV / ".atlas-requirements"

#: Step number -> what to run. A full run executes these in SORTED KEY ORDER, so
#: the number is the run order and the bundle must sort last.
#:
#: That is why the bundle is 99 rather than the next free number. It reads what
#: the other stages wrote,
#: so a stage numbered above it would have its output bundled a run late: the
#: first run would ship nothing and the second would ship the first run's data.
#: Silent, and it would read as a caching bug. Numbering the bundle last leaves
#: every future stage room in between. `test_the_bundle_is_the_last_stage` makes
#: the rule mechanical rather than a comment.
#:
#: A step is either a stage script or `-m atlas.run <group>`, which makes every
#: dataset card in that group (registry/datasets/). The restructure
#: (docs/REBUILD.md) moves stages onto cards one group at a time.
STAGES: dict[str, str] = {
    "01": "-m atlas.run economy",
    "02": "-m atlas.run elections",
    "03": "-m atlas.run migration",
    "04": "-m atlas.run aviation",
    "05": "-m atlas.run rail",
    "06": "-m atlas.run transit",
    "07": "-m atlas.run nightlights",
    "08": "-m atlas.run places",
    "99": "-m atlas.run bundle",
}


def _requirements_digest() -> str:
    return hashlib.sha256((ROOT / "requirements.txt").read_bytes()).hexdigest()


def bootstrap() -> None:
    """Create and populate .venv, then re-exec inside it."""
    if not PY.exists():
        print("creating .venv ...")
        subprocess.run([sys.executable, "-m", "venv", str(VENV)], check=True)

    digest = _requirements_digest()
    if not STAMP.exists() or STAMP.read_text(encoding="utf-8").strip() != digest:
        print("installing requirements ...")
        subprocess.run(
            [str(PY), "-m", "pip", "install", "--quiet", "-r", str(ROOT / "requirements.txt")],
            check=True,
        )
        STAMP.write_text(digest, encoding="utf-8")

    os.execv(str(PY), [str(PY), str(Path(__file__).resolve()), *sys.argv[1:]])


def inside_venv() -> bool:
    try:
        return Path(sys.executable).resolve() == PY.resolve()
    except OSError:
        return False


def run(*args: str) -> int:
    return subprocess.run([sys.executable, *args], cwd=ROOT).returncode


def plain(output: str) -> str:
    """The same text without the colours a test runner writes into it.

    vitest prints "Tests  16 passed" with an escape sequence between the word
    and the number, so a summary that reads its own output has to read what was
    meant rather than what was painted.
    """
    return re.sub(r"\x1b\[[0-9;]*m", "", output)


def tee(*args: str) -> tuple[int, str]:
    """
    Run a step, show its output as it happens, AND keep it.

    The summary at the end of a run reports what each step said about itself —
    how many gates passed, how many tests — and the alternative to keeping the
    output is running everything twice or parsing a log file afterwards.
    Nothing is buffered until the end: a stage that takes a minute still prints
    while it works.
    """
    process = subprocess.Popen(
        [sys.executable, *args], cwd=ROOT, stdout=subprocess.PIPE,
        stderr=subprocess.STDOUT, text=True, encoding="utf-8", errors="replace", bufsize=1,
    )
    kept = []
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="")
        kept.append(line)
    return process.wait(), "".join(kept)


def tee_exec(command: list[str], cwd: Path) -> tuple[int, str]:
    """The same, for a command that is not this interpreter — the web tests."""
    process = subprocess.Popen(
        command, cwd=cwd, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
        text=True, encoding="utf-8", errors="replace", bufsize=1,
    )
    kept = []
    assert process.stdout is not None
    for line in process.stdout:
        print(line, end="")
        kept.append(line)
    return process.wait(), "".join(kept)


def free_port(first: int = 5173) -> int:
    """
    A port nothing is listening on, starting at Vite's own default.

    The summary prints an address, and an address that is already somebody
    else's is worse than no address at all — a second copy of the dev server
    would otherwise silently open on 5174 while the printed link pointed at
    whatever was on 5173.
    """
    for port in range(first, first + 20):
        with socket.socket() as probe:
            if probe.connect_ex(("127.0.0.1", port)) != 0:
                return port
    return first


def app() -> int:
    """
    The atlas in the browser, on a port this prints before it opens.

    The port is chosen here rather than by Vite, and passed with --strictPort,
    so the address printed IS the address served. Vite otherwise steps to the
    next free port on its own, which leaves a printed link pointing at whatever
    was already on 5173.

    The live AIS collector was a second half of this command in the atlas this
    was forked from. It is not here: vessels arrive at T13 (docs/PLAN.md), and
    starting a script that does not exist is how `--web` half-worked for a week.
    """
    web = ROOT / "web"
    vite = web / "node_modules" / "vite" / "bin" / "vite.js"
    node = shutil.which("node")
    if not (vite.exists() and node):
        print("the app needs Node.js and `npm install` in web/ first", file=sys.stderr)
        return 1

    port = free_port()
    print(f"\n  the atlas -> http://localhost:{port}/\n", flush=True)
    try:
        # Vite directly rather than `npm run dev`: npm is a .cmd on Windows, and
        # Ctrl+C in a .cmd stops at "Terminate batch job (Y/N)?".
        return subprocess.run(
            [node, str(vite), "--port", str(port), "--strictPort", "--open"], cwd=web
        ).returncode
    except KeyboardInterrupt:
        return 0


def tests() -> tuple[int, str]:
    """
    Both suites: pytest here, and the web tests where the web is.

    The web ones are skipped, not failed, when `npm install` has not been run —
    a clone that only wants the data should not be told its tests are broken.
    """
    code, output = tee("-m", "pytest", "tests/", "-q")
    found = re.search(r"(\d+) passed", plain(output))
    summary = f"{found.group(1)} passed" if found and code == 0 else "FAILED"

    vitest = ROOT / "web" / "node_modules" / "vitest" / "vitest.mjs"
    node = shutil.which("node")
    if not (vitest.exists() and node):
        return code, f"{summary} · web skipped (no npm install)"

    print()
    web_code, web_output = tee_exec([node, str(vitest), "run"], ROOT / "web")
    web_found = re.search(r"Tests\s+(\d+) passed", plain(web_output))
    web = f"{web_found.group(1)} passed" if web_found and web_code == 0 else "FAILED"
    return (code or web_code), f"{summary} · web {web}"


def gate_summary(output: str) -> tuple[str, list[str]]:
    """
    What verification found, from what it printed: a line, and what failed.

    verify/run.py already says it better than this could — "95 gate(s) passed,
    6 note(s)", and the failures listed under it — so the summary quotes it
    rather than recounting anything. A shape it does not recognise says so
    instead of guessing at a number.
    """
    text = plain(output)
    passed = re.search(r"(\d+) gate\(s\) passed, (\d+) note\(s\)", text)
    failed = re.search(r"(\d+) gate\(s\) failed, (\d+) passed", text)
    if passed:
        line = f"{passed.group(1)} passed, {passed.group(2)} note(s)"
    elif failed:
        line = f"{failed.group(1)} FAILED, {failed.group(2)} passed"
    else:
        line = "no result"
    failures = [row.strip()[2:] for row in text.splitlines() if row.strip().startswith("- ")]
    return line, failures


def published_files() -> tuple[int, float]:
    """How many files the registry says this atlas publishes, and their weight."""
    from atlas.core import registry as R

    paths = {ROOT / out for card in R.datasets().values() for out in card["outputs"]}
    present = [path for path in sorted(paths) if path.exists()]
    return len(present), sum(path.stat().st_size for path in present) / 1_048_576


def summarise(lines: list[tuple[str, str]], failures: list[str]) -> None:
    """
    What the run found, in the order a reader wants it, and where to look next.

    Every figure here is something a step printed about itself or something
    counted off disk — this does not restate a result it did not see.
    """
    width = max(len(label) for label, _ in lines)
    print("\n=== summary ===")
    for label, value in lines:
        print(f"  {label.ljust(width)}   {value}")
    if failures:
        print("\n  what failed:")
        for failure in failures:
            print(f"    - {failure}")
    print()


def check() -> int:
    """Every registry file against its schema and its own rules (atlas/core/registry.py)."""
    from atlas.core import registry

    from atlas import status

    errors = registry.validate_all()
    if not status.is_current():
        errors.append("STATUS.md is out of date; run: python run.py --status")
    for error in errors:
        print(f"registry: {error}", file=sys.stderr)
    print(f"registry: {len(errors)} problem(s)" if errors else "registry: ok")
    return 1 if errors else 0


def main() -> int:
    import argparse

    ap = argparse.ArgumentParser(description=__doc__,
                                 formatter_class=argparse.RawDescriptionHelpFormatter)
    ap.add_argument("--stage", choices=sorted(STAGES))
    ap.add_argument("--verify", action="store_true")
    ap.add_argument("--check", action="store_true")
    ap.add_argument("--status", action="store_true")
    ap.add_argument("--test", action="store_true")
    ap.add_argument("--web", action="store_true")
    ap.add_argument("--live", action="store_true")
    ap.add_argument("--refresh", action="store_true")
    args = ap.parse_args()

    if args.test:
        code, summary = tests()
        print(f"\n  tests: {summary}\n")
        return code

    if args.verify:
        return run("-m", "verify.run")

    if args.check:
        return check()

    if args.status:
        from atlas import status

        print("STATUS.md " + ("rewritten" if status.write() else "already current"))
        return 0

    if args.live or args.web:
        return app()

    extra = ["--refresh"] if args.refresh else []

    if args.stage:
        return run(*shlex.split(STAGES[args.stage]), *extra)

    # A registry mistake stops the run before any stage reads it.
    code = check()
    if code != 0:
        return code

    # Full run: stages in order, then the tests, then verification, then a
    # summary of what all three found. Any stage failing stops the run — a
    # later stage reading a half-written earlier output is how a bad bundle
    # gets committed — and the summary still says where it stopped.
    failures: list[str] = []
    for key in sorted(STAGES):
        print(f"\n=== stage {key} ===")
        code = run(*shlex.split(STAGES[key]), *extra)
        if code != 0:
            print(f"stage {key} failed", file=sys.stderr)
            summarise([("registry", "ok"), ("stages", f"stopped at {key}")],
                      [f"stage {key}: {STAGES[key]}"])
            return code

    print("\n=== tests ===")
    test_code, test_summary = tests()
    if test_code != 0:
        failures.append("the tests")

    print("\n=== verify ===")
    verify_code, verify_output = tee("-m", "verify.run")
    gates, gate_failures = gate_summary(verify_output)
    failures.extend(gate_failures)

    count, megabytes = published_files()
    summarise(
        [
            ("registry", "ok"),
            ("stages", f"{len(STAGES)} of {len(STAGES)} ran"),
            ("data", f"{count} published files, {megabytes:.1f} MB"),
            ("tests", test_summary),
            ("gates", gates),
            ("site", f"python run.py --web  ->  http://localhost:{free_port()}/"),
        ],
        failures,
    )
    return test_code or verify_code
    # Full run: stages in order, then verification. Any stage failing stops the
    # run — a later stage reading a half-written earlier output is how a bad
    # bundle gets committed.
    for key in sorted(STAGES):
        print(f"\n=== stage {key} ===")
        code = run(*shlex.split(STAGES[key]), *extra)
        if code != 0:
            print(f"stage {key} failed", file=sys.stderr)
            return code

    print("\n=== verify ===")
    return run("-m", "verify.run")


if __name__ == "__main__":
    if not inside_venv():
        bootstrap()
    raise SystemExit(main())
