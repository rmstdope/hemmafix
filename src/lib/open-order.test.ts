import { describe, expect, it } from "vitest";
import { byOpenOrder } from "./open-order";

const at = (minute: number) => new Date(Date.UTC(2026, 10, 1, 12, minute));
const task = (id: string, dueDate: string | null, created = 0, undatedSince: number | null = null) => ({
  id,
  dueDate,
  createdAt: at(created),
  undatedSince: undatedSince === null ? null : at(undatedSince),
});
const ordered = (...tasks: ReturnType<typeof task>[]) => tasks.sort(byOpenOrder).map((t) => t.id);

describe("byOpenOrder", () => {
  it("puts the earlier day first and the undated last", () => {
    expect(ordered(task("none", null), task("later", "2026-12-04"), task("sooner", "2026-11-30", 5))).toEqual([
      "sooner",
      "later",
      "none",
    ]);
  });

  it("puts the older first on one day, and goes by id for one moment", () => {
    const day = "2026-12-01";
    expect(ordered(task("a", day, 5), task("c", day, 1), task("b", day, 1))).toEqual(["b", "c", "a"]);
  });

  it("lets the undated wait from when they were added, or from when their date was removed", () => {
    const cleared = task("cleared", null, 1, 9);
    expect(ordered(cleared, task("newer", null, 5), task("older", null, 2))).toEqual(["older", "newer", "cleared"]);
  });

  it("goes by age between undated that have waited equally long", () => {
    expect(ordered(task("a", null, 5), task("b", null, 1, 5))).toEqual(["b", "a"]);
  });

  it("forgets a removed date once the task has a day again", () => {
    const day = "2026-12-01";
    expect(ordered(task("newer", day, 5), task("cleared", day, 1, 9))).toEqual(["cleared", "newer"]);
  });
});
