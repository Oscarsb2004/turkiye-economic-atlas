/**
 * sun.ts — where the Sun is overhead, for the cosmic viewer's light.
 *
 * The viewer lights the Earth's relief from the Sun's real direction at the
 * instant shown, so a mountain range at dawn is lit from the east and at dusk
 * from the west, and the terminator is where it actually is. That direction is
 * the SUBSOLAR POINT: the latitude and longitude with the Sun at the zenith.
 *
 * The formula is the Astronomical Almanac's low-precision solar coordinates,
 * good to about 0.01° between 1950 and 2050 — far below a pixel of the globe:
 *
 *   n = JD − 2451545.0
 *   L = 280.460° + 0.9856474° n            mean longitude
 *   g = 357.528° + 0.9856003° n            mean anomaly
 *   λ = L + 1.915° sin g + 0.020° sin 2g   ecliptic longitude
 *   ε = 23.439° − 0.0000004° n             obliquity
 *   latitude  = asin(sin ε sin λ)                          (the declination)
 *   longitude = atan2(cos ε sin λ, cos λ) − GMST           (right ascension, turned by the Earth)
 *
 * It is a formula, not data, and earth.json states it beside the layers.
 */

import { gmstDegrees } from "./units";

const RAD = Math.PI / 180;

/** Julian date of an instant. */
export function julianDate(utc: Date): number {
  return utc.getTime() / 86_400_000 + 2_440_587.5;
}

/** Wrap a longitude into [−180, 180). */
function wrap(degrees: number): number {
  return ((((degrees + 180) % 360) + 360) % 360) - 180;
}

/** The point on the Earth with the Sun overhead at `utc`, in degrees. */
export function subsolarPoint(utc: Date): { lat: number; lon: number } {
  const n = julianDate(utc) - 2_451_545.0;
  const L = 280.46 + 0.9856474 * n;
  const g = (357.528 + 0.9856003 * n) * RAD;
  const lambda = (L + 1.915 * Math.sin(g) + 0.02 * Math.sin(2 * g)) * RAD;
  const epsilon = (23.439 - 0.0000004 * n) * RAD;
  const declination = Math.asin(Math.sin(epsilon) * Math.sin(lambda));
  const rightAscension = Math.atan2(Math.cos(epsilon) * Math.sin(lambda), Math.cos(lambda));
  return { lat: declination / RAD, lon: wrap(rightAscension / RAD - gmstDegrees(utc)) };
}
