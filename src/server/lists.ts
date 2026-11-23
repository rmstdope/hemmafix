import "server-only";
import { and, count, desc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { list, listItem, membership } from "@/db/schema";
import { UserError } from "@/lib/errors";
import type { ItemView, ListOrder } from "@/lib/lists";
import { assertCan } from "@/lib/permissions";
import { listId, listItemId, listItemText, listName, listOrder, restoredItems } from "@/lib/validation";
import type { Tx } from "./chores";
import type { Actor } from "./household";

const LIST_GONE = "Listan finns inte längre.";
const ITEM_GONE = "Saken finns inte längre.";

export type ListSummary = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  openCount: number;
  totalCount: number;
};
export type ListView = { id: string; name: string; updatedAt: Date; items: ItemView[] };

/** The list's row, locked so its items change one request at a time; a list outside the home is gone. */
async function lockList(tx: Tx, actor: Actor, id: string) {
  const parsed = listId.safeParse(id);
  if (!parsed.success) throw new UserError(LIST_GONE);
  const [found] = await tx
    .select({ id: list.id })
    .from(list)
    .where(and(eq(list.id, parsed.data), eq(list.householdId, actor.householdId)))
    .for("update");
  if (!found) throw new UserError(LIST_GONE);
  return found.id;
}

/** "Last changed" for the Senast ändrad order. */
const touch = (tx: Tx, id: string) =>
  tx.update(list).set({ updatedAt: sql`clock_timestamp()` }).where(eq(list.id, id));

/** Runs a change to one list in one transaction: checks the right, locks the list, marks it changed. */
async function change<T>(actor: Actor, id: string, fn: (tx: Tx, listId: string) => Promise<T>): Promise<T> {
  assertCan(actor, "list:edit");
  return db.transaction(async (tx) => {
    const target = await lockList(tx, actor, id);
    const result = await fn(tx, target);
    await touch(tx, target);
    return result;
  });
}

async function lockItem(tx: Tx, target: string, itemId: string) {
  const parsed = listItemId.safeParse(itemId);
  const [found] = parsed.success
    ? await tx
        .select({ id: listItem.id, doneAt: listItem.doneAt })
        .from(listItem)
        .where(and(eq(listItem.id, parsed.data), eq(listItem.listId, target)))
    : [];
  if (!found) throw new UserError(ITEM_GONE);
  return found;
}

const nextRank = async (tx: Tx, target: string) => {
  const [row] = await tx
    .select({ top: sql<number>`coalesce(max(${listItem.rank}), 0)::int` })
    .from(listItem)
    .where(eq(listItem.listId, target));
  return row!.top + 1;
};

/** The home's lists with how many items are left; the page sorts them for the person. */
export async function listLists(actor: Actor): Promise<ListSummary[]> {
  assertCan(actor, "list:edit");
  return db
    .select({
      id: list.id,
      name: list.name,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      openCount: sql<number>`count(${listItem.id}) filter (where ${listItem.doneAt} is null)::int`,
      totalCount: count(listItem.id),
    })
    .from(list)
    .leftJoin(listItem, eq(listItem.listId, list.id))
    .where(eq(list.householdId, actor.householdId))
    .groupBy(list.id);
}

/** One list with its items, highest rank first; null when it does not exist in this home. */
export async function getList(actor: Actor, id: string): Promise<ListView | null> {
  assertCan(actor, "list:edit");
  const parsed = listId.safeParse(id);
  if (!parsed.success) return null;
  return db.transaction(async (tx) => {
    const [found] = await tx
      .select({ id: list.id, name: list.name, updatedAt: list.updatedAt })
      .from(list)
      .where(and(eq(list.id, parsed.data), eq(list.householdId, actor.householdId)));
    if (!found) return null;
    const items = await tx
      .select({ id: listItem.id, text: listItem.text, rank: listItem.rank, doneAt: listItem.doneAt })
      .from(listItem)
      .where(eq(listItem.listId, found.id))
      .orderBy(desc(listItem.rank));
    return { ...found, items };
  });
}

export async function createList(actor: Actor, name: string): Promise<{ id: string }> {
  assertCan(actor, "list:edit");
  const [created] = await db
    .insert(list)
    .values({ householdId: actor.householdId, name: listName.parse(name) })
    .returning({ id: list.id });
  return created!;
}

export async function renameList(actor: Actor, id: string, name: string) {
  const value = listName.parse(name);
  await change(actor, id, (tx, target) => tx.update(list).set({ name: value }).where(eq(list.id, target)));
}

/** Removes the list and everything on it; one that is already gone is not a mistake. */
export async function deleteList(actor: Actor, id: string) {
  assertCan(actor, "list:edit");
  const parsed = listId.safeParse(id);
  if (!parsed.success) return;
  await db.delete(list).where(and(eq(list.id, parsed.data), eq(list.householdId, actor.householdId)));
}

/** Adds an item first among the open ones. The caller picks the id, so a retry adds it once. */
export async function addItem(actor: Actor, id: string, itemId: string, text: string) {
  const value = listItemText.parse(text);
  const newId = listItemId.parse(itemId);
  await change(actor, id, async (tx, target) => {
    await tx
      .insert(listItem)
      .values({ id: newId, listId: target, text: value, rank: await nextRank(tx, target) })
      .onConflictDoNothing();
  });
}

export async function editItem(actor: Actor, id: string, itemId: string, text: string) {
  const value = listItemText.parse(text);
  await change(actor, id, async (tx, target) => {
    const item = await lockItem(tx, target, itemId);
    await tx.update(listItem).set({ text: value }).where(eq(listItem.id, item.id));
  });
}

/** Ticks an item into Klart, or unticks it back to the top of the open items. */
export async function setItemDone(actor: Actor, id: string, itemId: string, done: boolean) {
  await change(actor, id, async (tx, target) => {
    const item = await lockItem(tx, target, itemId);
    if (done === Boolean(item.doneAt)) return;
    await tx
      .update(listItem)
      .set(done ? { doneAt: new Date() } : { doneAt: null, rank: await nextRank(tx, target) })
      .where(eq(listItem.id, item.id));
  });
}

export async function removeItem(actor: Actor, id: string, itemId: string) {
  const parsed = listItemId.safeParse(itemId);
  await change(actor, id, async (tx, target) => {
    if (parsed.success) await tx.delete(listItem).where(and(eq(listItem.id, parsed.data), eq(listItem.listId, target)));
  });
}

/** Removes every ticked item; resolves with how many went. */
export async function clearDone(actor: Actor, id: string): Promise<number> {
  return change(actor, id, async (tx, target) => {
    const gone = await tx
      .delete(listItem)
      .where(and(eq(listItem.listId, target), sql`${listItem.doneAt} is not null`))
      .returning({ id: listItem.id });
    return gone.length;
  });
}

/** Puts back what × or Rensa removed, each item where it was (same id, rank and tick). */
export async function restoreItems(actor: Actor, id: string, items: ItemView[]) {
  const values = restoredItems.parse(items);
  await change(actor, id, async (tx, target) => {
    if (values.length > 0) {
      await tx
        .insert(listItem)
        .values(values.map((i) => ({ ...i, listId: target })))
        .onConflictDoNothing();
    }
  });
}

/** The person's own sort order for Listor; alphabetical until they choose. */
export async function getListOrder(actor: Actor): Promise<ListOrder> {
  const [row] = await db
    .select({ order: membership.listOrder })
    .from(membership)
    .where(and(eq(membership.userId, actor.userId), eq(membership.householdId, actor.householdId)));
  const parsed = listOrder.safeParse(row?.order);
  return parsed.success ? parsed.data : "alfabetiskt";
}

export async function setListOrder(actor: Actor, order: ListOrder) {
  const value = listOrder.parse(order);
  await db
    .update(membership)
    .set({ listOrder: value })
    .where(and(eq(membership.userId, actor.userId), eq(membership.householdId, actor.householdId)));
}
