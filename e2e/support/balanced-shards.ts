// A Playwright reporter that splits `--shard` runs test by test, by how long each test takes,
// where Playwright would split them file by file. It prints nothing.
import type { FullConfig, Reporter, Suite, TestCase, TestRun } from "@playwright/test/reporter";
import { splitIntoShards } from "./shard-split";
import listed from "./test-times.json";

/** The outermost serial suite around the test: Playwright's promise that it runs as one. */
function serialSuite(test: TestCase, testRun: TestRun) {
  let found: Suite | undefined;
  for (let suite: Suite | undefined = test.parent; suite; suite = suite.parent) {
    if (testRun.mode(suite) === "serial") found = suite;
  }
  return found;
}

export default class BalancedShards implements Reporter {
  /** Seconds per test, by its key; refreshed with `refresh-test-times.mjs`. */
  private readonly times: Partial<Record<string, number>>;

  constructor(options: { times?: Record<string, number> } = {}) {
    this.times = options.times ?? listed;
  }

  async preprocess({ config, suite, testRun }: { config: FullConfig; suite: Suite; testRun: TestRun }) {
    if (!config.shard) return;
    const { current, total } = config.shard;
    const tests = suite.allTests();
    // Computed in full before anything is changed: a failure here stops the run.
    const shards = splitIntoShards(tests, total, (test) => {
      // Without the root's and the project's names: file, suites and title.
      const key = test.titlePath().slice(2).join(" › ");
      return {
        key,
        project: test.parent.project()!.name,
        seconds: test.expectedStatus === "skipped" ? 0 : this.times[key],
        together: serialSuite(test, testRun),
      };
    });
    const mine = new Set(shards[current - 1]);
    testRun.skipSharding();
    for (const test of tests) if (!mine.has(test)) testRun.exclude(test);
  }

  printsToStdio() {
    return false;
  }
}
