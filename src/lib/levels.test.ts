import { describe, expect, it } from "vitest";
import { levelFor } from "./levels";

describe("levelFor", () => {
  it.each([
    [0, 1, "Nybörjare"],
    [99, 1, "Nybörjare"],
    [100, 2, "Hjälpreda"],
    [249, 2, "Hjälpreda"],
    [250, 3, "Fixare"],
    [499, 3, "Fixare"],
    [500, 4, "Städproffs"],
    [999, 4, "Städproffs"],
    [1000, 5, "Hemmahjälte"],
    [1999, 5, "Hemmahjälte"],
    [2000, 6, "Husmästare"],
    [3999, 6, "Husmästare"],
    [4000, 7, "Legend"],
    [7999, 7, "Legend"],
    [8000, 8, "Legend 2"],
    [11999, 8, "Legend 2"],
    [12000, 9, "Legend 3"],
  ])("%i coins is level %i, %s", (coins, level, title) => {
    expect(levelFor(coins)).toMatchObject({ level, title });
  });

  it("says where the level starts and the next begins", () => {
    expect(levelFor(320)).toMatchObject({ start: 250, next: 500 });
    expect(levelFor(0)).toMatchObject({ start: 0, next: 100 });
    expect(levelFor(8100)).toMatchObject({ start: 8000, next: 12000 });
  });

  it("fills the bar within the level and resets at a step", () => {
    expect(levelFor(0).progress).toBe(0);
    expect(levelFor(300).progress).toBeCloseTo(0.2);
    expect(levelFor(499).progress).toBeLessThan(1);
    expect(levelFor(500).progress).toBe(0);
    expect(levelFor(6000).progress).toBe(0.5);
  });

  it("treats a negative total as zero", () => {
    expect(levelFor(-5)).toMatchObject({ level: 1, progress: 0 });
  });
});
