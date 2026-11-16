import { describe, expect, it } from "vitest";
import { groupByDue } from "./due-groups";

const t = (title: string, dueDate: string | null) => ({ title, dueDate });
const today = "2026-11-16";

describe("groupByDue", () => {
  it("puts earlier dates under Försenade, flagged overdue and showing their date", () => {
    const [g] = groupByDue([t("a", "2026-11-15")], today);
    expect(g).toMatchObject({ key: "overdue", label: "Försenade", overdue: true, showDate: true });
  });

  it("gives today and the four days after it a group each, with the agreed words", () => {
    const groups = groupByDue(
      ["16", "17", "18", "19", "20"].map((d) => t(d, `2026-11-${d}`)),
      today,
    );
    expect(groups.map((g) => g.label)).toEqual(["Idag", "Imorgon", "Onsdag 18 nov.", "Torsdag 19 nov.", "Fredag 20 nov."]);
    expect(groups.map((g) => g.key)).toEqual(["2026-11-16", "2026-11-17", "2026-11-18", "2026-11-19", "2026-11-20"]);
    expect(groups.every((g) => !g.overdue && !g.showDate)).toBe(true);
  });

  it("puts everything after the fifth day under Senare, showing the date", () => {
    const [g] = groupByDue([t("a", "2026-11-21"), t("b", "2027-01-01")], today);
    expect(g).toMatchObject({ key: "later", label: "Senare", showDate: true });
    expect(g!.items).toHaveLength(2);
  });

  it("puts tasks without a date last, showing no date", () => {
    const groups = groupByDue([t("a", null), t("b", "2026-11-21"), t("c", "2026-11-10"), t("d", "2026-11-16")], today);
    expect(groups.map((g) => g.label)).toEqual(["Försenade", "Idag", "Senare", "Utan datum"]);
    expect(groups.at(-1)).toMatchObject({ key: "undated", showDate: false });
  });

  it("omits empty groups and keeps the input order inside a group", () => {
    const groups = groupByDue([t("b", "2026-11-17"), t("a", "2026-11-17")], today);
    expect(groups).toHaveLength(1);
    expect(groups[0]!.items.map((i) => i.title)).toEqual(["b", "a"]);
  });

  it("returns nothing for no tasks", () => {
    expect(groupByDue([], today)).toEqual([]);
  });

  it("counts days across a month and year boundary", () => {
    const groups = groupByDue([t("a", "2027-01-02"), t("b", "2027-01-04")], "2026-12-30");
    expect(groups.map((g) => g.label)).toEqual(["Lördag 2 jan.", "Senare"]);
  });
});
