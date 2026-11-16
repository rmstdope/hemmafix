import { describe, expect, it } from "vitest";
import { parseFolded, toggleFolded } from "./folded-groups";

describe("parseFolded", () => {
  it("reads a stored list and shrugs off anything else", () => {
    expect(parseFolded('["overdue","2026-11-18"]')).toEqual(["overdue", "2026-11-18"]);
    expect(parseFolded(null)).toEqual([]);
    expect(parseFolded("not json")).toEqual([]);
    expect(parseFolded('{"a":1}')).toEqual([]);
    expect(parseFolded('[1,"later"]')).toEqual(["later"]);
  });
});

describe("toggleFolded", () => {
  it("folds an open group and opens a folded one", () => {
    expect(toggleFolded([], "later", "2026-11-16")).toEqual(["later"]);
    expect(toggleFolded(["later", "undated"], "later", "2026-11-16")).toEqual(["undated"]);
  });

  it("forgets folded days that are already past, but keeps named groups and later days", () => {
    expect(toggleFolded(["2026-11-15", "2026-11-18", "overdue"], "later", "2026-11-16")).toEqual([
      "2026-11-18",
      "overdue",
      "later",
    ]);
  });
});
