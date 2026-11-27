import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

// The Node major is stated once, on the Dockerfile's `FROM node:<major>` line, which is what
// Dependabot moves. Whatever has to say it again is checked against that line here.
it("states the same Node version as the Dockerfile's image everywhere", () => {
  const dockerfile = read("Dockerfile");
  const images = [
    ...dockerfile.matchAll(/^FROM\s+(?:--\S+\s+)*(?:docker\.io\/(?:library\/)?)?node:(\d+)/gim),
  ];
  expect(images, "Dockerfile: there must be exactly one `FROM node:` line").toHaveLength(1);
  const major = images[0][1];

  expect(dockerfile, "Dockerfile: derive esbuild's --target from the image").not.toMatch(
    /--target[= ]["']?node\d/,
  );
  expect(read(".nvmrc").trim(), ".nvmrc").toMatch(new RegExp(`^v?${major}(\\.\\d+)*$`));
  expect(
    JSON.parse(read("package.json")).devDependencies["@types/node"],
    "package.json @types/node",
  ).toMatch(new RegExp(`^[\\^~]?${major}\\.`));
});
