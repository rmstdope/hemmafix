// Rewrites test-times.json, which weighs the shard split (shard-split.ts), from the per-test
// times that the end-to-end shards print in CI. Name one or more recent runs:
//
//   for run in <id> <id>; do gh run view "$run" --log; done | node e2e/support/refresh-test-times.mjs
import { readFileSync, writeFileSync } from "node:fs";
import { fileURLToPath, pathToFileURL } from "node:url";

/** Quicker tests are left out and weigh the split's default. */
const LISTED_SECONDS = 1.5;
const UNITS = { ms: 0.001, s: 1, m: 60 };
/**
 * A passing test as Playwright's `list` reporter prints it. Tags follow the title and are not
 * part of the key, so a title that itself ends in an `@word` would never be matched.
 */
const PASSED = /✓ +\d+ \[([\w-]+)\] › e2e\/(.+?):\d+:\d+ › (.+?)(?: @[\w-]+)* \(([\d.]+)(ms|s|m)\)\s*$/;

/**
 * Seconds per test and project, averaged over every run in the log. The projects are kept apart:
 * a test may skip itself on one viewport.
 * @param {string} log
 * @returns {Record<string, number>}
 */
export function testTimes(log) {
  /** @type {Map<string, number[]>} */
  const samples = new Map();
  for (const line of log.split("\n")) {
    const [, project, file, title, time, unit] = PASSED.exec(line) ?? [];
    // A retry's time says more about what failed before it than about the test.
    if (!file || title.includes("(retry #")) continue;
    const key = `[${project}] › ${file} › ${title}`;
    const seconds = Number(time) * UNITS[/** @type {keyof typeof UNITS} */ (unit)];
    samples.set(key, [...(samples.get(key) ?? []), seconds]);
  }
  return Object.fromEntries(
    [...samples]
      .map(([key, all]) => /** @type {const} */ ([key, all.reduce((a, b) => a + b, 0) / all.length]))
      .filter(([, seconds]) => seconds >= LISTED_SECONDS)
      .sort(([a], [b]) => (a < b ? -1 : 1))
      .map(([key, seconds]) => [key, Math.round(seconds * 10) / 10]),
  );
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const times = testTimes(readFileSync(0, "utf8"));
  const count = Object.keys(times).length;
  // An empty table would be a log without the times, not a suite without slow tests.
  if (!count) throw new Error("No test times in the log read from stdin; the table is unchanged.");
  const path = fileURLToPath(new URL("test-times.json", import.meta.url));
  writeFileSync(path, `${JSON.stringify(times, null, 2)}\n`);
  console.log(`${count} tests of ${LISTED_SECONDS} s or more written to ${path}`);
}
