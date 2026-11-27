import { execFileSync, spawnSync } from "node:child_process";
import { mkdirSync, mkdtempSync, renameSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

const script = resolve("scripts/ci-needed.sh");

// No user or system git configuration (signing, hooks, quoting) reaches these repositories, and
// no inherited GIT_DIR or GIT_INDEX_FILE (set inside a git hook) points git at the real one.
const env = {
  ...Object.fromEntries(Object.entries(process.env).filter(([name]) => !name.startsWith("GIT_"))),
  NODE_ENV: process.env.NODE_ENV,
  GIT_CONFIG_GLOBAL: "/dev/null",
  GIT_CONFIG_NOSYSTEM: "1",
};

let repo: string;

function git(...args: string[]) {
  execFileSync("git", ["-c", "user.name=ci", "-c", "user.email=ci@example.com", ...args], {
    cwd: repo,
    env,
    stdio: "pipe",
  });
}

function write(path: string, content = `${path}\n`) {
  mkdirSync(dirname(join(repo, path)), { recursive: true });
  writeFileSync(join(repo, path), content);
}

function commit(message: string) {
  git("add", "--all");
  git("commit", "--allow-empty", "-m", message);
}

/** The checkout GitHub gives a pull request: a merge whose first parent is the base branch. */
function mergeOf(change: () => void) {
  git("checkout", "-b", "pr");
  change();
  commit("pull request");
  git("checkout", "main");
  // The base moves on after the branch was made; its changes are not the pull request's.
  write("src/moved-on.ts");
  commit("base moves on");
  git("merge", "--no-ff", "-m", "merge", "pr");
}

function ciNeeded() {
  const result = spawnSync("bash", [script], { cwd: repo, env, encoding: "utf8" });
  return { status: result.status, stdout: result.stdout };
}

const skip = { status: 0, stdout: "run=false\n" };
const run = { status: 0, stdout: "run=true\n" };

beforeEach(() => {
  repo = mkdtempSync(join(tmpdir(), "ci-needed-"));
  git("init", "--initial-branch=main");
  write("src/app.ts", "export const app = 1;\n");
  // Stays put, so that moving app.ts does not look to git like all of src/ moving.
  write("src/other.ts");
  write("docs/ui/old.html");
  commit("base");
});

afterEach(() => rmSync(repo, { recursive: true, force: true }));

describe("REL-3: whether a pull request needs CI", () => {
  it("skips it when every change is under docs/", () => {
    mergeOf(() => {
      write("docs/ui/mockup.html");
      write("docs/retrospectives/hf-x.md");
      rmSync(join(repo, "docs/ui/old.html"));
    });
    expect(ciNeeded()).toEqual(skip);
  });

  it("skips it for a docs file whose name git would quote", () => {
    mergeOf(() => write("docs/ui/kök och hall.html"));
    expect(ciNeeded()).toEqual(skip);
  });

  it.each(["src/new.ts", "README.md", ".github/workflows/ci.yml", "docs-x/a.md", "src/docs/a.md"])(
    "runs it for a change to %s",
    (path) => {
      mergeOf(() => write(path));
      expect(ciNeeded()).toEqual(run);
    },
  );

  it("runs it when docs and anything else change together", () => {
    mergeOf(() => {
      write("docs/ui/mockup.html");
      write("src/new.ts");
    });
    expect(ciNeeded()).toEqual(run);
  });

  it("runs it for a file named docs, which is not the directory", () => {
    rmSync(join(repo, "docs"), { recursive: true });
    commit("no docs directory");
    mergeOf(() => write("docs"));
    expect(ciNeeded()).toEqual(run);
  });

  it("runs it when code is moved into docs/", () => {
    mergeOf(() => renameSync(join(repo, "src/app.ts"), join(repo, "docs/app.ts")));
    expect(ciNeeded()).toEqual(run);
  });

  it("runs it when code is deleted", () => {
    mergeOf(() => rmSync(join(repo, "src/app.ts")));
    expect(ciNeeded()).toEqual(run);
  });

  it("runs it when the merge changes nothing, since that is not known to be docs", () => {
    mergeOf(() => {});
    expect(ciNeeded()).toEqual(run);
  });

  it("runs it when the checkout is not a merge, whose parent would hide earlier commits", () => {
    write("src/new.ts");
    commit("code");
    write("docs/ui/mockup.html");
    commit("docs");
    expect(ciNeeded()).toEqual(run);
  });
});
