import { readFileSync } from "node:fs";
import type { FullConfig, Suite, TestCase, TestRun } from "@playwright/test/reporter";
import { describe, expect, it, vi } from "vitest";
import BalancedShards from "../../e2e/support/balanced-shards";
import { testTimes } from "../../e2e/support/refresh-test-times.mjs";
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
    const scrambled = (t: Item) => (Number(t.key.slice(0, 3)) * 37) % 200;
    const shuffled = [...suite].sort((a, b) => scrambled(a) - scrambled(b));
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

type Planned = { title: string; project?: string; status?: "passed" | "skipped"; serial?: string };

/** As much of Playwright's suite as the reporter reads: one file per `serial` name or test. */
function planned(tests: Planned[]) {
  const suites = new Map<string, Suite>();
  const modes = new Map<Suite, "serial" | "default">();
  const all = tests.map(({ title, project = "mobile", status = "passed", serial }) => {
    const name = serial ?? "x.spec.ts";
    let parent = suites.get(`${project} ${name}`);
    if (!parent) {
      parent = { project: () => ({ name: project }) } as unknown as Suite;
      suites.set(`${project} ${name}`, parent);
      modes.set(parent, serial ? "serial" : "default");
    }
    return {
      parent,
      expectedStatus: status,
      titlePath: () => ["", project, name, title],
    } as unknown as TestCase;
  });
  return { all, modes };
}

/** The titles each shard of `total` runs, as the reporter leaves them. */
async function run(tests: Planned[], total: number, times: Record<string, number> = {}) {
  const shards: string[][] = [];
  for (let current = 1; current <= total; current++) {
    const { all, modes } = planned(tests);
    const excluded = new Set<TestCase | Suite>();
    const testRun = {
      mode: (suite: Suite) => modes.get(suite)!,
      skipSharding: vi.fn(),
      exclude: (test: TestCase | Suite) => excluded.add(test),
    };
    await new BalancedShards({ times }).preprocess({
      config: { shard: { current, total } } as FullConfig,
      suite: { allTests: () => all } as unknown as Suite,
      testRun: testRun as unknown as TestRun,
    });
    expect(testRun.skipSharding).toHaveBeenCalledOnce();
    shards.push(all.filter((t) => !excluded.has(t)).map((t) => t.titlePath().slice(1).join(" ")));
  }
  return shards;
}

describe("the sharding reporter", () => {
  it("leaves a run without shards alone", async () => {
    const testRun = { skipSharding: vi.fn(), exclude: vi.fn() };
    await new BalancedShards().preprocess({
      config: { shard: null } as FullConfig,
      suite: { allTests: () => planned([{ title: "a" }]).all } as unknown as Suite,
      testRun: testRun as unknown as TestRun,
    });
    expect(testRun.skipSharding).not.toHaveBeenCalled();
    expect(testRun.exclude).not.toHaveBeenCalled();
  });

  it("takes over from Playwright's split and runs every test in exactly one shard", async () => {
    const tests = ["a", "b", "c", "d", "e"].flatMap((title) => [{ title }, { title, project: "desktop" }]);
    const shards = await run(tests, 3);
    expect(shards.flat().sort()).toEqual(
      tests.map((t) => `${"project" in t ? t.project : "mobile"} x.spec.ts ${t.title}`).sort(),
    );
  });

  // The times are looked up without the project.
  it("weighs each test by its listed time", async () => {
    const shards = await run(
      ["slow", "a", "b", "c"].map((title) => ({ title })),
      2,
      { "x.spec.ts › slow": 10 },
    );
    expect(shards).toEqual([["mobile x.spec.ts slow"], ["a", "b", "c"].map((t) => `mobile x.spec.ts ${t}`)]);
  });

  it("gives a skipped test no weight", async () => {
    const shards = await run(
      [{ title: "a", status: "skipped" }, { title: "b" }, { title: "c" }],
      2,
      { "x.spec.ts › a": 10 },
    );
    expect(shards.map((s) => s.length).sort()).toEqual([1, 2]);
    expect(shards.find((s) => s.length === 1)).not.toEqual(["mobile x.spec.ts a"]);
  });

  it("keeps a serial suite's tests in one shard", async () => {
    const shards = await run(
      [{ title: "first", serial: "s.spec.ts" }, { title: "other" }, { title: "second", serial: "s.spec.ts" }],
      2,
    );
    expect(shards).toContainEqual(["mobile s.spec.ts first", "mobile s.spec.ts second"]);
  });

  it("prints nothing, so it does not replace a reporter that does", () => {
    expect(new BalancedShards().printsToStdio()).toBe(false);
  });

  // Locally too, so a shard can be reproduced on a developer's machine.
  it("is first in both reporter lists, and CI prints each test's time", () => {
    const text = readFileSync("playwright.config.ts", "utf8");
    // Read as text: importing the config would set the end-to-end run's environment here.
    const lists = /reporter: process\.env\.CI\s*\? (\[.*\])\s*: (\[.*\]),/.exec(text);
    expect(lists).not.toBeNull();
    for (const list of lists!.slice(1)) {
      expect(list).toMatch(/^\[sharding, /);
      expect(list).toContain('["list"]');
    }
  });
});

describe("refreshing the test times from CI logs", () => {
  const line = (mark: string, project: string, title: string, end: string) =>
    `e2e-shard (1)\tEnd-to-end tests (production build, mobile and desktop)\t2026-11-27T07:02:02.6386696Z   ${mark}   1 [${project}] › e2e/${title}${end}`;

  it("averages each test over projects and runs, under the key the reporter looks up", () => {
    const log = [
      line("✓", "mobile", "a.spec.ts:3:1 › a title (with brackets)", " (2.0s)"),
      line("✓", "desktop", "a.spec.ts:3:1 › a title (with brackets)", " (4.0s)"),
      line("✓", "mobile", "b.spec.ts:7:3 › a suite › a title", " (1.0m)"),
      line("✓", "mobile", "b.spec.ts:9:3 › tagged @run-once", " (1600ms)"),
    ].join("\n");
    expect(testTimes(log)).toEqual({
      "a.spec.ts › a title (with brackets)": 3,
      "b.spec.ts › a suite › a title": 60,
      "b.spec.ts › tagged": 1.6,
    });
  });

  it("lists only the tests of 1.5 s or more, in a stable order", () => {
    const log = [
      line("✓", "mobile", "b.spec.ts:1:1 › slow", " (1.5s)"),
      line("✓", "mobile", "a.spec.ts:1:1 › quick", " (1.4s)"),
      line("✓", "mobile", "a.spec.ts:2:1 › slow", " (2.3s)"),
    ].join("\n");
    expect(Object.keys(testTimes(log))).toEqual(["a.spec.ts › slow", "b.spec.ts › slow"]);
  });

  // None of these says how long the test normally takes.
  it("ignores skipped, failed and retried tests", () => {
    const log = [
      line("-", "desktop", "a.spec.ts:1:1 › skipped", ""),
      line("✘", "mobile", "a.spec.ts:2:1 › failed", " (30.0s)"),
      line("✓", "mobile", "a.spec.ts:3:1 › retried", " (retry #1) (3.0s)"),
      "e2e-shard (1)\tRun pnpm run build\t2026-11-27T07:02:02Z ✓ Ready in 3.0s",
    ].join("\n");
    expect(testTimes(log)).toEqual({});
  });
});
