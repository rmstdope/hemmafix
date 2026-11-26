import { describe, expect, it } from "vitest";
import { FIRST_PASS_MS, PASS_EVERY_MS, PASS_MS, SKY_PIECES, sleighPassStart } from "./jul";

describe("the sleigh's rhythm", () => {
  it("is four seconds in the air, every thirty, first a few seconds after opening", () => {
    expect([FIRST_PASS_MS, PASS_MS, PASS_EVERY_MS]).toEqual([4000, 4000, 30000]);
  });
  it("waits for the first pass", () => {
    expect(sleighPassStart(0)).toBe(4000);
    expect(sleighPassStart(3999)).toBe(4000);
  });
  it("keeps a pass that is under way, so it is resumed rather than restarted", () => {
    expect(sleighPassStart(4000)).toBe(4000);
    expect(sleighPassStart(7999)).toBe(4000);
    expect(sleighPassStart(36000)).toBe(34000);
  });
  it("then waits for the next, thirty seconds after the last", () => {
    expect(sleighPassStart(8000)).toBe(34000);
    expect(sleighPassStart(33999)).toBe(34000);
    expect(sleighPassStart(38000)).toBe(64000);
    expect(sleighPassStart(3_604_000)).toBe(3_604_000);
  });
});

describe("the sky", () => {
  const flakes = SKY_PIECES.filter((p) => p.kind === "flake");
  const presents = SKY_PIECES.filter((p) => p.kind === "present");

  it("has snowflakes and presents", () => {
    expect(flakes).toHaveLength(40);
    expect(presents).toHaveLength(12);
  });
  it("wraps presents in red, green, gold, blue and pink, and nothing else", () => {
    expect(new Set(presents.map((p) => p.colour))).toEqual(new Set(["#dc2626", "#16a34a", "#eab308", "#2563eb", "#db2777"]));
  });
  it("is spread over the whole sky from the start, not all at the top", () => {
    for (const group of [flakes, presents]) {
      for (const quarter of [0, 25, 50, 75]) {
        expect(group.some((p) => p.y >= quarter && p.y < quarter + 25)).toBe(true);
        expect(group.some((p) => p.x >= quarter && p.x < quarter + 25)).toBe(true);
      }
      for (const p of group) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(100);
      }
    }
  });
  it("falls slowly, turning a little", () => {
    for (const p of SKY_PIECES) {
      expect(p.seconds).toBeGreaterThanOrEqual(10);
      expect(p.seconds).toBeLessThanOrEqual(18);
      expect(Math.abs(p.turn)).toBeLessThanOrEqual(200);
    }
  });
});
