import { describe, expect, it } from "vitest";
import { FIRST_PASS_MS, PASS_EVERY_MS, PASS_MS, passStart, skyTheme } from "./sky";

describe("the sky themes", () => {
  it("are Jul and Kalas, and nothing else", () => {
    expect(skyTheme("jul")).toBe("jul");
    expect(skyTheme("kalas")).toBe("kalas");
    expect(skyTheme("lila")).toBeNull();
    expect(skyTheme("svart")).toBeNull();
  });
});

describe("the rhythm of what flies over the window", () => {
  it("is four seconds in the air, every thirty, first a few seconds after opening", () => {
    expect([FIRST_PASS_MS, PASS_MS, PASS_EVERY_MS]).toEqual([4000, 4000, 30000]);
  });
  it("waits for the first pass", () => {
    expect(passStart(0)).toBe(4000);
    expect(passStart(3999)).toBe(4000);
  });
  it("keeps a pass that is under way, so it is resumed rather than restarted", () => {
    expect(passStart(4000)).toBe(4000);
    expect(passStart(7999)).toBe(4000);
    expect(passStart(36000)).toBe(34000);
  });
  it("then waits for the next, thirty seconds after the last", () => {
    expect(passStart(8000)).toBe(34000);
    expect(passStart(33999)).toBe(34000);
    expect(passStart(38000)).toBe(64000);
    expect(passStart(3_604_000)).toBe(3_604_000);
  });
});
