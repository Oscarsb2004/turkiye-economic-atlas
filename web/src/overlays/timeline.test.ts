/**
 * The clock, and the three things it must not do:
 * jump to the newest period when a reader moves to an overlay that starts
 * later, lose a period to another one sharing its date, or reorder mixed grain.
 */

import { describe, expect, it } from "vitest";

import { clockOf, snapPeriod, sortPeriods, type Period } from "./timeline";

const gdp: Period[] = ["2020", "2021", "2022", "2023", "2024"].map((year) => ({
  key: `gdp:${year}`, at: year, label: year,
}));

const elections: Period[] = [
  { key: "election:2023-cumhurbaskani-1", at: "2023-05-14", label: "1. oylama" },
  { key: "election:2023-milletvekili", at: "2023-05-14", label: "Milletvekili" },
  { key: "election:2023-cumhurbaskani-2", at: "2023-05-28", label: "2. oylama" },
];

describe("snapPeriod", () => {
  it("opens on the newest period when the reader has not moved the clock", () => {
    expect(snapPeriod(gdp, null)?.at).toBe("2024");
    expect(snapPeriod(elections, null)?.key).toBe("election:2023-cumhurbaskani-2");
  });

  it("takes the newest period at or before the clock, across grains", () => {
    // From the May 2023 runoff to GDP per capita: 2023, not 2024. A year's key
    // is the start of that year.
    expect(snapPeriod(gdp, clockOf(elections[2]))?.at).toBe("2023");
    // And back again: the 2023 clock lands on the first thing that year.
    expect(snapPeriod(elections, clockOf(gdp[3]))?.key).toBe("election:2023-cumhurbaskani-1");
  });

  it("keeps the exact period a reader chose when two share a date", () => {
    // Both were held on 14 May 2023. Without the key, choosing the presidential
    // first round would snap to the parliamentary ballot and the slider would
    // refuse to stay put.
    const chosen = snapPeriod(elections, clockOf(elections[0]));
    expect(chosen?.key).toBe("election:2023-cumhurbaskani-1");
  });

  it("falls back to the earliest when the clock predates everything here", () => {
    expect(snapPeriod(elections, { at: "2014", key: "gdp:2014" })?.key)
      .toBe("election:2023-cumhurbaskani-1");
  });

  it("has nothing to show only when there is nothing", () => {
    expect(snapPeriod([], null)).toBeNull();
  });
});

describe("sortPeriods", () => {
  it("orders by instant and leaves ties as declared", () => {
    const shuffled = [elections[2], elections[1], elections[0], ...gdp];
    expect(sortPeriods(shuffled).map((period) => period.at)).toEqual([
      "2020", "2021", "2022", "2023", "2023-05-14", "2023-05-14", "2023-05-28", "2024",
    ]);
    const sameDate = sortPeriods([elections[1], elections[0]]).map((period) => period.key);
    expect(sameDate).toEqual(["election:2023-milletvekili", "election:2023-cumhurbaskani-1"]);
  });
});
