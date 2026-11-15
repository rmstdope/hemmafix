import { describe, expect, it } from "vitest";
import { formatDay, formatDue, formatTime, todayIso } from "./dates";

const today = "2026-11-14";

describe("formatDue", () => {
  it("returns null without a date", () => {
    expect(formatDue(null, today)).toBeNull();
  });

  it("uses relative labels around today", () => {
    expect(formatDue("2026-11-14", today)).toEqual({ label: "Idag", overdue: false });
    expect(formatDue("2026-11-15", today)).toEqual({ label: "Imorgon", overdue: false });
    expect(formatDue("2026-11-13", today)).toEqual({ label: "Igår", overdue: true });
  });

  it("crosses month and year boundaries", () => {
    expect(formatDue("2027-01-01", "2026-12-31")?.label).toBe("Imorgon");
    expect(formatDue("2026-02-28", "2026-03-01")?.label).toBe("Igår");
  });

  it("formats other dates and flags overdue ones", () => {
    expect(formatDue("2026-12-24", today)).toEqual({ label: "24 dec.", overdue: false });
    expect(formatDue("2026-11-01", today)?.overdue).toBe(true);
  });
});

describe("todayIso", () => {
  it("uses Swedish time, not UTC", () => {
    // 23:30 UTC on 14 Nov is already 15 Nov in Stockholm (UTC+1).
    expect(todayIso(new Date("2026-11-14T23:30:00Z"))).toBe("2026-11-15");
    // 21:30 UTC on 30 Jun is 23:30 in Stockholm (UTC+2, summer time).
    expect(todayIso(new Date("2026-06-30T21:30:00Z"))).toBe("2026-06-30");
  });
});

describe("formatDay", () => {
  it("names today and yesterday, and spells out other days", () => {
    expect(formatDay("2026-11-15", "2026-11-15")).toBe("Idag");
    expect(formatDay("2026-11-14", "2026-11-15")).toBe("Igår");
    expect(formatDay("2026-11-12", "2026-11-15")).toMatch(/^Torsdag 12 nov/);
  });
});

describe("formatTime and todayIso", () => {
  it("use Swedish time, so a late tick lands on the right day", () => {
    const lateEvening = new Date("2026-11-15T23:30:00Z"); // 00:30 on the 16th in Stockholm
    expect(todayIso(lateEvening)).toBe("2026-11-16");
    expect(formatTime(lateEvening)).toBe("00:30");
  });
});
