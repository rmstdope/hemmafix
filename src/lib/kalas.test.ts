import { describe, expect, it } from "vitest";
import { bunchPlace, PARTY_PIECES } from "./kalas";
import { FIRST_PASS_MS, PASS_EVERY_MS } from "./sky";

const glitter = PARTY_PIECES.filter((p) => p.kind === "square" || p.kind === "dot");
const balloons = PARTY_PIECES.filter((p) => p.kind === "balloon");

describe("the party sky", () => {
  it("has glitter in little squares and dots, in gold, pink, blue, white and teal", () => {
    expect(glitter.filter((p) => p.kind === "square")).toHaveLength(34);
    expect(glitter.filter((p) => p.kind === "dot")).toHaveLength(22);
    for (const kind of ["square", "dot"]) {
      expect(new Set(glitter.filter((p) => p.kind === kind).map((p) => p.colour))).toEqual(
        new Set(["#ffd23f", "#ff70a6", "#4d96ff", "#ffffff", "#2a9d8f"]),
      );
    }
    for (const p of glitter) {
      expect(p.size).toBeGreaterThanOrEqual(5);
      expect(p.size).toBeLessThanOrEqual(8);
    }
  });
  it("has one balloon each in red, orange, yellow, teal, blue, purple and pink", () => {
    expect(balloons.map((p) => p.colour).sort()).toEqual(
      ["#e63946", "#f4a261", "#ffd23f", "#2a9d8f", "#4d96ff", "#c77dff", "#ff70a6"].sort(),
    );
  });
  it("is spread over the whole sky from the start", () => {
    for (const group of [glitter, balloons]) {
      for (const third of [0, 100 / 3, 200 / 3]) {
        expect(group.some((p) => p.y >= third && p.y < third + 100 / 3)).toBe(true);
        expect(group.some((p) => p.x >= third && p.x < third + 100 / 3)).toBe(true);
      }
      for (const p of group) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(100);
        expect(p.y).toBeGreaterThanOrEqual(0);
        expect(p.y).toBeLessThan(100);
      }
    }
  });
  it("drifts slowly, glitter turning as it falls and balloons barely tipping", () => {
    for (const p of glitter) {
      expect(p.seconds).toBeGreaterThanOrEqual(10);
      expect(p.seconds).toBeLessThanOrEqual(18);
      expect(Math.abs(p.turn)).toBeGreaterThanOrEqual(180);
    }
    for (const p of balloons) {
      expect(p.seconds).toBeGreaterThanOrEqual(14);
      expect(p.seconds).toBeLessThanOrEqual(22);
      expect(Math.abs(p.turn)).toBeLessThanOrEqual(8);
    }
  });
});

describe("where the bunch rises from", () => {
  const pass = (n: number) => FIRST_PASS_MS + n * PASS_EVERY_MS;

  it("is somewhere along the bottom, the same for the whole of a pass", () => {
    for (let n = 0; n < 200; n++) {
      const place = bunchPlace(pass(n), 0.7);
      expect(place).toBeGreaterThanOrEqual(0);
      expect(place).toBeLessThan(1);
      expect(bunchPlace(pass(n), 0.7)).toBe(place);
    }
  });
  it("is a new place each time, well away from the last", () => {
    for (let n = 1; n < 200; n++) {
      expect(Math.abs(bunchPlace(pass(n), 0.3) - bunchPlace(pass(n - 1), 0.3))).toBeGreaterThan(0.35);
    }
    expect(new Set(Array.from({ length: 20 }, (_, n) => bunchPlace(pass(n), 0.3))).size).toBe(20);
  });
  it("starts somewhere else each time the app is opened", () => {
    expect(bunchPlace(pass(0), 0.1)).not.toBe(bunchPlace(pass(0), 0.6));
  });
});
