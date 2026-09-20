"""
The published language pair: Turkish, then English.

These exist because the fork inherited a pair that meant something else. In the
Canadian atlas `Text` was (en, fr) with French optional, and English was the
side always present. Here the required side is Turkish: TÜİK publishes
bilingually, but YSK, SBB, AYGM and KGM publish in Turkish only, so an English
string is the one routinely missing. Getting this backwards would not crash —
it would quietly publish empty English where Turkish was available.
"""

from __future__ import annotations

import pytest

from atlas.core import frames
from atlas.core.records import Passage, Place
from atlas.core.schema import Text


def test_turkish_is_required_and_english_is_not():
    """A record must not be constructable without the language its source actually has."""
    assert Text(tr="Nüfus").en == ""
    with pytest.raises(TypeError):
        Text(en="Population")  # type: ignore[call-arg]


def test_english_falls_back_to_turkish_rather_than_rendering_nothing():
    only_turkish = Text(tr="Seçmen sayısı")
    assert only_turkish.get("en") == "Seçmen sayısı"
    assert only_turkish.get("tr") == "Seçmen sayısı"

    both = Text(tr="Seçmen sayısı", en="Registered voters")
    assert both.get("en") == "Registered voters"
    assert both.get("tr") == "Seçmen sayısı"


def test_a_pair_round_trips_through_its_dict_form():
    pair = Text(tr="Kayıtlı seçmen", en="Registered voters")
    assert pair.to_dict() == {"tr": "Kayıtlı seçmen", "en": "Registered voters"}
    assert Text.from_dict(pair.to_dict()) == pair


def test_published_rows_name_the_languages_in_order():
    """A frame's columns are what a reader of the published file sees."""
    row = Place(key="il:2026:34", kind="province", name=Text(tr="İstanbul", en="Istanbul"),
                parent="tr", vintage="2026").row()
    assert row["name_tr"] == "İstanbul"
    assert row["name_en"] == "Istanbul"
    assert "name_fr" not in row

    passage = Passage(entity="TR34", kind="motto", text_tr="Bir şehir", text_en="A city",
                      source_url="https://example.test/")
    assert passage.row()["text_tr"] == "Bir şehir"


def test_every_language_column_is_turkish_or_english():
    named = [c.name for group in (frames.PLACE_COLUMNS, frames.PASSAGE_COLUMNS,
                                  frames.ASSET_COLUMNS, frames.EVENT_COLUMNS)
             for c in group if c.name.endswith(("_tr", "_en", "_fr"))]
    assert named, "the record types carry language columns"
    assert not [n for n in named if n.endswith("_fr")], "no column may still name French"
    # Every Turkish column has an English twin, and vice versa.
    assert {n[:-3] for n in named if n.endswith("_tr")} == {n[:-3] for n in named if n.endswith("_en")}


def test_a_passage_is_keyed_on_its_turkish_text():
    """Keying on the side that can be empty would collapse two passages into one."""
    assert "text_tr" in frames.PASSAGE_KEYS
    assert "text_en" not in frames.PASSAGE_KEYS
