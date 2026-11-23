import { describe, expect, it } from "vitest";
import { activeFilters, boardQuery, boardTabs, parseTab, splitByTab } from "./board-tabs";

const t = (title: string, dueDate: string | null) => ({ title, dueDate });
const today = "2026-11-23";

describe("splitByTab", () => {
  it("puts overdue and today's tasks in Nu, keeping the input order", () => {
    const s = splitByTab([t("a", "2026-11-20"), t("b", "2026-11-22"), t("c", "2026-11-23")], today);
    expect(s.nu.map((i) => i.title)).toEqual(["a", "b", "c"]);
  });

  it("gives tomorrow and the next two days a tab each", () => {
    const s = splitByTab([t("a", "2026-11-24"), t("b", "2026-11-25"), t("c", "2026-11-26")], today);
    expect([s.d1, s.d2, s.d3].map((l) => l.map((i) => i.title))).toEqual([["a"], ["b"], ["c"]]);
    expect(s.nu).toEqual([]);
    expect(s.senare).toEqual([]);
  });

  it("puts everything later, then undated, in Senare", () => {
    const s = splitByTab([t("a", "2026-11-27"), t("b", "2027-01-01"), t("c", null)], today);
    expect(s.senare.map((i) => i.title)).toEqual(["a", "b", "c"]);
  });

  it("counts days across a year boundary", () => {
    const s = splitByTab([t("a", "2027-01-01"), t("b", "2027-01-02")], "2026-12-31");
    expect(s.d1).toHaveLength(1);
    expect(s.d2).toHaveLength(1);
  });
});

describe("boardTabs", () => {
  const tabs = boardTabs(today, { nu: 4, d1: 1, d2: 0, d3: 0, senare: 2 }, true);

  it("names the tabs as agreed", () => {
    expect(tabs.map((x) => x.name)).toEqual(["Nu", "Imorgon", "Ons 25", "Tor 26", "Senare"]);
    expect(tabs.map((x) => x.key)).toEqual(["nu", "imorgon", "d2", "d3", "senare"]);
  });

  it("reads each tab aloud with its count", () => {
    expect(tabs.map((x) => x.ariaLabel)).toEqual([
      "Nu, 4 uppgifter",
      "Imorgon, 1 uppgift",
      "Onsdag 25 november, inga uppgifter",
      "Torsdag 26 november, inga uppgifter",
      "Senare, 2 uppgifter",
    ]);
  });

  it("marks Nu overdue only while something in it is", () => {
    expect(tabs[0]!.overdue).toBe(true);
    expect(boardTabs(today, { nu: 1, d1: 0, d2: 0, d3: 0, senare: 0 }, false)[0]!.overdue).toBe(false);
  });
});

describe("parseTab", () => {
  it("opens on Nu unless a known tab is asked for", () => {
    expect(parseTab(undefined)).toBe("nu");
    expect(parseTab("bogus")).toBe("nu");
    expect(parseTab("senare")).toBe("senare");
    expect(parseTab("d2")).toBe("d2");
  });
});

describe("boardQuery", () => {
  it("is empty with no filter on Nu", () => {
    expect(boardQuery({ place: "", vem: "", tab: "nu" })).toBe("");
  });
  it("keeps the filter and the tab", () => {
    expect(boardQuery({ place: "room:r1", vem: "mine", tab: "senare" })).toBe("rum=r1&vem=mine&flik=senare");
    expect(boardQuery({ place: "floor:f1", vem: "", tab: "nu" })).toBe("plan=f1");
  });
});

describe("activeFilters", () => {
  it("lists nothing when nothing is on", () => {
    expect(activeFilters({ place: "", vem: "" }, { place: () => "", vem: () => "" })).toEqual([]);
  });
  it("lists the room and the person by the words the panel shows", () => {
    const names = { place: () => "Kök", vem: () => "Mina" };
    expect(activeFilters({ place: "room:r1", vem: "mine" }, names)).toEqual([
      { kind: "place", text: "Kök" },
      { kind: "vem", text: "Mina" },
    ]);
  });
});
