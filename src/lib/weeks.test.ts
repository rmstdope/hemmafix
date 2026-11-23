import { describe, expect, it } from "vitest";
import { comparisonLine, formatWeekRange, weekStart } from "./weeks";

describe("weekStart", () => {
  it("is the Monday on or before the date", () => {
    expect(weekStart("2026-11-23")).toBe("2026-11-23");
    expect(weekStart("2026-11-29")).toBe("2026-11-23");
    expect(weekStart("2026-12-02")).toBe("2026-11-30");
    expect(weekStart("2026-03-01")).toBe("2026-02-23");
  });
});

describe("comparisonLine", () => {
  const counts = (tasks: number) => ({ tasks, coins: 0, badges: 0 });
  it("cheers more tasks, in singular and plural", () => {
    expect(comparisonLine(counts(12), counts(9), "förra veckan")).toBe("3 fler uppgifter än förra veckan!");
    expect(comparisonLine(counts(4), counts(3), "förra veckan")).toBe("1 fler uppgift än förra veckan!");
  });
  it("says equal, and never scolds for fewer", () => {
    expect(comparisonLine(counts(5), counts(5), "förra veckan")).toBe("Lika många uppgifter som förra veckan.");
    expect(comparisonLine(counts(2), counts(5), "förra veckan")).toBe("Ny vecka – nu kör vi!");
  });
  it("starts fresh when both weeks are empty", () => {
    expect(comparisonLine(counts(0), counts(0), "förra veckan")).toBe("Ny vecka – nu kör vi!");
  });
  it("uses the word it is given", () => {
    expect(comparisonLine(counts(5), counts(5), "veckan före")).toBe("Lika många uppgifter som veckan före.");
  });
});

describe("formatWeekRange", () => {
  it("writes a week inside a month", () => {
    expect(formatWeekRange("2026-11-16")).toBe("16–22 november");
  });
  it("writes a week across months", () => {
    expect(formatWeekRange("2026-10-26")).toBe("26 oktober – 1 november");
  });
});
