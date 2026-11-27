import { describe, expect, it } from "vitest";
import { DEFAULT_SECONDS, splitIntoShards } from "../../e2e/support/shard-split";

type Item = { key: string; project: string; seconds?: number; together?: string };

const item = (key: string, seconds?: number, rest: Partial<Item> = {}): Item => ({
  key,
  project: "mobile",
  seconds,
  ...rest,
});
const split = (tests: Item[], total: number) => splitIntoShards(tests, total, (t) => t);
const keys = (shards: Item[][]) => shards.map((shard) => shard.map((t) => t.key));
const weight = (shard: Item[]) => shard.reduce((sum, t) => sum + (t.seconds ?? DEFAULT_SECONDS), 0);

/** A suite like ours: a few slow tests bunched in file order, many quick ones, some unknown. */
const suite = Array.from({ length: 200 }, (_, i) =>
  item(`${String(i).padStart(3, "0")}.spec.ts › test`, i < 30 ? 2 + (i % 7) * 0.6 : i % 3 ? undefined : 0.5),
);

describe("splitting the end-to-end tests into shards", () => {
  it("puts every test in exactly one shard", () => {
    const shards = split(suite, 10);
    expect(shards).toHaveLength(10);
    expect(keys(shards).flat().sort()).toEqual(suite.map((t) => t.key).sort());
  });

  // Every shard computes the split by itself: were they to disagree, tests would be lost.
  it("gives the same shards whatever order the tests come in", () => {
    const shuffled = [...suite].sort((a, b) => ((a.key.length + Number(a.key.slice(0, 3)) * 37) % 101) - ((b.key.length + Number(b.key.slice(0, 3)) * 37) % 101));
    expect(shuffled).not.toEqual(suite);
    const sorted = (shards: Item[][]) => keys(shards).map((shard) => shard.sort());
    expect(sorted(split(shuffled, 10))).toEqual(sorted(split(suite, 10)));
  });

  it("tells the same test in two projects apart", () => {
    const both = [item("a", 2), item("a", 2, { project: "desktop" })];
    expect(split(both, 2)).toEqual([[both[1]], [both[0]]]);
    expect(split([...both].reverse(), 2)).toEqual([[both[1]], [both[0]]]);
  });

  it("evens out the shards' time, not their number of tests", () => {
    const sums = split(suite, 10).map(weight);
    expect(Math.max(...sums) - Math.min(...sums)).toBeLessThan(1);
  });

  it("weighs a test with no known time as the default", () => {
    const tests = [item("slow", 4 * DEFAULT_SECONDS), ...["a", "b", "c", "d"].map((k) => item(k))];
    expect(keys(split(tests, 2))).toEqual([["slow"], ["a", "b", "c", "d"]]);
  });

  it("keeps tests that belong together in one shard", () => {
    const tests = [
      item("first", 3, { together: "serial" }),
      item("other", 3),
      item("second", 3, { together: "serial" }),
    ];
    expect(keys(split(tests, 2))).toEqual([["first", "second"], ["other"]]);
  });

  it("keeps the tests' own order within a shard", () => {
    const tests = [item("a", 1), item("b", 5), item("c", 3)];
    expect(keys(split(tests, 1))).toEqual([["a", "b", "c"]]);
  });
});
