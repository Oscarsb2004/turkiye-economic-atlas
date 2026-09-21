"""
Every source card an overlay names is a source card that exists.

An overlay names its SOURCE CARDS and the rail resolves each through meta.json,
so the app carries no publisher's name of its own (CLAUDE.md, house style). The
failure that buys is silent: a card that is not there resolves to an empty
string, and the tab shows its title with a blank line under it where the
publisher should be. Nothing errors, nothing is logged, and the atlas has
stopped crediting somebody.

This became worth a test the day one tab started naming three cards at once.

It reads the TypeScript as text rather than importing it, because the overlays
are React hooks and cannot be called outside a render — and what is being
checked is a string constant, which is exactly what a regular expression can
see.
"""

from __future__ import annotations

import re
from pathlib import Path

import pytest

from atlas.core import registry as R

OVERLAYS = R.ROOT / "web" / "src" / "overlays"

#: `const SOURCE = "osm_overpass";` and `const RAIL_SOURCE = "osm_overpass";`
NAMED = re.compile(r'^const\s+[A-Z_]*SOURCE\s*=\s*"([^"]+)"\s*;', re.MULTILINE)

#: What an overlay hands back, so a name declared and never used is caught too.
USED = re.compile(r"^\s*sources:\s*\[([^\]]*)\]", re.MULTILINE)


def overlay_files() -> list[Path]:
    """
    The overlay modules, which are the lower-case ones.

    OverlayRail and TimeSlider live in the same directory and are chrome, not
    overlays: they name no source because they are handed one. The capital is
    this project's own convention for a component, and it is the only thing
    here that can tell them apart without importing them.
    """
    return sorted(
        p for p in OVERLAYS.glob("*.tsx")
        if p.stem[:1].islower() and not p.name.endswith(".test.tsx")
    )


def test_there_are_overlays_to_check():
    """A glob that matches nothing would make every test below pass vacuously."""
    assert len(overlay_files()) >= 5


@pytest.mark.parametrize("path", overlay_files(), ids=lambda p: p.name)
def test_every_source_an_overlay_names_is_a_card(path: Path):
    text = path.read_text(encoding="utf-8")
    named = NAMED.findall(text)
    assert named, f"{path.name} names no source card; an overlay must credit its publisher"
    known = set(R.sources()["sources"])
    unknown = [key for key in named if key not in known]
    assert not unknown, (
        f"{path.name} names {unknown}, which registry/sources/ does not have — "
        f"the rail would show its tab with no publisher under it"
    )


@pytest.mark.parametrize("path", overlay_files(), ids=lambda p: p.name)
def test_every_card_an_overlay_declares_is_one_it_hands_back(path: Path):
    """
    A constant that never reaches `sources:` credits nobody.

    The reverse of the test above: the card exists, the overlay reads it, and
    the rail still shows one publisher because the second constant was declared
    and then left out of the list.
    """
    text = path.read_text(encoding="utf-8")
    handed = USED.search(text)
    assert handed, f"{path.name} returns no `sources` list"
    inside = handed.group(1)
    for constant in re.findall(r'^const\s+([A-Z_]*SOURCE)\s*=', text, re.MULTILINE):
        assert constant in inside, (
            f"{path.name} declares {constant} and does not hand it back in `sources`"
        )
