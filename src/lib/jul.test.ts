import { describe, expect, it } from "vitest";
import { SKY_PIECES } from "./jul";

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
  it("starts no flake on top of a present, and lines nothing up", () => {
    for (const flake of flakes) {
      for (const present of presents) {
        expect(Math.hypot(flake.x - present.x, flake.y - present.y)).toBeGreaterThan(1);
      }
    }
    // Neighbours in the list a fixed step apart in both directions would draw diagonal lines.
    const steps = flakes.slice(1).map((p, i) => `${Math.round(p.x - flakes[i]!.x)}/${Math.round(p.y - flakes[i]!.y)}`);
    expect(new Set(steps).size).toBeGreaterThan(20);
  });
  it("falls slowly, turning a little", () => {
    for (const p of SKY_PIECES) {
      expect(p.seconds).toBeGreaterThanOrEqual(10);
      expect(p.seconds).toBeLessThanOrEqual(18);
      expect(Math.abs(p.turn)).toBeLessThanOrEqual(200);
    }
  });
});
