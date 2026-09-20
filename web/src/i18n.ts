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
  dataComingSoon: "Veriler TÜİK'ten alınmıştır.",
  perCapitaNote: "TÜİK'in yayımladığı değerler; tarafımızca hesaplanmamıştır.",
  legendMethod: "Her renk eşit sayıda il içerir (yüzdelik dilim). Değerler yayımlandığı gibidir; dilimlendirme bu projenin sunum tercihidir.",
  noFigureLegend: "Yayımlanmış veri yok",
  currency: "Para birimi",
  overlay: "Katman",
  overlayGdp: "Kişi başına GSYH",
  overlayElection: "Seçim",
  groupProvinces: "İl bazında",
  groupConnections: "Bağlantılar",
  overlayMigration: "İller arası göç",
  measure: "Ölçü",
  migrationNet: "Net göç",
  migrationReceived: "Aldığı göç",
  migrationGiven: "Verdiği göç",
  migrationPopulation: "Nüfus",
  migrationDerived: "Aldığı, verdiği ve net göç, TÜİK'in yayımladığı il-il akımlarının bu projece toplanmasıdır.",
  migrationTop: "En büyük akımlar",
  migrationPickProvince: "Akımları görmek için haritadan bir il seçin.",
  migrationMoved: "Yıl içinde iller arasında göç eden kişi",
  overlayAviation: "Havalimanı trafiği",
  aviationMeasure: "Ölçü",
  aviationSlice: "Hat",
  aviationAircraft: "Uçak",
  aviationCommercialAircraft: "Ticari uçak",
  aviationPassengers: "Yolcu",
  aviationFreight: "Yük (ton)",
  aviationCargo: "Kargo (ton)",
  aviationDomestic: "İç hat",
  aviationInternational: "Dış hat",
  aviationTotal: "Toplam",
  aviationAirports: "Havalimanları",
  aviationDerived: "İl toplamı, DHMİ'nin yayımladığı havalimanı rakamlarının bu projece toplanmasıdır; havalimanı rakamları yayımlandığı gibidir.",
  aviationNational: "Türkiye geneli",
  aviationNoAirport: "Bu ilde havalimanı yok.",
  time: "Zaman",
  timeNote: "Her durak yayımlanmış bir dönemdir; aralıklar eşit değildir.",
  noPeriod: "Gösterilecek dönem yok",
  option: "Aday / Parti",
  share: "Oy oranı",
  shareNote: "Oy oranı = geçerli oylara bölünmüş oy sayısı; YSK oy sayılarını yayımlar, oranı bu proje hesaplar.",
  votes: "Oy",
  turnoutValid: "Geçerli oy",
  turnoutRegistered: "Kayıtlı seçmen",
  summedNote: "Bu ilin rakamı, YSK'nın yayımladığı seçim çevrelerinin toplamıdır.",
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
  dataComingSoon: "Figures published by TÜİK.",
  perCapitaNote: "As TÜİK publishes them; nothing here is computed by this project.",
  legendMethod: "Each shade holds an equal number of provinces (quantiles). The values are as published; the banding is this project's presentation choice.",
  noFigureLegend: "No published figure",
  currency: "Currency",
  overlay: "Overlay",
  overlayGdp: "GDP per capita",
  overlayElection: "Election",
  groupProvinces: "By province",
  groupConnections: "Connections",
  overlayMigration: "Migration between provinces",
  measure: "Measure",
  migrationNet: "Net migration",
  migrationReceived: "Arrivals",
  migrationGiven: "Departures",
  migrationPopulation: "Population",
  migrationDerived: "Arrivals, departures and net are this project's sums over the province-to-province flows TÜİK publishes.",
  migrationTop: "Largest flows",
  migrationPickProvince: "Select a province on the map to see its flows.",
  migrationMoved: "People who moved between provinces that year",
  overlayAviation: "Airport traffic",
  aviationMeasure: "Measure",
  aviationSlice: "Traffic",
  aviationAircraft: "Aircraft",
  aviationCommercialAircraft: "Commercial aircraft",
  aviationPassengers: "Passengers",
  aviationFreight: "Freight (t)",
  aviationCargo: "Cargo (t)",
  aviationDomestic: "Domestic",
  aviationInternational: "International",
  aviationTotal: "Total",
  aviationAirports: "Airports",
  aviationDerived: "The province total is this project's sum over the airport figures DHMİ publishes; the airport figures are as published.",
  aviationNational: "Türkiye, all airports",
  aviationNoAirport: "No airport in this province.",
  time: "Time",
  timeNote: "Each stop is a published period; the gaps between them are not even.",
  noPeriod: "No period to show",
  option: "Candidate / party",
  share: "Vote share",
  shareNote: "Vote share = votes divided by valid votes. YSK publishes the counts; this project does the division.",
  votes: "Votes",
  turnoutValid: "Valid votes",
  turnoutRegistered: "Registered voters",
  summedNote: "This province's figure is the sum of its electoral districts, each as published by YSK.",
};

const STRINGS: Record<Lang, Strings> = { tr, en };

export function stringsFor(lang: Lang): Strings {
  return STRINGS[lang];
}

export function formatInt(value: number, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang]).format(value);
}

/**
 * A published amount in its own currency.
 *
 * The currency code comes from the data, not from the interface language: a
 * dollar figure stays a dollar figure when read in Turkish. Intl supplies the
 * symbol and the separators from CLDR, so "₺802.669" and "$24,452" are both
 * the platform's conventions rather than ones invented here.
 */
export function formatMoney(value: number, currency: string, lang: Lang): string {
  return new Intl.NumberFormat(LOCALE[lang], {
    style: "currency",
    currency,
    maximumFractionDigits: 0,
  }).format(value);
}

/**
 * A share, as a percentage.
 *
 * The value arrives already in percent (votes / valid * 100), so this formats
 * rather than converts; `style: "percent"` would multiply by 100 again.
 */
export function formatPercent(value: number, lang: Lang, digits = 1): string {
  return `${new Intl.NumberFormat(LOCALE[lang], {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value)}%`;
}

/**
 * A period on the time slider, as short as it can honestly be.
 *
 * A year is left as it is — "2024" is already the whole fact. A date is passed
 * to Intl, which writes 28.05.2023 in Turkish and 28/05/2023 in English rather
 * than this project picking an order. Parsed as UTC, because a date-only string
 * read in local time can slip to the day before.
 */
export function formatInstant(at: string, lang: Lang): string {
  if (/^\d{4}$/.test(at)) return at;
  const when = new Date(`${at}T00:00:00Z`);
  if (Number.isNaN(when.getTime())) return at;
  return new Intl.DateTimeFormat(LOCALE[lang], {
    day: "2-digit", month: "2-digit", year: "numeric", timeZone: "UTC",
  }).format(when);
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
