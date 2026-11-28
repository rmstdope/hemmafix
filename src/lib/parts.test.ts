import { describe, expect, it } from "vitest";
import { litPart, PARTS, parseJagPart, partOf, rememberedPart } from "./parts";

describe("PARTS", () => {
  it("has Kalender between Listor and Jag", () => {
    expect(PARTS.map((p) => p.label)).toEqual(["Uppgifter", "Listor", "Kalender", "Jag"]);
  });
});

describe("partOf", () => {
  it("puts the board and its history under Uppgifter", () => {
    expect(partOf("/")).toBe("uppgifter");
    expect(partOf("/gjort")).toBe("uppgifter");
  });
  it("knows Listor", () => {
    expect(partOf("/listor")).toBe("listor");
    expect(partOf("/listor/6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70")).toBe("listor");
  });
  it("knows Kalender", () => {
    expect(partOf("/kalender")).toBe("kalender");
  });
  it("knows Jag", () => {
    expect(partOf("/jag")).toBe("jag");
  });
  it("has no part for Hemmet, login or anything else", () => {
    for (const p of ["/hemmet", "/hemmet/rutiner/1", "/login", "/consent"]) expect(partOf(p)).toBeNull();
  });
});

describe("rememberedPart", () => {
  it("remembers Listor, and falls back to Uppgifter", () => {
    expect(rememberedPart("listor")).toBe("listor");
    expect(rememberedPart("jag")).toBe("jag");
    expect(rememberedPart("kalender")).toBe("kalender");
    expect(rememberedPart("uppgifter")).toBe("uppgifter");
    expect(rememberedPart(null)).toBe("uppgifter");
    expect(rememberedPart("junk")).toBe("uppgifter");
  });
});

describe("litPart", () => {
  it("lights Jag when Gjort or Hemmet was opened from it", () => {
    expect(litPart("/gjort", "jag")).toBe("jag");
    expect(litPart("/hemmet", "jag")).toBe("jag");
  });
  it("lights the part Hemmet and a routine's page were opened from", () => {
    for (const p of ["/hemmet", "/hemmet/rutiner/1"]) {
      expect(litPart(p, "listor")).toBe("listor");
      expect(litPart(p, "uppgifter")).toBe("uppgifter");
    }
  });
  it("ignores the remembered part everywhere else", () => {
    expect(litPart("/", "listor")).toBe("uppgifter");
    expect(litPart("/listor", "uppgifter")).toBe("listor");
    expect(litPart("/login", "listor")).toBeNull();
  });
});

describe("parseJagPart", () => {
  it("knows both parts, and falls back to Framsteg", () => {
    expect(parseJagPart("butik")).toBe("butik");
    expect(parseJagPart("framsteg")).toBe("framsteg");
    expect(parseJagPart(null)).toBe("framsteg");
    expect(parseJagPart("junk")).toBe("framsteg");
  });
});
