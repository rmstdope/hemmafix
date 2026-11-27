import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
// Read as text: the project has no YAML dependency, and these are the lines that matter.
const workflow = read(".github/workflows/ci.yml");

/** The lines indented under `key:` at the given depth, comments and blank lines dropped. */
function block(text: string, key: string, indent: number) {
  const lines = text.split("\n").filter((line) => !/^\s*(#.*)?$/.test(line));
  const start = lines.indexOf(`${" ".repeat(indent)}${key}:`);
  expect(start, `${key}: not found`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.search(/\S/) <= indent);
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

/** A job's steps, each as its own text. */
function steps(job: string) {
  return block(block(workflow, job, 2), "steps", 4)
    .split(/^ {6}- /m)
    .slice(1)
    .map((step) => step.trimEnd());
}

describe("a push to main that changes only docs/", () => {
  // A run that succeeds without a deployment manifest blocks rmstdope-infra, which takes the
  // latest successful run. So there must be no run at all.
  it("starts no run, so nothing is published", () => {
    expect(block(block(workflow, "on", 0), "push", 2)).toBe(
      ['    branches: [main]', '    paths-ignore: ["docs/**"]'].join("\n"),
    );
  });
});

describe("a pull request that changes only docs/", () => {
  // A required check whose workflow never runs stays pending for ever.
  it("still starts the workflow, so the required checks report", () => {
    expect(block(workflow, "on", 0)).toMatch(/^ {2}pull_request:\n {2}push:$/m);
  });

  describe.each(["checks", "e2e-shard", "production-image"])("in the %s job", (job) => {
    // A skipped job reports as passing, also when it was skipped because something failed.
    it("runs the job itself, so the check is a real result", () => {
      expect(block(workflow, job, 2)).not.toMatch(/^ {4}(if|needs):/m);
    });

    it("looks at the merge commit and its base before anything else", () => {
      const [checkout, changes] = steps(job);
      expect(checkout).toMatch(/^uses: actions\/checkout@v\d+\n {8}with:\n {10}fetch-depth: 2$/);
      expect(changes).toBe(
        [
          "id: changes",
          "        if: github.event_name == 'pull_request'",
          '        run: scripts/ci-needed.sh >> "$GITHUB_OUTPUT"',
        ].join("\n"),
      );
    });

    // Unset output (a push to main) is not 'false', so everything runs.
    it("does everything else only when it is needed", () => {
      const rest = steps(job).slice(2);
      expect(rest.length).toBeGreaterThan(0);
      for (const step of rest) {
        const condition = /^(?: {8})?if: (.*)$/m.exec(step)?.[1];
        expect(condition, step).toMatch(
          /^((failure\(\) && )?steps\.changes\.outputs\.run != 'false'|github\.event_name == 'push' && github\.ref == 'refs\/heads\/main')$/,
        );
      }
    });
  });
});

describe("the end-to-end tests", () => {
  const shardJob = () => block(workflow, "e2e-shard", 2);
  const testSteps = () => steps("e2e-shard").filter((step) => step.includes("test:e2e"));

  // The total comes from the matrix itself, so a changed list cannot leave a shard out as long
  // as it counts from 1 without gaps.
  it("run as ten shards that together are the whole suite, on both viewports", () => {
    expect(block(block(shardJob(), "strategy", 4), "matrix", 6).trim()).toBe(
      "shard: [1, 2, 3, 4, 5, 6, 7, 8, 9, 10]",
    );
    expect(testSteps()).toHaveLength(1);
    expect(testSteps()[0]).toMatch(
      /^ {8}run: pnpm run test:e2e --shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}$/m,
    );
  });

  it("all run to the end when one shard fails", () => {
    expect(block(shardJob(), "strategy", 4)).toMatch(/^ {6}fail-fast: false$/m);
    expect(shardJob()).not.toMatch(/continue-on-error/);
  });

  it("keep a failure report for each shard", () => {
    expect(shardJob()).toMatch(/^ {10}name: playwright-report-\$\{\{ matrix\.shard \}\}$/m);
  });

  describe("the required check `e2e`", () => {
    // A skipped required check counts as passing, so the job must run however the shards ended.
    it("always runs, after every shard", () => {
      const gate = block(workflow, "e2e", 2);
      expect(gate).toMatch(/^ {4}needs: \[e2e-shard\]$/m);
      expect(gate).toMatch(/^ {4}if: \$\{\{ always\(\) \}\}$/m);
      expect(gate).not.toMatch(/continue-on-error/);
      expect(steps("e2e")).toHaveLength(1);
      expect(steps("e2e")[0]).not.toMatch(/^ {8}if:/m);
      expect(steps("e2e")[0]).toMatch(/^ {10}RESULT: \$\{\{ needs\.e2e-shard\.result \}\}$/m);
    });

    it.each([
      ["success", true],
      ["failure", false],
      ["cancelled", false],
      ["skipped", false],
      ["", false],
    ])("given the shards' result %j, passes: %s", (result, passes) => {
      const script = /^ {8}run: (.*)$/m.exec(steps("e2e")[0])?.[1];
      expect(script).toBeDefined();
      // As GitHub runs a step.
      const { status } = spawnSync("bash", ["-eo", "pipefail", "-c", script!], {
        env: { ...process.env, RESULT: result },
      });
      expect(status === 0).toBe(passes);
    });
  });
});

describe("the production build", () => {
  // Nothing there reads its output, and the shards fail on a broken build anyway.
  it("is not run by the checks job", () => {
    expect(block(workflow, "checks", 2)).not.toMatch(/pnpm (run )?build/);
  });

  // This is what fails a pull request that breaks the build, through the required check `e2e`.
  it("is run by every e2e shard before its tests", () => {
    const shard = steps("e2e-shard");
    const builds = shard.filter((step) => step.includes("pnpm run build"));
    expect(builds).toEqual([
      "run: pnpm run build\n        if: steps.changes.outputs.run != 'false'",
    ]);
    const tests = shard.findIndex((step) => step.includes("test:e2e"));
    expect(shard.indexOf(builds[0])).toBeLessThan(tests);
  });
});

describe("an e2e shard's browser", () => {
  // The tests are headless, and the runner image already has the system libraries.
  it("is only the headless one the tests run, with no system packages", () => {
    const installs = steps("e2e-shard").filter((step) => step.includes("playwright install"));
    expect(installs).toEqual([
      [
        "name: Install headless Chromium for Playwright",
        "        if: steps.changes.outputs.run != 'false'",
        "        run: pnpm exec playwright install --only-shell chromium",
      ].join("\n"),
    ]);
  });
});

describe("publishing", () => {
  it("still needs every required check, on a push to main only", () => {
    const publish = block(workflow, "publish", 2);
    expect(publish).toMatch(/^ {4}needs: \[checks, e2e, production-image\]$/m);
    expect(publish).toMatch(
      /^ {4}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m,
    );
  });
});

// What lets a docs-only change go unchecked: no tool that makes or judges the app reads docs/.
describe("nothing under docs/", () => {
  it.each([
    ["linted", "eslint.config.mjs", /^ {4}"docs\/\*\*",$/m],
    ["type checked", "tsconfig.json", /"exclude": \[[^\]]*"docs"/],
    ["scanned for CSS classes", "src/app/globals.css", /^@source not "\.\.\/\.\.\/docs";$/m],
    ["in the image's build context", ".dockerignore", /^docs$/m],
  ])("is %s", (_, file, exclusion) => {
    expect(read(file)).toMatch(exclusion);
  });
});
