import "server-only";
import { and, count, desc, eq, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { list, listItem, listLostAccess, listShare, membership, user } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { privacyLine, shareChoices, type ItemView, type ListOrder, type ListSharing } from "@/lib/lists";
import {
  assertCan,
  canChangeListSharing,
  canDeleteList,
  canSeeList,
  ForbiddenError,
  type ListAccess,
} from "@/lib/permissions";
import {
  flag,
  listId,
  listItemId,
  listItemText,
  listName,
  listOrder,
  listSharing,
  restoredItems,
} from "@/lib/validation";
import type { Tx } from "./chores";
import type { Actor } from "./household";

const LIST_GONE = "Listan finns inte längre.";
const ITEM_GONE = "Saken finns inte längre.";
const NOT_YOURS_TO_SHARE = "Bara den som gjort listan kan ändra vem som ser den.";
const NOT_YOURS_TO_DELETE = "Bara den som gjort listan kan ta bort den.";

export type ListSummary = {
  id: string;
  name: string;
  createdAt: Date;
  updatedAt: Date;
  openCount: number;
  totalCount: number;
  /** Who sees a private list, in words; null for a public one. */
  privacy: string | null;
};
export type ListView = {
  id: string;
  name: string;
  updatedAt: Date;
  items: ItemView[];
  privacy: string | null;
  sharing: ListSharing;
  canChangeSharing: boolean;
  canDelete: boolean;
};

/** Reads that must agree with each other: who sees a list, and what is on it, at one moment. */
const snapshot = <T>(fn: (tx: Tx) => Promise<T>) =>
  db.transaction(fn, { isolationLevel: "repeatable read", accessMode: "read only" });

/** Whom the home's lists (or one of them) are shared with, by name; only people still in the home. */
const readShares = (tx: Tx, householdId: string, only?: string) =>
  tx
    .select({ listId: listShare.listId, id: user.id, name: user.name })
    .from(listShare)
    .innerJoin(list, eq(list.id, listShare.listId))
    .innerJoin(membership, and(eq(membership.userId, listShare.userId), eq(membership.householdId, list.householdId)))
    .innerJoin(user, eq(user.id, listShare.userId))
    .where(and(eq(list.householdId, householdId), only ? eq(list.id, only) : undefined));

type Shares = Awaited<ReturnType<typeof readShares>>;
type Stored = { id: string; isPrivate: boolean; creatorId: string | null; creatorName: string | null };

/** One stored list as `actor` meets it: whether they see it, and what its privacy line says. */
function accessOf(actor: Actor, row: Stored, shares: Shares) {
  const shared = shareChoices(shares.filter((s) => s.listId === row.id), row.creatorId ?? "");
  const access: ListAccess = { isPrivate: row.isPrivate, creatorId: row.creatorId, sharedWith: shared.map((s) => s.id) };
  const creator = row.creatorId ? { id: row.creatorId, name: row.creatorName ?? "" } : null;
  return {
    access,
    visible: canSeeList(actor, access),
    privacy: row.isPrivate ? privacyLine(actor.userId, creator, shared) : null,
  };
}

/** The list's row, locked so it changes one request at a time, with who sees it; null outside the home. */
async function lockRow(tx: Tx, actor: Actor, id: string) {
  const parsed = listId.safeParse(id);
  if (!parsed.success) return null;
  const [found] = await tx
    .select({ id: list.id, name: list.name, isPrivate: list.isPrivate, creatorId: list.creatorId })
    .from(list)
    .where(and(eq(list.id, parsed.data), eq(list.householdId, actor.householdId)))
    .for("update");
  if (!found) return null;
  // Read after the lock is ours, so a share just taken back is seen as taken back.
  const shares = await tx.select({ id: listShare.userId }).from(listShare).where(eq(listShare.listId, found.id));
  return { ...found, sharedWith: shares.map((s) => s.id) };
}

/** `lockRow` for someone who must see the list: one they do not see is gone to them. */
async function lockList(tx: Tx, actor: Actor, id: string) {
  const found = await lockRow(tx, actor, id);
  if (!found || !canSeeList(actor, found)) throw new UserError(LIST_GONE);
  return found;
}

/** "Last changed" for the Senast ändrad order. */
const touch = (tx: Tx, id: string) =>
  tx.update(list).set({ updatedAt: sql`clock_timestamp()` }).where(eq(list.id, id));

/** Runs a change to one list in one transaction: checks the right, locks the list, marks it changed. */
async function change<T>(actor: Actor, id: string, fn: (tx: Tx, listId: string) => Promise<T>): Promise<T> {
  assertCan(actor, "list:edit");
  return db.transaction(async (tx) => {
    const { id: target } = await lockList(tx, actor, id);
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

/** The lists the person sees, with how many items are left; the page sorts them. */
export async function listLists(actor: Actor): Promise<ListSummary[]> {
  assertCan(actor, "list:edit");
  return snapshot(async (tx) => {
    const rows = await tx
      .select({
        id: list.id,
        name: list.name,
        createdAt: list.createdAt,
        updatedAt: list.updatedAt,
        isPrivate: list.isPrivate,
        creatorId: list.creatorId,
        creatorName: user.name,
        openCount: sql<number>`count(${listItem.id}) filter (where ${listItem.doneAt} is null)::int`,
        totalCount: count(listItem.id),
      })
      .from(list)
      .leftJoin(listItem, eq(listItem.listId, list.id))
      .leftJoin(user, eq(user.id, list.creatorId))
      .where(eq(list.householdId, actor.householdId))
      .groupBy(list.id, user.id);
    const shares = await readShares(tx, actor.householdId);
    return rows.flatMap((row) => {
      const { visible, privacy } = accessOf(actor, row, shares);
      if (!visible) return [];
      const { id, name, createdAt, updatedAt, openCount, totalCount } = row;
      return [{ id, name, createdAt, updatedAt, openCount, totalCount, privacy }];
    });
  });
}

/** One list with its items, highest rank first; null when it is not in this home or not theirs to see. */
export async function getList(actor: Actor, id: string): Promise<ListView | null> {
  assertCan(actor, "list:edit");
  const parsed = listId.safeParse(id);
  if (!parsed.success) return null;
  return snapshot(async (tx) => {
    const [found] = await tx
      .select({
        id: list.id,
        name: list.name,
        updatedAt: list.updatedAt,
        isPrivate: list.isPrivate,
        creatorId: list.creatorId,
        creatorName: user.name,
      })
      .from(list)
      .leftJoin(user, eq(user.id, list.creatorId))
      .where(and(eq(list.id, parsed.data), eq(list.householdId, actor.householdId)));
    if (!found) return null;
    const { access, visible, privacy } = accessOf(actor, found, await readShares(tx, actor.householdId, found.id));
    if (!visible) return null;
    const items = await tx
      .select({ id: listItem.id, text: listItem.text, rank: listItem.rank, doneAt: listItem.doneAt })
      .from(listItem)
      .where(eq(listItem.listId, found.id))
      .orderBy(desc(listItem.rank));
    return {
      id: found.id,
      name: found.name,
      updatedAt: found.updatedAt,
      items,
      privacy,
      sharing: { isPrivate: access.isPrivate, shareWith: [...access.sharedWith] },
      canChangeSharing: canChangeListSharing(actor, access),
      canDelete: canDeleteList(actor, access),
    };
  });
}

const homeMembers = (tx: Tx, householdId: string) =>
  tx
    .select({ userId: membership.userId, role: membership.role })
    .from(membership)
    .where(eq(membership.householdId, householdId));

/** The picks to store: members of the home, once each, never the creator; none for a public list. */
function sharesToStore(
  sharing: ListSharing,
  members: Awaited<ReturnType<typeof homeMembers>>,
  creatorId: string | null,
): string[] {
  if (!sharing.isPrivate) return [];
  const picked = [...new Set(sharing.shareWith)];
  if (picked.some((id) => !members.some((m) => m.userId === id))) {
    throw new UserError("Personen finns inte i hemmet");
  }
  return picked.filter((id) => id !== creatorId);
}

const insertShares = async (tx: Tx, target: string, userIds: string[]) => {
  if (userIds.length > 0) await tx.insert(listShare).values(userIds.map((userId) => ({ listId: target, userId })));
};

export async function createList(
  actor: Actor,
  name: string,
  sharing: ListSharing = { isPrivate: false, shareWith: [] },
): Promise<{ id: string }> {
  assertCan(actor, "list:edit");
  const value = listName.parse(name);
  const wanted = listSharing.parse(sharing);
  return db.transaction(async (tx) => {
    const shares = sharesToStore(wanted, await homeMembers(tx, actor.householdId), actor.userId);
    const [created] = await tx
      .insert(list)
      .values({ householdId: actor.householdId, name: value, creatorId: actor.userId, isPrivate: wanted.isPrivate })
      .returning({ id: list.id });
    await insertShares(tx, created!.id, shares);
    return created!;
  });
}

/**
 * Changes whether a list is private and whom it is shared with. A list without a creator gets one
 * when it is made private. Remembers who lost sight of it, and forgets that for who sees it again.
 * Who sees a list is not a change to the list, so Senast ändrad does not move.
 */
export async function setListSharing(actor: Actor, id: string, sharing: ListSharing) {
  assertCan(actor, "list:edit");
  const wanted = listSharing.parse(sharing);
  await db.transaction(async (tx) => {
    const before = await lockList(tx, actor, id);
    if (!canChangeListSharing(actor, before)) throw new ForbiddenError(NOT_YOURS_TO_SHARE);
    const members = await homeMembers(tx, actor.householdId);
    const creatorId = before.creatorId ?? (wanted.isPrivate ? actor.userId : null);
    const sharedWith = sharesToStore(wanted, members, creatorId);
    const after: ListAccess = { isPrivate: wanted.isPrivate, creatorId, sharedWith };

    await tx
      .update(list)
      .set({ isPrivate: after.isPrivate, creatorId, updatedAt: sql`${list.updatedAt}` })
      .where(eq(list.id, before.id));
    await tx.delete(listShare).where(eq(listShare.listId, before.id));
    await insertShares(tx, before.id, sharedWith);

    const seeing = members.filter((m) => canSeeList(m, after)).map((m) => m.userId);
    if (seeing.length > 0) {
      await tx
        .delete(listLostAccess)
        .where(and(eq(listLostAccess.listId, before.id), inArray(listLostAccess.userId, seeing)));
    }
    const lost = members.filter((m) => canSeeList(m, before) && !canSeeList(m, after));
    if (lost.length > 0) {
      await tx
        .insert(listLostAccess)
        .values(lost.map((m) => ({ listId: before.id, userId: m.userId, name: before.name })))
        .onConflictDoUpdate({ target: [listLostAccess.listId, listLostAccess.userId], set: { name: before.name } });
    }
  });
}

/** What a list was called when the person lost sight of it; null when they never did. */
export async function lostListName(actor: Actor, id: string): Promise<string | null> {
  assertCan(actor, "list:edit");
  const parsed = listId.safeParse(id);
  if (!parsed.success) return null;
  const [found] = await db
    .select({ name: listLostAccess.name })
    .from(listLostAccess)
    .innerJoin(list, eq(list.id, listLostAccess.listId))
    .where(
      and(
        eq(listLostAccess.listId, parsed.data),
        eq(listLostAccess.userId, actor.userId),
        eq(list.householdId, actor.householdId),
      ),
    );
  return found?.name ?? null;
}

export async function renameList(actor: Actor, id: string, name: string) {
  const value = listName.parse(name);
  await change(actor, id, (tx, target) => tx.update(list).set({ name: value }).where(eq(list.id, target)));
}

/** Removes the list and everything on it; one that is already gone (to them) is not a mistake. */
export async function deleteList(actor: Actor, id: string) {
  assertCan(actor, "list:edit");
  await db.transaction(async (tx) => {
    const found = await lockRow(tx, actor, id);
    if (!found || !canSeeList(actor, found)) return;
    if (!canDeleteList(actor, found)) throw new ForbiddenError(NOT_YOURS_TO_DELETE);
    await tx.delete(list).where(eq(list.id, found.id));
  });
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
  const ticked = flag.parse(done);
  await change(actor, id, async (tx, target) => {
    const item = await lockItem(tx, target, itemId);
    if (ticked === Boolean(item.doneAt)) return;
    await tx
      .update(listItem)
      .set(ticked ? { doneAt: new Date() } : { doneAt: null, rank: await nextRank(tx, target) })
      .where(eq(listItem.id, item.id));
  });
}

export async function removeItem(actor: Actor, id: string, itemId: string) {
  const parsed = listItemId.safeParse(itemId);
  await change(actor, id, async (tx, target) => {
    if (parsed.success) await tx.delete(listItem).where(and(eq(listItem.id, parsed.data), eq(listItem.listId, target)));
  });
}

/**
 * Removes the ticked items among `itemIds` (the ones the person was looking at, so what Rensa
 * says and Ångra restores is what went); resolves with how many went.
 */
export async function clearDone(actor: Actor, id: string, itemIds: string[]): Promise<number> {
  const ids = listItemId.array().max(1000).parse(itemIds);
  return change(actor, id, async (tx, target) => {
    if (ids.length === 0) return 0;
    const gone = await tx
      .delete(listItem)
      .where(and(eq(listItem.listId, target), inArray(listItem.id, ids), sql`${listItem.doneAt} is not null`))
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
  assertCan(actor, "list:order");
  const value = listOrder.parse(order);
  await db
    .update(membership)
    .set({ listOrder: value })
    .where(and(eq(membership.userId, actor.userId), eq(membership.householdId, actor.householdId)));
}
