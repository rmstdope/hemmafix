import { describe, expect, it } from "vitest";
import { initialTally, isFinished, SHOWER_COINS, tallyReducer, type Tally } from "./coin-tally";

const shown = (t: Tally) => t.shown;
const landAll = (t: Tally, id: number) => {
  for (let i = 0; i < SHOWER_COINS; i++) t = tallyReducer(t, { type: "land", id });
  return t;
};

describe("coin tally", () => {
  it("shows nothing of its own until a shower starts", () => {
    expect(shown(initialTally)).toBeNull();
  });

  it("climbs a fifth of the way per landed coin: 40 -> 42, 44, 46, 48, 50", () => {
    let t = tallyReducer(initialTally, { type: "start", id: 1, total: 40, coins: 10, instant: false });
    expect(shown(t)).toBe(40);
    const seen: number[] = [];
    for (let i = 0; i < SHOWER_COINS; i++) {
      t = tallyReducer(t, { type: "land", id: 1 });
      seen.push(t.shown!);
    }
    expect(seen).toEqual([42, 44, 46, 48, 50]);
  });

  it("rounds the climb and ends on the exact total", () => {
    let t = tallyReducer(initialTally, { type: "start", id: 1, total: 0, coins: 7, instant: false });
    t = landAll(t, 1);
    expect(shown(t)).toBe(7);
  });

  it("credits everything at once when instant (reduced motion)", () => {
    const t = tallyReducer(initialTally, { type: "start", id: 1, total: 40, coins: 10, instant: true });
    expect(shown(t)).toBe(50);
  });

  it("takes back what a failed save had credited, and later coins add nothing", () => {
    let t = tallyReducer(initialTally, { type: "start", id: 1, total: 40, coins: 10, instant: false });
    t = tallyReducer(t, { type: "land", id: 1 });
    t = tallyReducer(t, { type: "land", id: 1 });
    t = tallyReducer(t, { type: "settle", id: 1, saved: false });
    expect(shown(t)).toBe(40);
    t = landAll(t, 1);
    expect(shown(t)).toBe(40);
  });

  it("lets overlapping showers each count their own coins", () => {
    let t = tallyReducer(initialTally, { type: "start", id: 1, total: 0, coins: 10, instant: false });
    t = tallyReducer(t, { type: "land", id: 1 });
    t = tallyReducer(t, { type: "start", id: 2, total: 99, coins: 10, instant: false });
    expect(shown(t)).toBe(2);
    t = tallyReducer(t, { type: "land", id: 2 });
    for (let i = 0; i < SHOWER_COINS - 1; i++) t = tallyReducer(t, { type: "land", id: 1 });
    expect(shown(t)).toBe(12);
  });

  it("is finished only when every shower has landed and settled", () => {
    let t = tallyReducer(initialTally, { type: "start", id: 1, total: 0, coins: 10, instant: false });
    expect(isFinished(t)).toBe(false);
    t = landAll(t, 1);
    expect(isFinished(t)).toBe(false);
    t = tallyReducer(t, { type: "settle", id: 1, saved: true });
    expect(isFinished(t)).toBe(true);
  });

  it("is not finished without showers, and release forgets everything", () => {
    expect(isFinished(initialTally)).toBe(false);
    let t = tallyReducer(initialTally, { type: "start", id: 1, total: 5, coins: 10, instant: true });
    t = tallyReducer(t, { type: "settle", id: 1, saved: true });
    expect(tallyReducer(t, { type: "release" })).toEqual(initialTally);
  });
});
