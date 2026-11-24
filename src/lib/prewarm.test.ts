import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("the verifier's prewarm build", () => {
  const conf = read(".cerebro/project.conf");
  const command = /^prewarm\s+(.*?)(\s+#.*)?$/m.exec(conf)?.[1];

  it("runs a package script, since the harness does not run a shell", () => {
    expect(command).toMatch(/^pnpm [\w:-]+$/);
  });

  it("discards the build output of an earlier commit before building", () => {
    const name = command?.split(" ")[1] ?? "";
    const scripts = JSON.parse(read("package.json")).scripts as Record<string, string>;
    expect(scripts[name]).toMatch(/^rm -rf \.next && next build$/);
  });
});
