import { describe, expect, it } from "vitest";
import { formatShortDay } from "./dates";
import { firstPostponeDay, focusAfterMove, moveTask, movedText, quickDays, restoredText } from "./postpone";

// Thursday 26 November 2026.
const today = "2026-11-26";
const labels = (dueDate: string) => quickDays(dueDate, today).map((q) => q.label);

describe("quickDays", () => {
  it.each(["2026-11-12", "2026-11-25"])("starts at today for a late chore, due %s", (dueDate) => {
    expect(quickDays(dueDate, today)).toEqual([
      { day: "2026-11-26", label: "Idag" },
      { day: "2026-11-27", label: "Imorgon" },
      { day: "2026-11-28", label: "Lör 28" },
    ]);
  });

  it("starts tomorrow for a chore due today", () => {
    expect(quickDays(today, today)).toEqual([
      { day: "2026-11-27", label: "Imorgon" },
      { day: "2026-11-28", label: "Lör 28" },
      { day: "2026-11-29", label: "Sön 29" },
    ]);
  });

  it("starts the day after the chore's own when it is later than today", () => {
    expect(labels("2026-11-27")).toEqual(["Lör 28", "Sön 29", "Mån 30"]);
    expect(labels("2026-11-30")).toEqual(["Tis 1", "Ons 2", "Tor 3"]);
  });
});

describe("firstPostponeDay", () => {
  it("is today for a late chore, else the day after the chore's own: nothing before it can be chosen", () => {
    expect(firstPostponeDay("2026-11-25", today)).toBe(today);
    expect(firstPostponeDay(today, today)).toBe("2026-11-27");
    expect(firstPostponeDay("2026-11-30", today)).toBe("2026-12-01");
  });
});

describe("the messages", () => {
  it("name the chore and the day with weekday, day and short month", () => {
    expect(formatShortDay("2026-11-26")).toBe("tor 26 nov");
    expect(formatShortDay("2026-12-01")).toBe("tis 1 dec");
    expect(movedText("Dammsuga hallen", "2026-11-28", today)).toBe('"Dammsuga hallen" flyttad till lör 28 nov');
    expect(restoredText("Dammsuga hallen", "2026-11-24")).toBe('"Dammsuga hallen" är tillbaka på tis 24 nov');
  });

  it("say idag for a move to today", () => {
    expect(movedText("Dammsuga hallen", today, today)).toBe('"Dammsuga hallen" flyttad till idag');
  });
});

describe("moveTask", () => {
  const task = (id: string, dueDate: string | null, minute = 0) => ({
    id,
    dueDate,
    createdAt: new Date(Date.UTC(2026, 10, 1, 12, minute)),
    undatedSince: null,
  });

  it("gives the task its new day and puts it where the list's order has it", () => {
    const list = [task("a", "2026-11-30"), task("b", "2026-12-01", 1), task("c", "2026-12-04"), task("d", null)];

    expect(moveTask(list, "a", "2026-12-01").map((t) => [t.id, t.dueDate])).toEqual([
      ["a", "2026-12-01"],
      ["b", "2026-12-01"],
      ["c", "2026-12-04"],
      ["d", null],
    ]);
    expect(moveTask(list, "a", "2026-12-02").map((t) => t.id)).toEqual(["b", "a", "c", "d"]);
    expect(moveTask(list, "c", "2026-11-28").map((t) => t.id)).toEqual(["c", "a", "b", "d"]);
  });
});

describe("focusAfterMove", () => {
  const ids = ["a", "b", "c"];

  it("follows the moved chore when it stays on the tab", () => {
    expect(focusAfterMove(ids, "b", true)).toBe("b");
  });

  it("goes to the chore that takes its place, else the one above, else the tab", () => {
    expect(focusAfterMove(ids, "a", false)).toBe("b");
    expect(focusAfterMove(ids, "c", false)).toBe("b");
    expect(focusAfterMove(["a"], "a", false)).toBeNull();
  });
});
