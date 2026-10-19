import { describe, expect, it } from "vitest";

import { julianDate, subsolarPoint } from "./sun";

describe("subsolarPoint", () => {
  it("counts Julian days from the J2000 epoch", () => {
    expect(julianDate(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(2_451_545.0, 6);
  });

  it("puts the Sun over the Tropic of Cancer at the June solstice", () => {
    // 2026-06-21 08:24 UTC, the solstice as the US Naval Observatory lists it.
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 5, 21, 8, 24)));
    expect(lat).toBeCloseTo(23.44, 1);
  });

  it("puts the Sun over the equator at the March equinox", () => {
    // 2026-03-20 14:46 UTC.
    const { lat } = subsolarPoint(new Date(Date.UTC(2026, 2, 20, 14, 46)));
    expect(Math.abs(lat)).toBeLessThan(0.02);
  });

  it("puts the Sun near Greenwich's meridian at noon UTC, off by the equation of time", () => {
    // The equation of time never exceeds about 16.5 minutes, 4.1° of longitude.
    for (const month of [0, 3, 6, 9]) {
      const { lon } = subsolarPoint(new Date(Date.UTC(2026, month, 15, 12)));
      expect(Math.abs(lon)).toBeLessThan(4.2);
    }
  });

  it("moves the Sun west by 15° an hour", () => {
    const a = subsolarPoint(new Date(Date.UTC(2026, 8, 24, 10)));
    const b = subsolarPoint(new Date(Date.UTC(2026, 8, 24, 11)));
    expect(a.lon - b.lon).toBeCloseTo(15, 0);
  });
});
