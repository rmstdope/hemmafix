import { describe, expect, it } from "vitest";
import { flightPoint, flightScale } from "./coin-flight";

const from = { x: 100, y: 400 };
const to = { x: 300, y: 40 };

describe("coin flight", () => {
  it("starts at the tick box and lands on the pill", () => {
    expect(flightPoint(from, to, 0, 0)).toEqual(from);
    const end = flightPoint(from, to, 1, 0);
    expect(end.x).toBeCloseTo(to.x);
    expect(end.y).toBeCloseTo(to.y);
  });

  it("arcs: halfway it is above the straight line between the two", () => {
    const mid = flightPoint(from, to, 0.5, 0);
    expect(mid.y).toBeLessThan((from.y + to.y) / 2);
  });

  it("bend sways the path sideways", () => {
    expect(flightPoint(from, to, 0.5, 30).x).not.toBeCloseTo(flightPoint(from, to, 0.5, 0).x);
  });

  it("shrinks slightly on the way", () => {
    expect(flightScale(0)).toBe(1);
    expect(flightScale(1)).toBeCloseTo(0.75);
  });
});
