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

  describe.each(["checks", "e2e", "production-image"])("in the %s job", (job) => {
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
