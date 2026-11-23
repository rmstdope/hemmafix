import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { household, membership } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { createFamily } from "../../test/integration/factories";
import {
  addItem,
  clearDone,
  createList,
  deleteList,
  editItem,
  getList,
  listLists,
  getListOrder,
  removeItem,
  renameList,
  restoreItems,
  setItemDone,
  setListOrder,
} from "./lists";

let f: Awaited<ReturnType<typeof createFamily>>;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
});

const add = async (listId: string, text: string, actor = f.adult) => {
  const id = randomUUID();
  await addItem(actor, listId, id, text);
  return id;
};
const open = async (listId: string) =>
  (await getList(f.adult, listId))!.items.filter((i) => !i.doneAt).sort((a, b) => b.rank - a.rank).map((i) => i.text);
const done = async (listId: string) =>
  (await getList(f.adult, listId))!.items.filter((i) => i.doneAt).map((i) => i.text);
const changedAt = async (listId: string) => (await getList(f.adult, listId))!.updatedAt.getTime();
const tick = () => new Promise((r) => setTimeout(r, 15));

describe("lists", () => {
  it("are made, renamed and removed by anyone in the home, adult or child", async () => {
    const { id } = await createList(f.child, "  Inköp ");
    expect((await getList(f.adult, id))!.name).toBe("Inköp");
    await renameList(f.child, id, "Matinköp");
    expect((await listLists(f.adult)).map((l) => l.name)).toEqual(["Matinköp"]);
    await deleteList(f.child, id);
    expect(await getList(f.adult, id)).toBeNull();
  });

  it("may share a name, and take 200 characters but not 201", async () => {
    await createList(f.adult, "Inköp");
    await createList(f.adult, "Inköp");
    await createList(f.adult, "x".repeat(200));
    await expect(createList(f.adult, "x".repeat(201))).rejects.toThrow();
    await expect(createList(f.adult, "   ")).rejects.toThrow();
    expect(await listLists(f.adult)).toHaveLength(3);
  });

  it("count what is left, and everything, per list", async () => {
    const { id } = await createList(f.adult, "Inköp");
    const a = await add(id, "Mjölk");
    await add(id, "Bröd");
    await setItemDone(f.adult, id, a, true);
    expect(await listLists(f.adult)).toMatchObject([{ name: "Inköp", openCount: 1, totalCount: 2 }]);
  });

  it("belong to the home: another home sees none, and cannot touch any", async () => {
    const { id } = await createList(f.adult, "Inköp");
    const item = await add(id, "Mjölk");
    expect(await listLists(f.neighbour)).toEqual([]);
    expect(await getList(f.neighbour, id)).toBeNull();
    for (const attempt of [
      () => renameList(f.neighbour, id, "Mitt"),
      () => addItem(f.neighbour, id, randomUUID(), "Skräp"),
      () => editItem(f.neighbour, id, item, "Skräp"),
      () => setItemDone(f.neighbour, id, item, true),
      () => removeItem(f.neighbour, id, item),
      () => clearDone(f.neighbour, id),
      () => restoreItems(f.neighbour, id, []),
    ]) {
      await expect(attempt()).rejects.toThrow("Listan finns inte längre.");
    }
    await deleteList(f.neighbour, id);
    expect(await open(id)).toEqual(["Mjölk"]);
  });

  it("answer a list that never existed with the notice for a gone list", async () => {
    await expect(addItem(f.adult, "nope", randomUUID(), "x")).rejects.toThrow("Listan finns inte längre.");
    await expect(renameList(f.adult, randomUUID(), "x")).rejects.toBeInstanceOf(UserError);
    expect(await getList(f.adult, "nope")).toBeNull();
  });
});

describe("items", () => {
  it("add first among the open ones, each by anyone, and refuse empty or too long text", async () => {
    const { id } = await createList(f.adult, "Inköp");
    await add(id, "Mjölk");
    await add(id, "  Bröd ", f.child);
    await add(id, "Mjölk");
    expect(await open(id)).toEqual(["Mjölk", "Bröd", "Mjölk"]);
    await expect(addItem(f.adult, id, randomUUID(), "  ")).rejects.toThrow();
    await expect(addItem(f.adult, id, randomUUID(), "x".repeat(201))).rejects.toThrow();
    expect(await open(id)).toHaveLength(3);
  });

  it("adding the same id twice adds one", async () => {
    const { id } = await createList(f.adult, "Inköp");
    const item = randomUUID();
    await addItem(f.adult, id, item, "Mjölk");
    await addItem(f.adult, id, item, "Mjölk");
    expect(await open(id)).toEqual(["Mjölk"]);
  });

  it("move to Klart when ticked and back to the top when unticked", async () => {
    const { id } = await createList(f.adult, "Inköp");
    const milk = await add(id, "Mjölk");
    await add(id, "Bröd");
    await add(id, "Ägg");
    await setItemDone(f.child, id, milk, true);
    expect(await open(id)).toEqual(["Ägg", "Bröd"]);
    expect(await done(id)).toEqual(["Mjölk"]);
    await setItemDone(f.child, id, milk, false);
    expect(await open(id)).toEqual(["Mjölk", "Ägg", "Bröd"]);
  });

  it("are edited in place, an empty text being refused", async () => {
    const { id } = await createList(f.adult, "Inköp");
    const milk = await add(id, "Mjölk");
    await add(id, "Bröd");
    await editItem(f.child, id, milk, " Mjölk laktosfri ");
    expect(await open(id)).toEqual(["Bröd", "Mjölk laktosfri"]);
    await expect(editItem(f.adult, id, milk, " ")).rejects.toThrow();
    expect(await open(id)).toEqual(["Bröd", "Mjölk laktosfri"]);
  });

  it("are removed, and put back where they were by restore", async () => {
    const { id } = await createList(f.adult, "Inköp");
    await add(id, "Kaffe");
    const bread = await add(id, "Bröd");
    await add(id, "Ägg");
    const before = (await getList(f.adult, id))!.items.find((i) => i.id === bread)!;
    await removeItem(f.child, id, bread);
    expect(await open(id)).toEqual(["Ägg", "Kaffe"]);
    await restoreItems(f.child, id, [before]);
    expect(await open(id)).toEqual(["Ägg", "Bröd", "Kaffe"]);
  });

  it("clear Klart in one go, and restore puts the ticked ones back", async () => {
    const { id } = await createList(f.adult, "Inköp");
    const a = await add(id, "Mjölk");
    const b = await add(id, "Bröd");
    await add(id, "Ägg");
    await setItemDone(f.adult, id, a, true);
    await setItemDone(f.adult, id, b, true);
    const cleared = (await getList(f.adult, id))!.items.filter((i) => i.doneAt);
    expect(await clearDone(f.adult, id)).toBe(2);
    expect(await done(id)).toEqual([]);
    expect(await open(id)).toEqual(["Ägg"]);
    await restoreItems(f.adult, id, cleared);
    expect((await done(id)).sort()).toEqual(["Bröd", "Mjölk"]);
  });

  it("refuse an item of another list, and say the item is gone for one that is", async () => {
    const { id } = await createList(f.adult, "Inköp");
    const other = await createList(f.adult, "Packning");
    const item = await add(id, "Mjölk");
    await expect(editItem(f.adult, other.id, item, "x")).rejects.toThrow("Saken finns inte längre.");
    await removeItem(f.adult, id, item);
    await expect(setItemDone(f.adult, id, item, true)).rejects.toThrow("Saken finns inte längre.");
    await expect(editItem(f.adult, id, "nope", "x")).rejects.toThrow("Saken finns inte längre.");
    // Removing what is already gone is not a mistake.
    await removeItem(f.adult, id, item);
  });
});

describe("last changed", () => {
  it("moves with every kind of change to a list", async () => {
    const { id } = await createList(f.adult, "Inköp");
    let last = await changedAt(id);
    const item = await add(id, "Mjölk");
    const steps: [string, () => Promise<unknown>][] = [
      ["add", () => add(id, "Bröd")],
      ["edit", () => editItem(f.adult, id, item, "Mjölk 3 dl")],
      ["tick", () => setItemDone(f.adult, id, item, true)],
      ["untick", () => setItemDone(f.adult, id, item, false)],
      ["remove", () => removeItem(f.adult, id, item)],
      ["clear", async () => {
        const b = await add(id, "Ägg");
        await setItemDone(f.adult, id, b, true);
        await tick();
        await clearDone(f.adult, id);
      }],
      ["rename", () => renameList(f.adult, id, "Matinköp")],
    ];
    for (const [name, step] of steps) {
      await tick();
      await step();
      const now = await changedAt(id);
      expect(now, name).toBeGreaterThan(last);
      last = now;
    }
  });

  it("moves with a restore as well", async () => {
    const { id } = await createList(f.adult, "Inköp");
    const item = await add(id, "Mjölk");
    const before = (await getList(f.adult, id))!.items;
    await removeItem(f.adult, id, item);
    const afterRemove = await changedAt(id);
    await tick();
    await restoreItems(f.adult, id, before);
    expect(await changedAt(id)).toBeGreaterThan(afterRemove);
  });
});

describe("sort order", () => {
  it("is each member's own, starts alphabetical and is kept", async () => {
    expect(await getListOrder(f.adult)).toBe("alfabetiskt");
    await setListOrder(f.adult, "skapad");
    expect(await getListOrder(f.adult)).toBe("skapad");
    expect(await getListOrder(f.child)).toBe("alfabetiskt");
    await setListOrder(f.child, "andrad");
    expect(await getListOrder(f.adult)).toBe("skapad");
  });

  it("refuses an order that does not exist", async () => {
    await expect(setListOrder(f.adult, "slump" as never)).rejects.toThrow();
    expect((await db.select().from(membership).where(eq(membership.userId, f.adult.userId)))[0]!.listOrder).toBeNull();
  });
});
