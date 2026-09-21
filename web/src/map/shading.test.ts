/**
 * The categorical shading, and the cap that makes it allowed at all.
 *
 * A winner map was refused for two years of this project's life (CLAUDE.md §9)
 * because the validated palette holds five categorical colours and the 2023
 * parliamentary ballot had 29 parties. What makes it allowed now is the rule
 * below — five classes take the five slots and everything after them shares one
 * muted class — so the rule is tested rather than trusted.
 */

import { describe, expect, it } from "vitest";

import { SLOTS, leaders, shadingOfClasses } from "./shading";

/** plaka -> which class won it, as the elections overlay builds it. */
function led(pairs: Array<[number, string]>): Map<number, string> {
  return new Map(pairs);
}

describe("leaders", () => {
  it("orders the classes by how many provinces each holds", () => {
    const classes = leaders(
      led([[1, "B"], [2, "A"], [3, "A"], [4, "C"], [5, "A"], [6, "B"]]),
      (key) => key,
    );
    expect(classes.shades.map((shade) => [shade.key, shade.count])).toEqual([
      ["A", 3], ["B", 2], ["C", 1],
    ]);
    // The biggest class is always slot 1, so a map does not change colour
    // because a class gained a province.
    expect(classes.shades.map((shade) => shade.tone)).toEqual([1, 2, 3]);
  });

  it("breaks a tie on the key, so two reads of one file draw the same map", () => {
    const first = leaders(led([[1, "Z"], [2, "A"]]), (key) => key);
    const second = leaders(led([[2, "A"], [1, "Z"]]), (key) => key);
    expect(first.shades.map((shade) => shade.key)).toEqual(["A", "Z"]);
    expect(second.shades.map((shade) => shade.key)).toEqual(["A", "Z"]);
  });

  it("gives a sixth class the muted slot rather than a sixth colour", () => {
    // One province each, so the order is the keys': a..f.
    const classes = leaders(
      led([[1, "a"], [2, "b"], [3, "c"], [4, "d"], [5, "e"], [6, "f"], [7, "f"]]),
      (key) => key.toUpperCase(),
    );
    // "f" holds two provinces, so it leads and takes slot 1; a..e follow.
    expect(classes.shades.map((shade) => shade.tone)).toEqual([1, 2, 3, 4, 5, 0]);
    expect(classes.shades.filter((shade) => shade.tone > SLOTS)).toEqual([]);
  });

  it("labels a class with the publisher's own word for it", () => {
    const classes = leaders(led([[1, "ak"]]), (key) => (key === "ak" ? "AK PARTİ" : key));
    expect(classes.shades[0].label).toBe("AK PARTİ");
  });
});

describe("shadingOfClasses", () => {
  it("gives every province the index of its class, and one colour per class", () => {
    const shading = shadingOfClasses(leaders(led([[6, "A"], [34, "B"], [35, "A"]]), (k) => k));
    expect(shading.colours).toHaveLength(2);
    expect(shading.byProvince.get(6)).toBe(0);
    expect(shading.byProvince.get(35)).toBe(0);
    expect(shading.byProvince.get(34)).toBe(1);
  });

  it("gives the classes that share the muted slot the same colour", () => {
    const keys: Array<[number, string]> = [];
    for (let i = 0; i < 7; i += 1) keys.push([i + 1, `p${i}`]);
    const shading = shadingOfClasses(leaders(led(keys), (key) => key));
    // Seven classes, seven entries — and the last two are the same hex, which
    // is what "everything else" means. The legend is where they are told apart.
    expect(shading.colours).toHaveLength(7);
    expect(shading.colours[5]).toBe(shading.colours[6]);
  });
});
