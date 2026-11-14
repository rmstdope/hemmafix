import { describe, expect, it } from "vitest";
import { formatDue } from "./dates";

const now = new Date(2026, 10, 14, 12); // 14 Nov 2026, local time

describe("formatDue", () => {
  it("returns null without a date", () => {
    expect(formatDue(null, now)).toBeNull();
  });

  it("uses relative labels around today", () => {
    expect(formatDue("2026-11-14", now)).toEqual({ label: "Idag", overdue: false });
    expect(formatDue("2026-11-15", now)).toEqual({ label: "Imorgon", overdue: false });
    expect(formatDue("2026-11-13", now)).toEqual({ label: "Igår", overdue: true });
  });

  it("formats other dates and flags overdue ones", () => {
    expect(formatDue("2026-12-24", now)).toEqual({ label: "24 dec.", overdue: false });
    expect(formatDue("2026-11-01", now)?.overdue).toBe(true);
  });
});
