/**
 * The arithmetic the cosmos view places everything by.
 *
 * A star drawn a factor of ten too far looks exactly like a star drawn right,
 * so every formula is checked against a value that is known independently.
 */

import { describe, expect, it } from "vitest";

import {
  AU_KM,
  LY_KM,
  PC_KM,
  absoluteMagnitude,
  colourFromBV,
  describeDistance,
  gmstDegrees,
  icrf,
  megaparsecsFromVelocity,
  parsecsFromParallax,
  toScene,
} from "./units";

describe("units", () => {
  it("defines the parsec as 648 000/π AU, about 3.26 light-years", () => {
    expect(PC_KM / AU_KM).toBeCloseTo(206_264.806, 2);
    expect(PC_KM / LY_KM).toBeCloseTo(3.2616, 4);
  });
});

describe("positions", () => {
  it("puts 0h on the equator on the x axis and the pole on z", () => {
    const [x, y, z] = icrf(0, 0, 1);
    expect([x, y, z].map((v) => Number(v.toFixed(12)))).toEqual([1, 0, 0]);
    expect(icrf(0, 90, 1)[2]).toBeCloseTo(1, 12);
    expect(icrf(90, 0, 1)[1]).toBeCloseTo(1, 12);
  });

  it("hands three.js the pole as its up axis, and stays right-handed", () => {
    // ICRF z (the pole) becomes three's y; ICRF y becomes three's −z.
    expect(toScene(0, 0, 1)).toEqual([0, 1, -0]);
    expect(toScene(0, 1, 0)).toEqual([0, 0, -1]);
  });

  it("reads a parallax of 768.07 mas as Proxima's 1.30 pc", () => {
    expect(parsecsFromParallax(768.07)).toBeCloseTo(1.302, 3);
  });

  it("reads a recession of 7 000 km/s at H0 = 70 as 100 Mpc", () => {
    expect(megaparsecsFromVelocity(7000, 70)).toBe(100);
  });

  it("makes a star 10 pc away its own absolute magnitude", () => {
    expect(absoluteMagnitude(4.83, 10)).toBeCloseTo(4.83, 10);
    // Sirius: V = −1.46 at 2.64 pc is M = 1.43.
    expect(absoluteMagnitude(-1.46, 2.64)).toBeCloseTo(1.43, 2);
  });
});

describe("the Earth's turn", () => {
  it("matches the sidereal time the IAU expression gives at J2000", () => {
    // 2000-01-01 12:00 UT: 18.697374558 h = 280.46061837°.
    expect(gmstDegrees(new Date(Date.UTC(2000, 0, 1, 12)))).toBeCloseTo(280.4606, 3);
  });

  it("gains about four minutes of time a day on the clock", () => {
    const a = gmstDegrees(new Date(Date.UTC(2026, 8, 24)));
    const b = gmstDegrees(new Date(Date.UTC(2026, 8, 25)));
    expect(((b - a + 360) % 360)).toBeCloseTo(0.9856, 3);
  });
});

describe("colour", () => {
  it("draws a hot star blue and a cool one red", () => {
    const [rHot, , bHot] = colourFromBV(-0.3);
    const [rCool, , bCool] = colourFromBV(1.6);
    expect(bHot).toBeGreaterThan(rHot);
    expect(rCool).toBeGreaterThan(bCool);
  });

  it("draws a star with no published index as the Sun's colour, not as black", () => {
    expect(colourFromBV(null)).toEqual(colourFromBV(0.65));
    expect(Math.max(...colourFromBV(null))).toBeGreaterThan(0.5);
  });
});

describe("describeDistance", () => {
  it("uses the unit a reader thinks in at each distance", () => {
    expect(describeDistance(384_400, "en")).toBe("384,400 km");
    expect(describeDistance(5.2 * AU_KM, "en")).toBe("5.2 AU");
    expect(describeDistance(4.24 * LY_KM, "en")).toBe("4.24 light-years");
    expect(describeDistance(2.5e6 * LY_KM, "en")).toBe("2.5 million light-years");
    expect(describeDistance(2.5e6 * LY_KM, "tr")).toBe("2,5 milyon ışık yılı");
  });
});
