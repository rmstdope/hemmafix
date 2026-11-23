import { describe, expect, it } from "vitest";
import {
  applyItemChange,
  clearedNotice,
  countLabel,
  LIST_ORDERS,
  orderButtonLabel,
  orderMenuLabel,
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
  it("counts what is left", () => {
    expect(countLabel(4, 6)).toBe("4 kvar");
    expect(countLabel(0, 3)).toBe("Allt klart");
    expect(countLabel(0, 0)).toBe("Tom");
  });
  it("names the order on the button and in the menu", () => {
    expect(LIST_ORDERS).toEqual(["alfabetiskt", "andrad", "skapad"]);
    expect(LIST_ORDERS.map(orderButtonLabel)).toEqual(["⇅ A–Ö", "⇅ Ändrad", "⇅ Skapad"]);
    expect(LIST_ORDERS.map(orderMenuLabel)).toEqual(["Alfabetiskt", "Senast ändrad", "Senast skapad"]);
  });
  it("says how many were cleared", () => {
    expect(clearedNotice(1)).toBe("Rensade 1 sak");
    expect(clearedNotice(3)).toBe("Rensade 3 saker");
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
