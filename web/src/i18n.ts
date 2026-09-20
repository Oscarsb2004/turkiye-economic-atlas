/**
 * i18n.ts — the interface in Turkish and English, and the reader's choice.
 *
 * TWO KINDS OF TEXT, TWO RULES
 *
 * DATA text — province names, party names, whatever a publisher wrote — arrives
 * in the geometry or the bundle as a `Text` pair and is reproduced. `t()` in
 * data/bundle.ts picks the language. Nothing in this file translates it.
 *
 * INTERFACE text — headings, control labels, captions — is the app's own and
 * lives here. The English below was written for this interface by this project;
 * it is not a publisher's translation.
 *
 * TOTAL BY CONSTRUCTION
 *
 * `en` is typed as `Strings`, the shape of `tr`, so a string added in Turkish
 * and forgotten in English is a build failure rather than a Turkish label
 * appearing in the English interface.
 *
 * NUMBERS COME FROM THE LOCALE, NOT FROM HERE
 *
 * `Intl.NumberFormat` formats from CLDR data: Turkish uses "." for thousands
 * and "," for decimals, and writing that by hand would be this project
 * inventing a convention instead of asking the platform.
 */

import type { Lang } from "./data/bundle";

export const LOCALE: Record<Lang, string> = { tr: "tr-TR", en: "en-GB" };

export const LANGUAGE_NAME: Record<Lang, string> = { tr: "Türkçe", en: "English" };

const tr = {
  title: "Türkiye Ekonomi Atlası",
  subtitle: "Yayımlanmış verilerden kurulmuş bir harita.",
  loading: "Yükleniyor…",
  failed: "Harita yüklenemedi",
  provinces: "İl",
  province: "İl",
  noSelection: "Bir il seçin",
  noFigures: "Bu il için henüz yayımlanmış veri yok.",
  plaka: "Plaka kodu",
  layers: "Katmanlar",
  layerProvinces: "İller",
  layerWater: "Göller",
  sources: "Kaynaklar",
  geometrySource: "Sınırlar: Natural Earth (kamu malı)",
  dataComingSoon: "İlk veri kümesi hazırlanıyor (docs/PLAN.md, T3).",
};
// Not `as const`: the literal types would make every English string a mismatch
// rather than a translation. What must hold is the SHAPE — `en` is typed as
// Strings, so a key added in Turkish and forgotten in English fails the build.

export type Strings = typeof tr;

const en: Strings = {
  title: "Türkiye Economic Atlas",
  subtitle: "A map built only from published data.",
  loading: "Loading…",
  failed: "The map could not be loaded",
  provinces: "Provinces",
  province: "Province",
  noSelection: "Select a province",
  noFigures: "No published figures for this province yet.",
  plaka: "Plate code",
  layers: "Layers",
  layerProvinces: "Provinces",
  layerWater: "Lakes",
  sources: "Sources",
  geometrySource: "Boundaries: Natural Earth (public domain)",
  dataComingSoon: "The first dataset is on its way (docs/PLAN.md, T3).",
};

const STRINGS: Record<Lang, Strings> = { tr, en };

export function stringsFor(lang: Lang): Strings {
  return STRINGS[lang];
}

export function formatInt(value: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang]).format(value);
}

/** Turkish first: this is a Turkish atlas, and every source speaks Turkish. */
export function initialLang(): Lang {
  const stored = typeof window === "undefined" ? null : window.localStorage.getItem("atlas.lang");
  return stored === "en" ? "en" : "tr";
}

export function rememberLang(lang: Lang): void {
  try {
    window.localStorage.setItem("atlas.lang", lang);
  } catch {
    // A private window refuses storage; the choice simply does not persist.
  }
}
