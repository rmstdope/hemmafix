import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// The Node major is stated once, on the Dockerfile's `FROM node:<major>` line, which is what
// Dependabot moves. Whatever has to say it again is checked against that line here.

interface Files {
  dockerfile: string;
  nvmrc: string;
  packageJson: string;
}

/** One sentence for each thing that does not follow the Dockerfile's Node image. */
function outOfStep({ dockerfile, nvmrc, packageJson }: Files): string[] {
  const images = [
    ...dockerfile.matchAll(/^FROM\s+(?:--\S+\s+)*(?:docker\.io\/(?:library\/)?)?node:(\d+)/gim),
  ];
  if (images.length !== 1) {
    return [`Dockerfile: ${images.length} \`FROM node:\` lines, there must be exactly one`];
  }
  const major = images[0][1];
  const problems: string[] = [];
  const differs = (what: string, found: string | undefined) => {
    if (found !== major) {
      problems.push(
        `${what}: Node ${found ?? "(no version found)"}, the Dockerfile's image is Node ${major}`,
      );
    }
  };

  for (const [, target] of dockerfile.matchAll(/--target[= ]["']?node(\d+)/g)) {
    problems.push(
      `Dockerfile: --target=node${target} states the version again; derive it from the image`,
    );
  }
  differs(".nvmrc", /^v?(\d+)(?:\.\d+)*$/.exec(nvmrc.trim())?.[1]);
  const { devDependencies } = JSON.parse(packageJson);
  differs(
    "package.json @types/node",
    /^[\^~]?(\d+)\./.exec(devDependencies?.["@types/node"] ?? "")?.[1],
  );
  return problems;
}

const read = (path: string) => readFileSync(path, "utf8");

describe("the Node version", () => {
  it("is the same everywhere in this tree", () => {
    expect(
      outOfStep({
        dockerfile: read("Dockerfile"),
        nvmrc: read(".nvmrc"),
        packageJson: read("package.json"),
      }),
    ).toEqual([]);
  });
});

const dockerfile = (image: string) =>
  [`FROM ${image} AS node-image`, "FROM node-image AS base", "FROM node-image AS runtime"].join(
    "\n",
  );
const packageJson = (types: string) =>
  JSON.stringify({ devDependencies: { "@types/node": types } });
const inStep: Files = {
  dockerfile: dockerfile("node:26-alpine"),
  nvmrc: "26\n",
  packageJson: packageJson("^26.6.7"),
};

describe("the check of the Node version", () => {
  it("names everything left behind when only the Dockerfile's image moves", () => {
    expect(outOfStep({ ...inStep, dockerfile: dockerfile("node:28-alpine") })).toEqual([
      ".nvmrc: Node 26, the Dockerfile's image is Node 28",
      "package.json @types/node: Node 26, the Dockerfile's image is Node 28",
    ]);
  });

  it("names .nvmrc alone", () => {
    expect(outOfStep({ ...inStep, nvmrc: "24\n" })).toEqual([
      ".nvmrc: Node 24, the Dockerfile's image is Node 26",
    ]);
  });

  it("names @types/node alone", () => {
    expect(outOfStep({ ...inStep, packageJson: packageJson("^27.0.0") })).toEqual([
      "package.json @types/node: Node 27, the Dockerfile's image is Node 26",
    ]);
  });

  it.each([
    ["an .nvmrc it cannot read", { nvmrc: "lts/*\n" }, ".nvmrc"],
    ["no @types/node", { packageJson: "{}" }, "package.json @types/node"],
  ])("reports %s", (_, change, what) => {
    expect(outOfStep({ ...inStep, ...change })).toEqual([
      `${what}: Node (no version found), the Dockerfile's image is Node 26`,
    ]);
  });

  it.each([
    ["a second image line", `${dockerfile("node:26-alpine")}\nFROM node:26-alpine AS other`, 2],
    ["no image line", "FROM alpine AS base", 0],
  ])("reports %s", (_, changed, count) => {
    expect(outOfStep({ ...inStep, dockerfile: changed })).toEqual([
      `Dockerfile: ${count} \`FROM node:\` lines, there must be exactly one`,
    ]);
  });

  it.each(["--target=node26", "--target node26", '--target="node26"'])(
    "reports a literal esbuild %s",
    (target) => {
      const changed = `${inStep.dockerfile}\nRUN esbuild ${target}`;
      expect(outOfStep({ ...inStep, dockerfile: changed })).toEqual([
        "Dockerfile: --target=node26 states the version again; derive it from the image",
      ]);
    },
  );

  it.each([
    ["a full version in .nvmrc", { nvmrc: "v26.1.0\n" }],
    [
      "an image pinned by digest",
      { dockerfile: dockerfile("docker.io/library/node:26.1-alpine@sha256:abc") },
    ],
  ])("accepts %s", (_, change) => {
    expect(outOfStep({ ...inStep, ...change })).toEqual([]);
  });
});
