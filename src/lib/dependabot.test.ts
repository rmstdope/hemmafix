import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// Every Dependabot pull request costs a full CI run, so each ecosystem's patch and minor updates
// arrive together. Major updates match no group and keep a pull request of their own.

const group = `
    groups:
      minor-and-patch:
        patterns: ["*"]
        update-types: [minor, patch]
`;

describe("the Dependabot configuration", () => {
  const [, ...entries] = readFileSync(".github/dependabot.yml", "utf8").split(
    /^ {2}- package-ecosystem: /m,
  );

  it("covers pnpm, GitHub Actions and the Docker base image", () => {
    expect(entries.map((entry) => /^\S+/.exec(entry)?.[0])).toEqual([
      "npm",
      "github-actions",
      "docker",
    ]);
  });

  it("groups patch and minor updates, never major, in every ecosystem", () => {
    for (const entry of entries) {
      expect(entry).toContain(group);
      expect(entry.match(/update-types:/g)).toHaveLength(1);
    }
  });
});
