/**
 * units.ts — the arithmetic between a catalogue's columns and a point in space.
 *
 * Everything the cosmos view draws is placed by a formula over a published
 * number, and every formula is here, in one file, with a test beside it. The
 * scene only ever calls these; it never does its own astronomy.
 *
 *     parsecs           = 1000 / parallax (mas)              Hipparcos
 *     megaparsecs       = recession velocity (km/s) / H0      2MASS Redshift Survey
 *     absolute mag      = m − 5·log10(d / 10 pc)              so a star can be
 *                                                             as bright as it is
 *                                                             from wherever you are
 *     GMST              = the IAU 1982 expression, in degrees  to turn the Earth
 *
 * THE AXES
 *
 * The catalogues, and the Horizons positions asked for in its `FRAME` plane,
 * share one frame: the ICRF, x towards 0h on the celestial equator, z towards
 * the north celestial pole. three.js is y-up, so a point is handed to it as
 * (x, z, −y) — the same right-handed frame, with the pole pointing up the
 * screen. That swap happens in exactly one function, `toScene`.
 */

/** Kilometres in one astronomical unit (IAU 2012, exact). */
export const AU_KM = 149_597_870.7;
/** Kilometres in one parsec: 648 000/π AU (IAU 2015, exact). */
export const PC_KM = (648_000 / Math.PI) * AU_KM;
/** Kilometres in one megaparsec. */
export const MPC_KM = PC_KM * 1e6;
/** Kilometres in one light-year: c × one Julian year (IAU, exact). */
export const LY_KM = 299_792.458 * 365.25 * 86_400;

const RAD = Math.PI / 180;

/** A direction and a distance as ICRF x, y, z, in whatever unit `distance` is. */
export function icrf(raDeg: number, decDeg: number, distance: number): [number, number, number] {
  const ra = raDeg * RAD;
  const dec = decDeg * RAD;
  return [
    distance * Math.cos(dec) * Math.cos(ra),
    distance * Math.cos(dec) * Math.sin(ra),
    distance * Math.sin(dec),
  ];
}

/** ICRF x, y, z as three.js x, y, z: the pole up the screen (see the header). */
export function toScene(x: number, y: number, z: number): [number, number, number] {
  return [x, z, -y];
}

/** Parsecs from a parallax in milliarcseconds. Positive parallaxes only. */
export function parsecsFromParallax(parallaxMas: number): number {
  return 1000 / parallaxMas;
}

/** Megaparsecs from a recession velocity, by the Hubble law at H0. */
export function megaparsecsFromVelocity(velocityKmS: number, h0: number): number {
  return velocityKmS / h0;
}

/** The magnitude a source would have at 10 pc, from its magnitude at `pc`. */
export function absoluteMagnitude(apparent: number, pc: number): number {
  return apparent - 5 * Math.log10(pc / 10);
}

/**
 * Greenwich mean sidereal time, in degrees, for a UTC date.
 *
 * The IAU 1982 expression (Aoki et al.) in the form the US Naval Observatory
 * publishes: GMST = 18.697374558 + 24.06570982441908 · D hours, with D the days
 * since 2000-01-01 12:00 UT. Good to about a second of time for decades, which
 * is a few arcminutes of the Earth's turn — far below a pixel of the globe.
 */
export function gmstDegrees(utc: Date): number {
  const d = (utc.getTime() - Date.UTC(2000, 0, 1, 12)) / 86_400_000;
  const hours = 18.697374558 + 24.06570982441908 * d;
  return (((hours % 24) + 24) % 24) * 15;
}

/**
 * A B−V colour index as an RGB tint.
 *
 * Temperature from Ballesteros (2012, EPL 97, 34): T = 4600·(1/(0.92·BV+1.7) +
 * 1/(0.92·BV+0.62)) K, then Tanner Helland's widely used fit of a black body's
 * colour to sRGB. Neither is data — a star's colour on screen is a rendering of
 * its published index, and the formula is stated so it can be checked.
 */
export function colourFromBV(bv: number | null): [number, number, number] {
  const index = bv === null || !Number.isFinite(bv) ? 0.65 : Math.min(2, Math.max(-0.4, bv));
  const t = 4600 * (1 / (0.92 * index + 1.7) + 1 / (0.92 * index + 0.62)) / 100;
  const r = t <= 66 ? 255 : 329.698727446 * Math.pow(t - 60, -0.1332047592);
  const g = t <= 66
    ? 99.4708025861 * Math.log(t) - 161.1195681661
    : 288.1221695283 * Math.pow(t - 60, -0.0755148492);
  const b = t >= 66 ? 255 : t <= 19 ? 0 : 138.5177312231 * Math.log(t - 10) - 305.0447927307;
  const clamp = (v: number) => Math.min(1, Math.max(0, v / 255));
  return [clamp(r), clamp(g), clamp(b)];
}

/**
 * A distance from the Earth in the unit a reader thinks in at that distance.
 *
 * Kilometres until the Moon is small, astronomical units across the solar
 * system, light-years among the stars and galaxies. The thresholds are where
 * the previous unit's number stops meaning anything to a person.
 */
export function describeDistance(km: number, lang: "tr" | "en"): string {
  const format = (value: number, digits = 0) =>
    new Intl.NumberFormat(lang === "tr" ? "tr-TR" : "en-GB", { maximumFractionDigits: digits }).format(value);
  if (km < 5_000_000) return `${format(km)} km`;
  if (km < 0.05 * LY_KM) {
    const au = km / AU_KM;
    return `${format(au, au < 10 ? 2 : 1)} ${lang === "tr" ? "AB" : "AU"}`;
  }
  const ly = km / LY_KM;
  if (ly < 1e6) return `${format(ly, ly < 10 ? 2 : 0)} ${lang === "tr" ? "ışık yılı" : "light-years"}`;
  const millions = ly / 1e6;
  return lang === "tr"
    ? `${format(millions, millions < 10 ? 1 : 0)} milyon ışık yılı`
    : `${format(millions, millions < 10 ? 1 : 0)} million light-years`;
}
