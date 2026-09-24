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
  noFigures: "Bu il için henüz yayımlanmış veri yok.",
  plaka: "Plaka kodu",
  layers: "Katmanlar",
  layerProvinces: "İller",
  layerWater: "Göller",
  sources: "Kaynaklar",
  geometrySource: "Sınırlar: geoBoundaries (OpenStreetMap kaynaklı). Yollar, göller ve çevre ülkeler: Natural Earth (kamu malı).",
  dataComingSoon: "Veriler TÜİK'ten alınmıştır.",
  perCapitaNote: "TRY ve USD, TÜİK'in yayımladığı değerlerdir; tarafımızca hesaplanmamıştır.",
  legendMethod: "Her renk eşit sayıda il içerir (yüzdelik dilim). Değerler yayımlandığı gibidir; dilimlendirme bu projenin sunum tercihidir.",
  noFigureLegend: "Yayımlanmış veri yok",
  legendLower: "daha düşük",
  legendHigher: "daha yüksek",
  legendRelative: "Renkler illeri birbiriyle karşılaştırır; her renk eşit sayıda il içerir (yüzdelik dilim).",
  legendPickProvince: "Bir ilin kendi rakamı için haritadan o ili seçin.",
  currency: "Para birimi",
  overlay: "Katmanlar",
  railHide: "Katmanları gizle",
  railShow: "Katmanları göster",
  overlayEconomy: "Ekonomi",
  gdpDerived: "CAD, TÜİK'in dolar rakamının bu kur ile çarpımıdır (Kanada Merkez Bankası yıllık ortalaması):",
  overlayElection: "Seçim",
  groupProvinces: "İl bazında",
  groupConnections: "Bağlantılar",
  groupActivity: "Uzaydan",
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
  migrationWith: "seçili ille",
  migrationSelf: "seçili il",
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
  railStations: "İstasyon sayısı",
  railUrban: "Şehir içi raylı sistem",
  railHalt: "Durak (halt)",
  railTotal: "Tüm istasyonlar",
  railHighspeed: "Yüksek hızlı hat",
  railConventional: "Konvansiyonel hat",
  railNoStation: "Bu ilde yayımlanmış istasyon yok.",
  railUnnamed: "(adsız)",
  railDerived: "İl başına istasyon sayısı, OSM'nin yayımladığı koordinatların il sınırları içinde sayılmasıyla bu projece bulunmuştur.",
  railAsOf: "OpenStreetMap verisi şu ana kadar geçerlidir",
  railSimplified: "Çizgiler sadeleştirilmiştir",
  railFixed: "Demiryolu zaman çubuğuyla değişmez; OpenStreetMap'in tek bir anıdır",
  overlayTransit: "İstanbul toplu ulaşımı",
  transitRoutes: "Hat",
  transitStops: "Durak",
  transitTrips: "Sefer",
  transitAgency: "İşletmeci",
  transitNotIncluded: "Bu veride ayrıca minibüs ve dolmuş hatları var; bu katman sabit hatları gösterir",
  transitPublished: "Yayımlanma",
  transitProvince: "Bu katman yalnızca İstanbul'u kapsar.",
  overlayNightlights: "Gece ışıkları",
  nightlightsNight: "Gece",
  nightlightsYear: "Yıl",
  nightlightsComposite: "NASA'nın aynı yılın bulutsuz gecelerinden yaptığı bileşim; yine ışık ölçümüdür, etkinlik ölçüsü değildir.",
  nightlightsCaution: "Tek bir gecenin ışık ölçümüdür; etkinlik, nüfus ya da ekonomi ölçüsü değildir. Ay ışığı, kar ve bulut geceden geceye fark yaratır.",
  nightlightsRule: "NASA'nın Kara Mermer bileşimleri ve son beş yılda ayda bir gece",
  nightlightsLive: "Görüntüler doğrudan NASA'dan yüklenir",
  nightlightsProvince: "Bu katman görüntüdür; il başına sayı üretmez.",
  basemap: "Altlık",
  basemapPlaces: "Yer adları ve yollar",
  basemapNote: "Yer adları OpenStreetMap'ten, yollar Natural Earth'ten; yol ağı ayrıntılı bir karayolu haritası değildir. Adlar, yayımlanmış nüfusa göre yakınlaştırdıkça çoğalır.",
  basemapShown: "Yayımlanmış yerleşim",
  cosmosTitle: "Bulunduğumuz yer",
  cosmosFromEarth: "Dünya'dan",
  cosmosEarthMoon: "Dünya ve Ay",
  cosmosSolarSystem: "Güneş Sistemi — gezegenler JPL Horizons'un verdiği yerlerde",
  cosmosBeyondPlanets: "Gezegenlerin ötesi: Güneş artık yalnızca bir yıldız",
  cosmosStars: "Güneş'in çevresindeki yıldızlar — Hipparcos, paralaksı %10'dan iyi bilinenler",
  cosmosMilkyWay: "Samanyolu ölçeği: kataloğa geçmiş bütün yıldızlar tek bir nokta",
  cosmosGalaxies: "Çevremizdeki gökadalar — 2MASS Kırmızıya Kayma Taraması",
  cosmosHome: "Dünya'ya dön",
  cosmosMap: "Haritaya dön",
  cosmosHintTethered: "Kaydırarak uzaklaşın · sürükleyerek Dünya'nın çevresinde dönün · 200 AB'den sonra serbestsiniz",
  cosmosHintFree: "Serbest: sürükleyerek bakın · kaydırarak ilerleyin · W A S D Q E ile uçun · Shift yavaşlatır",
  cosmosLeave: "Evrene uzaklaş",
  time: "Zaman",
  timeNote: "Her durak yayımlanmış bir dönemdir; aralıklar eşit değildir.",
  noPeriod: "Gösterilecek dönem yok",
  electionLeading: "İlde önde olan",
  electionResults: "Bu ildeki sonuçlar",
  electionOnBallot: "Sandıktaki seçenek",
  electionOther: "Diğer",
  electionLeadNote: "Renk, ilde en çok oyu alan seçenektir. Oy oranlarının tamamı, il seçildiğinde panelde.",
  electionSlots: "Palet beş kategorik renk taşır; beşten fazla seçenek önde olursa kalanlar tek bir renkte toplanır ve burada adlarıyla yazılır.",
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
  noFigures: "No published figures for this province yet.",
  plaka: "Plate code",
  layers: "Layers",
  layerProvinces: "Provinces",
  layerWater: "Lakes",
  sources: "Sources",
  geometrySource: "Boundaries: geoBoundaries, from OpenStreetMap. Roads, lakes and the countries around: Natural Earth (public domain).",
  dataComingSoon: "Figures published by TÜİK.",
  perCapitaNote: "TRY and USD are as TÜİK publishes them, not computed here.",
  legendMethod: "Each shade holds an equal number of provinces (quantiles). The values are as published; the banding is this project's presentation choice.",
  noFigureLegend: "No published figure",
  legendLower: "lower",
  legendHigher: "higher",
  legendRelative: "The shades compare provinces with one another; each holds an equal number of them (quantiles).",
  legendPickProvince: "Select a province for its own figure.",
  currency: "Currency",
  overlay: "Layers",
  railHide: "Hide the layers",
  railShow: "Show the layers",
  overlayEconomy: "Economy",
  gdpDerived: "CAD is TÜİK's dollar figure times this rate (Bank of Canada annual average):",
  overlayElection: "Election",
  groupProvinces: "By province",
  groupConnections: "Connections",
  groupActivity: "From orbit",
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
  migrationWith: "with the selected province",
  migrationSelf: "the selected province",
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
  railStations: "Stations",
  railUrban: "Urban rail",
  railHalt: "Halts",
  railTotal: "All stations",
  railHighspeed: "High-speed line",
  railConventional: "Conventional line",
  railNoStation: "No published station in this province.",
  railUnnamed: "(unnamed)",
  railDerived: "Stations per province is this project's count of the coordinates OSM publishes inside each province's boundary.",
  railAsOf: "OpenStreetMap data current as of",
  railSimplified: "The lines are simplified",
  railFixed: "The railway does not move with the clock; it is one moment of OpenStreetMap",
  overlayTransit: "İstanbul transit",
  transitRoutes: "Routes",
  transitStops: "Stops",
  transitTrips: "Trips",
  transitAgency: "Operator",
  transitNotIncluded: "The feed also carries minibüs and dolmuş routes; this layer is the fixed network",
  transitPublished: "Published",
  transitProvince: "This layer covers İstanbul only.",
  overlayNightlights: "Nightlights",
  nightlightsNight: "Night",
  nightlightsYear: "Year",
  nightlightsComposite: "NASA's own composite of a year's cloud-free nights; still radiance, not a measure of activity.",
  nightlightsCaution: "One night's radiance, not a measure of activity, population or economy. Moon, snow and cloud differ from night to night.",
  nightlightsRule: "NASA's Black Marble composites, then one night a month for the last five years",
  nightlightsLive: "The imagery loads directly from NASA",
  nightlightsProvince: "This layer is imagery; it produces no figure per province.",
  basemap: "Base layer",
  basemapPlaces: "Place names and roads",
  basemapNote: "Place names from OpenStreetMap, roads from Natural Earth; the road network is not a detailed highway map. More names appear as you zoom in, by published population.",
  basemapShown: "Published settlements",
  cosmosTitle: "Where we lie",
  cosmosFromEarth: "from the Earth",
  cosmosEarthMoon: "The Earth and the Moon",
  cosmosSolarSystem: "The solar system — the planets where JPL Horizons puts them",
  cosmosBeyondPlanets: "Beyond the planets: the Sun is only a star now",
  cosmosStars: "The stars around the Sun — Hipparcos, every parallax known to 10%",
  cosmosMilkyWay: "The Milky Way's scale: every catalogued star is one point",
  cosmosGalaxies: "The galaxies around us — the 2MASS Redshift Survey",
  cosmosHome: "Back to Earth",
  cosmosMap: "Back to the map",
  cosmosHintTethered: "Scroll to move out · drag to turn around the Earth · past 200 AU you are untethered",
  cosmosHintFree: "Untethered: drag to look · scroll to travel · W A S D Q E to fly · Shift is slower",
  cosmosLeave: "Zoom out to the universe",
  time: "Time",
  timeNote: "Each stop is a published period; the gaps between them are not even.",
  noPeriod: "No period to show",
  electionLeading: "Led the province",
  electionResults: "Results in this province",
  electionOnBallot: "On the ballot",
  electionOther: "Other",
  electionLeadNote: "The colour is whichever option polled highest in the province. Every share is in the panel once a province is selected.",
  electionSlots: "The palette carries five categorical colours; if more than five options ever lead, the rest share one colour and are named here.",
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
