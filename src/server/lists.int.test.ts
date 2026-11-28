import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { household, list, membership, user } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { createFamily, createUser } from "../../test/integration/factories";
import {
  addItem,
  clearDone,
  createList,
  deleteList,
  editItem,
  getList,
  listLists,
  getListOrder,
  lostListName,
  removeItem,
  renameList,
  restoreItems,
  setItemDone,
  setListOrder,
  setListSharing,
} from "./lists";
import type { Actor } from "./household";

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
      () => clearDone(f.neighbour, id, []),
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
    expect(await clearDone(f.adult, id, cleared.map((i) => i.id))).toBe(2);
    expect(await done(id)).toEqual([]);
    expect(await open(id)).toEqual(["Ägg"]);
    await restoreItems(f.adult, id, cleared);
    expect((await done(id)).sort()).toEqual(["Bröd", "Mjölk"]);
  });

  it("clear only the ticked items asked for, so one ticked meanwhile is not lost", async () => {
    const { id } = await createList(f.adult, "Inköp");
    const a = await add(id, "Mjölk");
    const b = await add(id, "Bröd");
    const open = await add(id, "Ägg");
    await setItemDone(f.adult, id, a, true);
    await setItemDone(f.adult, id, b, true);
    expect(await clearDone(f.adult, id, [a, open])).toBe(1);
    expect(await done(id)).toEqual(["Bröd"]);
    expect(await getList(f.adult, id).then((l) => l!.items.length)).toBe(2);
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
        await clearDone(f.adult, id, [b]);
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

/** A second adult and child in the home: Cia and Dan. */
async function moreFamily() {
  const [cia, dan] = [await createUser("Cia"), await createUser("Dan")];
  await db.insert(membership).values([
    { userId: cia.id, householdId: f.homeId, role: "adult" },
    { userId: dan.id, householdId: f.homeId, role: "child" },
  ]);
  return {
    cia: { userId: cia.id, householdId: f.homeId, role: "adult" } as const,
    dan: { userId: dan.id, householdId: f.homeId, role: "child" } as const,
  };
}
const only = (...users: { userId: string }[]) => ({ isPrivate: true, shareWith: users.map((u) => u.userId) });
const everyone = { isPrivate: false, shareWith: [] };
const names = async (actor: Actor) => (await listLists(actor)).map((l) => l.name).sort();
const unowned = async (name: string) =>
  (await db.insert(list).values({ householdId: f.homeId, name }).returning())[0]!.id;

describe("private lists", () => {
  it("are seen by their creator and the people they are shared with only, adults left out too", async () => {
    const { cia, dan } = await moreFamily();
    const { id } = await createList(f.child, "Julklappar", only(dan));
    await add(id, "Halsduk", f.child);
    await createList(f.adult, "Inköp");

    expect(await names(f.child)).toEqual(["Inköp", "Julklappar"]);
    expect(await names(dan)).toEqual(["Inköp", "Julklappar"]);
    expect(await getList(dan, id)).toMatchObject({ name: "Julklappar", items: [{ text: "Halsduk" }] });
    for (const outsider of [f.adult, cia, f.neighbour]) {
      expect((await names(outsider)).includes("Julklappar")).toBe(false);
      expect(await getList(outsider, id)).toBeNull();
    }
  });

  it("say who sees them, and what the person may do", async () => {
    const { id } = await createList(f.child, "Julklappar", only(f.adult));
    expect((await listLists(f.child))[0]!.privacy).toBe("Privat · du och Anna");
    expect(await getList(f.adult, id)).toMatchObject({
      privacy: "Privat · Bo och du",
      canChangeSharing: false,
      canDelete: false,
    });
    expect(await getList(f.child, id)).toMatchObject({
      sharing: { isPrivate: true, shareWith: [f.adult.userId] },
      canChangeSharing: true,
      canDelete: true,
    });
    const open = await createList(f.adult, "Inköp");
    expect(await getList(f.child, open.id)).toMatchObject({ privacy: null, canChangeSharing: false, canDelete: true });
  });

  it("are public when nothing is said, and ignore picks for a public list", async () => {
    const a = await createList(f.adult, "A");
    const b = await createList(f.adult, "B", { isPrivate: false, shareWith: [f.child.userId] });
    for (const { id } of [a, b]) {
      expect((await getList(f.child, id))!.sharing).toEqual(everyone);
    }
  });

  it("refuse every change from someone who does not see them, as for a list that is gone", async () => {
    const { id } = await createList(f.adult, "Hemligt");
    const item = await add(id, "Mjölk");
    await setListSharing(f.adult, id, only());
    for (const attempt of [
      () => renameList(f.child, id, "Mitt"),
      () => addItem(f.child, id, randomUUID(), "Skräp"),
      () => editItem(f.child, id, item, "Skräp"),
      () => setItemDone(f.child, id, item, true),
      () => removeItem(f.child, id, item),
      () => clearDone(f.child, id, [item]),
      () => restoreItems(f.child, id, []),
      () => setListSharing(f.child, id, everyone),
    ]) {
      await expect(attempt()).rejects.toThrow("Listan finns inte längre.");
    }
    await deleteList(f.child, id);
    expect(await getList(f.adult, id)).toMatchObject({ name: "Hemligt", items: [{ text: "Mjölk" }] });
  });

  it("let a person they are shared with work on the contents, but not remove them or change who sees them", async () => {
    const { id } = await createList(f.adult, "Julklappar", only(f.child));
    const item = await add(id, "Halsduk", f.child);
    await editItem(f.child, id, item, "Mössa");
    await setItemDone(f.child, id, item, true);
    await clearDone(f.child, id, [item]);
    await renameList(f.child, id, "Klappar");
    await expect(deleteList(f.child, id)).rejects.toThrow("Bara den som gjort listan kan ta bort den.");
    await expect(setListSharing(f.child, id, everyone)).rejects.toThrow(
      "Bara den som gjort listan kan ändra vem som ser den.",
    );
    expect(await getList(f.adult, id)).toMatchObject({ name: "Klappar", sharing: only(f.child) });
    await deleteList(f.adult, id);
    expect(await getList(f.adult, id)).toBeNull();
  });

  it("are shared, unshared, made public and private again by their creator, without moving in Senast ändrad", async () => {
    const { cia } = await moreFamily();
    const { id } = await createList(f.child, "Kalas");
    const before = await changedAt(id);
    await tick();
    await setListSharing(f.child, id, only(f.adult, f.child));
    expect((await getList(f.child, id))!.sharing).toEqual(only(f.adult));
    expect(await getList(cia, id)).toBeNull();
    await setListSharing(f.child, id, only(cia));
    expect(await getList(f.adult, id)).toBeNull();
    await setListSharing(f.child, id, everyone);
    expect(await getList(f.adult, id)).toMatchObject({ sharing: everyone, canChangeSharing: false });
    await setListSharing(f.child, id, only());
    expect(await getList(cia, id)).toBeNull();
    expect((await getList(f.child, id))!.updatedAt.getTime()).toBe(before);
  });

  it("cannot be shared with someone outside the home", async () => {
    await expect(createList(f.adult, "A", only(f.neighbour))).rejects.toThrow("Personen finns inte i hemmet");
    expect(await listLists(f.adult)).toEqual([]);
    const { id } = await createList(f.adult, "B", only(f.child));
    await expect(setListSharing(f.adult, id, only(f.neighbour))).rejects.toThrow("Personen finns inte i hemmet");
    expect((await getList(f.adult, id))!.sharing).toEqual(only(f.child));
  });

  it("without a recorded creator are public, and the adult who makes one private becomes its creator", async () => {
    const { cia } = await moreFamily();
    const id = await unowned("Gammal");
    expect(await getList(f.child, id)).toMatchObject({ privacy: null, canChangeSharing: false });
    await expect(setListSharing(f.child, id, only())).rejects.toThrow("ändra vem som ser den");
    // Saving it as public claims nothing.
    await setListSharing(f.adult, id, everyone);
    expect(await getList(cia, id)).toMatchObject({ canChangeSharing: true });
    await setListSharing(f.adult, id, only(f.child));
    expect(await getList(cia, id)).toBeNull();
    await setListSharing(f.adult, id, everyone);
    expect(await getList(cia, id)).toMatchObject({ canChangeSharing: false });
  });

  it("tell the name only to someone who has lost sight of them, as it was then", async () => {
    const { cia } = await moreFamily();
    const { id } = await createList(f.adult, "Julklappar", only(f.child));
    // Never saw it: nothing to tell.
    expect(await lostListName(cia, id)).toBeNull();
    expect(await lostListName(f.child, id)).toBeNull();
    await setListSharing(f.adult, id, only());
    await renameList(f.adult, id, "Cykel till Bo");
    expect(await lostListName(f.child, id)).toBe("Julklappar");
    expect(await lostListName(cia, id)).toBeNull();
    // Sharing again takes the notice away; losing it again brings the name of that day.
    await setListSharing(f.adult, id, only(f.child));
    expect(await lostListName(f.child, id)).toBeNull();
    await setListSharing(f.adult, id, only());
    expect(await lostListName(f.child, id)).toBe("Cykel till Bo");
    await setListSharing(f.adult, id, everyone);
    expect(await lostListName(f.child, id)).toBeNull();
    // Public to private takes it from everyone else.
    await setListSharing(f.adult, id, only());
    expect(await lostListName(cia, id)).toBe("Cykel till Bo");
    expect(await lostListName(f.neighbour, id)).toBeNull();
    expect(await lostListName(f.child, "nonsens")).toBeNull();
    await deleteList(f.adult, id);
    expect(await lostListName(cia, id)).toBeNull();
  });

  it("stay hidden from the others when their creator is gone", async () => {
    const { cia } = await moreFamily();
    const { id } = await createList(cia, "Ensam", only(f.child));
    await db.delete(user).where(eq(user.id, cia.userId));
    expect(await getList(f.adult, id)).toBeNull();
    expect(await getList(f.child, id)).toMatchObject({ privacy: "Privat · bara du", canDelete: false });
  });
});
