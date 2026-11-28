import { describe, expect, it } from "vitest";
import {
  applyItemChange,
  LIST_ORDERS,
  orderMenuLabel,
  privacyLine,
  shareChoices,
  sortLists,
  type ItemView,
} from "./lists";

const list = (name: string, createdAt: string, updatedAt = createdAt) => ({
  id: name,
  name,
  createdAt: new Date(createdAt),
  updatedAt: new Date(updatedAt),
});

describe("sortLists", () => {
  const lists = [
    list("Ö-lista", "2026-01-01"),
    list("Zebra", "2026-01-02", "2026-03-01"),
    list("Ägg", "2026-01-03"),
    list("Åka", "2026-01-04", "2026-02-01"),
    list("anka", "2026-01-05"),
  ];
  it("puts Å, Ä and Ö last in Swedish order, ignoring case", () => {
    expect(sortLists(lists, "alfabetiskt").map((l) => l.name)).toEqual(["anka", "Zebra", "Åka", "Ägg", "Ö-lista"]);
  });
  it("puts the list changed most recently first", () => {
    expect(sortLists(lists, "andrad").map((l) => l.name).slice(0, 2)).toEqual(["Zebra", "Åka"]);
  });
  it("puts the newest list first", () => {
    expect(sortLists(lists, "skapad").map((l) => l.name)[0]).toBe("anka");
  });
  it("does not change the list it is given", () => {
    const copy = [...lists];
    sortLists(lists, "skapad");
    expect(lists).toEqual(copy);
  });
});

describe("words", () => {
  it("names the orders in the menu", () => {
    expect(LIST_ORDERS).toEqual(["alfabetiskt", "andrad", "skapad"]);
    expect(LIST_ORDERS.map(orderMenuLabel)).toEqual(["Alfabetiskt", "Senast ändrad", "Senast skapad"]);
  });
});

describe("applyItemChange", () => {
  const item = (id: string, rank: number, done = false): ItemView => ({
    id,
    text: id,
    rank,
    doneAt: done ? new Date("2026-01-01") : null,
  });
  const items = [item("a", 1), item("b", 2), item("c", 3, true)];
  const ids = (xs: ItemView[]) => xs.map((i) => i.id);

  it("adds first among the open items", () => {
    const next = applyItemChange(items, { type: "add", id: "d", text: "d" });
    expect(ids(next.filter((i) => !i.doneAt).sort((x, y) => y.rank - x.rank))).toEqual(["d", "b", "a"]);
  });
  it("ticks into Klart and unticks to the top", () => {
    const ticked = applyItemChange(items, { type: "done", id: "b", done: true });
    expect(ticked.find((i) => i.id === "b")!.doneAt).not.toBeNull();
    const unticked = applyItemChange(items, { type: "done", id: "c", done: false });
    const c = unticked.find((i) => i.id === "c")!;
    expect(c.doneAt).toBeNull();
    expect(c.rank).toBeGreaterThan(2);
  });
  it("edits, removes, restores and clears", () => {
    expect(applyItemChange(items, { type: "edit", id: "a", text: "x" }).find((i) => i.id === "a")!.text).toBe("x");
    expect(ids(applyItemChange(items, { type: "remove", id: "a" }))).toEqual(["b", "c"]);
    expect(ids(applyItemChange(items, { type: "restore", items: [item("z", 9)] }))).toContain("z");
    expect(ids(applyItemChange(items, { type: "clear" }))).toEqual(["a", "b"]);
  });
});

describe("privacyLine", () => {
  const p = (id: string, name: string) => ({ id, name });
  const henrik = p("h", "Henrik Kurelid");
  const sara = p("s", "Sara Kurelid");
  const anna = p("a", "Anna");
  const kalle = p("k", "Kalle");

  it("names you as du, first when the list is yours", () => {
    expect(privacyLine("h", henrik, [])).toBe("Privat · bara du");
    expect(privacyLine("h", henrik, [sara])).toBe("Privat · du och Sara");
    expect(privacyLine("h", henrik, [sara, kalle, anna])).toBe("Privat · du, Anna, Kalle och Sara");
  });

  it("puts the creator first, then du, then the others A–Ö when it is shared with you", () => {
    expect(privacyLine("s", henrik, [sara])).toBe("Privat · Henrik och du");
    expect(privacyLine("s", henrik, [sara, p("o", "Östen"), anna])).toBe("Privat · Henrik, du, Anna och Östen");
  });

  it("starts with du when the creator is gone", () => {
    expect(privacyLine("s", null, [sara, anna])).toBe("Privat · du och Anna");
  });
});

describe("shareChoices", () => {
  it("is everyone but you, A–Ö by first name in Swedish", () => {
    const members = ["Örjan Ek", "Me Myself", "Åsa Al", "Zackarias", "Anna"].map((name) => ({ id: name, name }));
    expect(shareChoices(members, "Me Myself").map((m) => m.name)).toEqual(["Anna", "Zackarias", "Åsa Al", "Örjan Ek"]);
  });
});
