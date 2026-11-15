import { describe, expect, it } from "vitest";
import { formatConnectedDate, formatDay, formatDue, formatLastUsed, formatTime, todayIso } from "./dates";

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

describe("formatConnectedDate", () => {
  it("writes a date without a trailing dot", () => {
    expect(formatConnectedDate(new Date("2026-11-12T10:00:00Z"))).toBe("12 nov 2026");
    expect(formatConnectedDate(new Date("2026-10-04T10:00:00Z"))).toBe("4 okt 2026");
  });

  it("uses the Stockholm day, not the UTC day", () => {
    expect(formatConnectedDate(new Date("2026-11-11T23:30:00Z"))).toBe("12 nov 2026");
  });
});

describe("formatLastUsed", () => {
  const now = new Date("2026-11-15T12:00:00Z");

  it("says so when the app was never used", () => {
    expect(formatLastUsed(null, now)).toBe("Inte använd ännu");
  });

  it("uses i dag and i går with the clock time", () => {
    expect(formatLastUsed(new Date("2026-11-15T07:14:00Z"), now)).toBe("i dag 08:14");
    expect(formatLastUsed(new Date("2026-11-14T18:02:00Z"), now)).toBe("i går 19:02");
  });

  it("uses a date from the day before yesterday on", () => {
    expect(formatLastUsed(new Date("2026-11-13T18:02:00Z"), now)).toBe("13 nov 2026");
  });

  it("compares Stockholm days across the end of daylight saving time", () => {
    // 2026-10-25 is 25 hours long in Stockholm; 23:30 the evening before is still "i går".
    expect(formatLastUsed(new Date("2026-10-24T21:30:00Z"), new Date("2026-10-25T09:00:00Z"))).toBe("i går 23:30");
  });

  it("compares Stockholm days across midnight", () => {
    expect(formatLastUsed(new Date("2026-11-14T23:30:00Z"), new Date("2026-11-15T00:30:00Z"))).toBe("i dag 00:30");
  });
});
