import { describe, expect, it } from "vitest";
import { PARTS, partOf } from "./parts";

describe("partOf", () => {
  it("puts the board and its history under Uppgifter", () => {
    expect(partOf("/")).toBe("uppgifter");
    expect(partOf("/gjort")).toBe("uppgifter");
  });
  it("knows Listor", () => {
    expect(partOf("/listor")).toBe("listor");
  });
  it("has no part for Hemmet, login or anything else", () => {
    for (const p of ["/hemmet", "/hemmet/rutiner/1", "/login", "/consent"]) expect(partOf(p)).toBeNull();
  });
  it("lists the parts in tab order", () => {
    expect(PARTS.map((p) => p.label)).toEqual(["Uppgifter", "Listor"]);
  });
});
