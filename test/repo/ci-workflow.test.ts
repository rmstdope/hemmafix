import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Only the mistakes in the workflow that would pass unnoticed. A broken step, build or trigger
// shows itself in the run, and needs no test here.

// Read as text: the project has no YAML dependency, and these are the lines that matter.
const workflow = readFileSync(".github/workflows/ci.yml", "utf8");

/** The lines indented under `key:` at the given depth, comments and blank lines dropped. */
function block(text: string, key: string, indent: number) {
  const lines = text.split("\n").filter((line) => !/^\s*(#.*)?$/.test(line));
  const start = lines.indexOf(`${" ".repeat(indent)}${key}:`);
  expect(start, `${key}: not found`).toBeGreaterThanOrEqual(0);
  const rest = lines.slice(start + 1);
  const end = rest.findIndex((line) => line.search(/\S/) <= indent);
  return rest.slice(0, end === -1 ? undefined : end).join("\n");
}

const job = (name: string) => block(workflow, name, 2);

/** A job's steps, each as its own text. */
function steps(name: string) {
  return block(job(name), "steps", 4)
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

describe("a required check cannot pass without its work", () => {
  describe.each(["checks", "e2e-shard", "production-image"])("in the %s job", (name) => {
    // A skipped job reports as passing, also when it was skipped because something failed.
    it("runs the job itself", () => {
      expect(job(name)).not.toMatch(/^ {4}(if|needs):/m);
    });

    // On a push to main the output stays unset: a merge commit there could otherwise be skipped.
    it("lets only ci-needed.sh, on a pull request, decide to skip", () => {
      expect(steps(name)[1]).toBe(
        [
          "id: changes",
          "        if: github.event_name == 'pull_request'",
          '        run: scripts/ci-needed.sh >> "$GITHUB_OUTPUT"',
        ].join("\n"),
      );
    });

    // Unset output is not 'false', so any other comparison would skip work on main.
    it("skips a later step only on that answer", () => {
      for (const step of steps(name).slice(2)) {
        const condition = /^(?: {8})?if: (.*)$/m.exec(step)?.[1];
        if (condition === undefined) continue;
        expect(condition, step).toMatch(
          /^((failure\(\) && )?steps\.changes\.outputs\.run != 'false'|(strategy\.job-index == 0 && )?github\.event_name == 'push' && github\.ref == 'refs\/heads\/main')$/,
        );
      }
    });
  });

  it.each(["checks", "e2e-shard", "e2e", "production-image"])(
    "lets no failure pass in the %s job",
    (name) => {
      expect(job(name)).not.toMatch(/continue-on-error/);
    },
  );

  // A total written out by hand could outlive a shortened matrix, and leave tests unrun.
  it("splits the end-to-end tests by the matrix's own size", () => {
    expect(job("e2e-shard")).toMatch(
      /^ {8}run: pnpm run test:e2e --shard=\$\{\{ matrix\.shard \}\}\/\$\{\{ strategy\.job-total \}\}$/m,
    );
  });

  it("runs the repository checks in the checks job", () => {
    expect(job("checks")).toMatch(/^ {6}- run: pnpm run test:repo$/m);
  });

  describe("the required check `e2e`", () => {
    // A skipped required check counts as passing, so the job must run however the shards ended.
    it("always runs, after every shard", () => {
      expect(job("e2e")).toMatch(/^ {4}needs: \[e2e-shard\]$/m);
      expect(job("e2e")).toMatch(/^ {4}if: \$\{\{ always\(\) \}\}$/m);
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

describe("publishing", () => {
  it("needs every required check, on a push to main only", () => {
    expect(job("publish")).toMatch(/^ {4}needs: \[checks, e2e, production-image\]$/m);
    expect(job("publish")).toMatch(
      /^ {4}if: github\.event_name == 'push' && github\.ref == 'refs\/heads\/main'$/m,
    );
  });
});
