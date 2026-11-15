import { describe, expect, it } from "vitest";
import { formatRecurrence, nextDueDate } from "./recurrence";

describe("nextDueDate", () => {
  it("counts days and weeks from the day the task was done", () => {
    expect(nextDueDate("2026-11-15", { unit: "day", interval: 1 })).toBe("2026-11-16");
    expect(nextDueDate("2026-11-15", { unit: "day", interval: 3 })).toBe("2026-11-18");
    expect(nextDueDate("2026-11-15", { unit: "week", interval: 1 })).toBe("2026-11-22");
    expect(nextDueDate("2026-11-15", { unit: "week", interval: 2 })).toBe("2026-11-29");
  });

  it("crosses month and year ends", () => {
    expect(nextDueDate("2026-12-30", { unit: "day", interval: 3 })).toBe("2027-01-02");
    expect(nextDueDate("2026-12-28", { unit: "week", interval: 1 })).toBe("2027-01-04");
    expect(nextDueDate("2026-11-15", { unit: "month", interval: 2 })).toBe("2027-01-15");
  });

  it("falls back to the last day of shorter months", () => {
    expect(nextDueDate("2027-01-31", { unit: "month", interval: 1 })).toBe("2027-02-28");
    expect(nextDueDate("2028-01-31", { unit: "month", interval: 1 })).toBe("2028-02-29");
    expect(nextDueDate("2026-08-31", { unit: "month", interval: 1 })).toBe("2026-09-30");
    expect(nextDueDate("2026-10-31", { unit: "month", interval: 12 })).toBe("2027-10-31");
  });

  it("is not shifted by daylight saving time", () => {
    // Sweden goes to winter time on 2026-10-25.
    expect(nextDueDate("2026-10-24", { unit: "day", interval: 1 })).toBe("2026-10-25");
    expect(nextDueDate("2026-10-20", { unit: "week", interval: 1 })).toBe("2026-10-27");
  });
});

describe("formatRecurrence", () => {
  it("reads naturally in Swedish", () => {
    expect(formatRecurrence({ unit: "day", interval: 1 })).toBe("Varje dag");
    expect(formatRecurrence({ unit: "week", interval: 2 })).toBe("Varannan vecka");
    expect(formatRecurrence({ unit: "month", interval: 3 })).toBe("Var 3:e månad");
    expect(formatRecurrence({ unit: "day", interval: 11 })).toBe("Var 11:e dag");
    expect(formatRecurrence({ unit: "day", interval: 21 })).toBe("Var 21:a dag");
    expect(formatRecurrence({ unit: "week", interval: 22 })).toBe("Var 22:a vecka");
  });
});
