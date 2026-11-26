import "server-only";
import { cache } from "react";
import { z } from "zod";
import { aliasedTable, and, asc, desc, eq, gt, gte, isNotNull, isNull, ne, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { chore, choreInstance, dailyChest, floor, highFive, household, lookPurchase, membership, rewardPurchase, room, user } from "@/db/schema";
import type { UndoDebt } from "@/lib/debt";
import { addDays, HOME_TIME_ZONE, todayIso } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { assertCan, can, type Role } from "@/lib/permissions";
import { earlyDoneMessage, isNotYetDue, lockedMessage } from "@/lib/early-tick";
import { laterThan } from "@/lib/postpone";
import { SAVE_FAILED } from "@/lib/routine-texts";
import type { BadgeKey } from "@/lib/badges";
import { levelFor } from "@/lib/levels";
import { rollChestCoins } from "@/lib/chest";
import { findTemplate } from "@/lib/chore-templates";
import { nextDueDate, type Recurrence } from "@/lib/recurrence";
import { STREAK_CAP, streakOf, tickDay, withStreakBonus } from "@/lib/streak";
import {
  assigneeIdInput,
  choreId as choreIdInput,
  createChoreInput,
  type CreateChoreInput,
  editChoreInput,
  instanceId as instanceIdInput,
  memberId as memberIdInput,
  postponeInput,
  undoPostponeInput,
  type BoardFilter,
} from "@/lib/validation";
import { awardBadges } from "./badges";
import { sumEarned, type Reader } from "./earned";
import type { Actor } from "./household";

export { TASKS_CHANNEL, notifyHouseholdChanged } from "./notify";

export type Member = { id: string; name: string; image: string | null };

export async function getHousehold(householdId: string) {
  const [h] = await db.select().from(household).where(eq(household.id, householdId)).limit(1);
  return h ?? null;
}

export async function listMembers(householdId: string): Promise<Member[]> {
  return db
    .select({ id: user.id, name: user.name, image: user.image })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.householdId, householdId))
    .orderBy(asc(user.name));
}

export type FamilyMember = Member & { role: Role };

/** Everyone in the home with their role, alphabetically. */
export async function listFamily(householdId: string): Promise<FamilyMember[]> {
  return db
    .select({ id: user.id, name: user.name, image: user.image, role: membership.role })
    .from(membership)
    .innerJoin(user, eq(user.id, membership.userId))
    .where(eq(membership.householdId, householdId))
    .orderBy(asc(user.name));
}

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];

export async function assertMember(tx: Tx | typeof db, householdId: string, userId: string | null) {
  if (!userId) return;
  const [m] = await tx
    .select({ userId: membership.userId })
    .from(membership)
    .where(and(eq(membership.householdId, householdId), eq(membership.userId, userId)));
  if (!m) throw new UserError("Personen finns inte i hemmet");
}

const recurrenceOf = (c: { recurrenceUnit: Recurrence["unit"] | null; recurrenceInterval: number | null }) =>
  c.recurrenceUnit && c.recurrenceInterval ? { unit: c.recurrenceUnit, interval: c.recurrenceInterval } : null;

// ---------------------------------------------------------------------------
// Creating, assigning and deleting tasks (adults)
// ---------------------------------------------------------------------------

/** Share-locks a room of the actor's home, so it cannot be removed while tasks are added to it. */
export async function lockRoom(tx: Tx, actor: Actor, roomId: string) {
  const [r] = await tx
    .select({ id: room.id })
    .from(room)
    .where(and(eq(room.id, roomId), eq(room.householdId, actor.householdId), isNull(room.archivedAt)))
    .for("share");
  if (!r) throw new UserError("Rummet finns inte i hemmet");
}

/** Inserts a task with its first instance. The caller has checked the room and the assignee. */
export async function insertChore(
  tx: Tx,
  actor: Actor,
  input: Pick<CreateChoreInput, "title" | "roomId" | "recurrence" | "firstDueDate" | "assigneeId" | "coins"> & {
    templateKey: string | null;
    /** When several tasks are added in one transaction, an increasing time keeps their order on the list. */
    createdAt?: Date;
  },
) {
  const [created] = await tx
    .insert(chore)
    .values({
      householdId: actor.householdId,
      roomId: input.roomId,
      title: input.title,
      templateKey: input.templateKey,
      recurrenceUnit: input.recurrence?.unit ?? null,
      recurrenceInterval: input.recurrence?.interval ?? null,
      assigneeId: input.assigneeId,
      coins: input.coins,
      createdById: actor.userId,
      ...(input.createdAt && { createdAt: input.createdAt }),
    })
    .returning({ id: chore.id });
  await tx.insert(choreInstance).values({
    ...(input.createdAt && { createdAt: input.createdAt }),
    choreId: created!.id,
    householdId: actor.householdId,
    dueDate: input.firstDueDate ?? (input.recurrence ? todayIso() : null),
    assigneeId: input.assigneeId,
  });
  return created!;
}

/** Creates a task in a room of the actor's home, with its first instance. */
export async function createChore(actor: Actor, raw: unknown) {
  assertCan(actor, "task:create");
  const input = createChoreInput.parse(raw);

  return db.transaction(async (tx) => {
    await lockRoom(tx, actor, input.roomId);
    await assertMember(tx, actor.householdId, input.assigneeId);
    return insertChore(tx, actor, input);
  });
}

/**
 * Changes a task: title, room, how often (it may become one-off or recurring) and when its
 * open instance is due. What has been done keeps its own title and room in the history.
 */
export async function editChore(actor: Actor, openInstanceId: string, raw: unknown) {
  assertCan(actor, "task:edit");
  // The edit is made from one open instance (the row the form was opened on). If that has
  // been ticked off since, the form is stale: saving it would move the next instance back
  // to the old date, or turn a done one-off into a recurring task with nothing open.
  const instance = instanceIdInput.parse(openInstanceId);
  const input = editChoreInput.parse(raw);

  await db.transaction(async (tx) => {
    // Lock the instance and its task, so a tick or another edit takes turns with this one.
    const [current] = await tx
      .select({ choreId: chore.id, templateKey: chore.templateKey, completedAt: choreInstance.completedAt })
      .from(choreInstance)
      .innerJoin(chore, eq(chore.id, choreInstance.choreId))
      .where(
        and(
          eq(choreInstance.id, instance),
          eq(choreInstance.householdId, actor.householdId),
          isNull(chore.archivedAt),
        ),
      )
      .for("update");
    if (!current) throw new UserError("Uppgiften finns inte längre");
    if (current.completedAt) throw new UserError("Någon har bockat av den under tiden. Öppna den igen och ändra.");
    const target = current.choreId;
    const [r] = await tx
      .select({ id: room.id })
      .from(room)
      .where(and(eq(room.id, input.roomId), eq(room.householdId, actor.householdId), isNull(room.archivedAt)))
      .for("share");
    if (!r) throw new UserError("Rummet finns inte i hemmet");

    // Still the predefined task only while it keeps the template's title.
    const template = findTemplate(current.templateKey);
    await tx
      .update(chore)
      .set({
        title: input.title,
        roomId: input.roomId,
        recurrenceUnit: input.recurrence?.unit ?? null,
        recurrenceInterval: input.recurrence?.interval ?? null,
        templateKey: template && template.title === input.title ? current.templateKey : null,
        // No amount given (Claude leaving it out): the task keeps what it gives.
        ...(input.coins !== undefined && { coins: input.coins }),
      })
      .where(eq(chore.id, target));
    await tx
      .update(choreInstance)
      .set({ dueDate: input.dueDate ?? (input.recurrence ? todayIso() : null) })
      .where(eq(choreInstance.id, instance));
  });
}

/** Assigns one open instance (this time only). */
export async function assignInstance(actor: Actor, id: string, assigneeId: string | null) {
  assertCan(actor, "task:assign");
  const who = assigneeIdInput.parse(assigneeId);
  await assertMember(db, actor.householdId, who);
  const updated = await db
    .update(choreInstance)
    .set({ assigneeId: who })
    .where(
      and(
        eq(choreInstance.id, instanceIdInput.parse(id)),
        eq(choreInstance.householdId, actor.householdId),
        isNull(choreInstance.completedAt),
      ),
    )
    .returning({ id: choreInstance.id });
  if (updated.length === 0) throw new UserError("Uppgiften finns inte längre");
}

/** Assigns every instance of a task: the open one and all that come after it. */
export async function assignChore(actor: Actor, id: string, assigneeId: string | null) {
  assertCan(actor, "task:assign");
  const who = assigneeIdInput.parse(assigneeId);
  const target = choreIdInput.parse(id);
  await db.transaction(async (tx) => {
    await assertMember(tx, actor.householdId, who);
    const updated = await tx
      .update(chore)
      .set({ assigneeId: who })
      .where(and(eq(chore.id, target), eq(chore.householdId, actor.householdId), isNull(chore.archivedAt)))
      .returning({ id: chore.id });
    if (updated.length === 0) throw new UserError("Uppgiften finns inte längre");
    await tx
      .update(choreInstance)
      .set({ assigneeId: who })
      .where(and(eq(choreInstance.choreId, target), isNull(choreInstance.completedAt)));
  });
}

// ---------------------------------------------------------------------------
// Postponing (adults)
// ---------------------------------------------------------------------------

/** The rows' own versions: Postgres changes them on every write, so Ångra sees any later change. */
const instanceVersion = sql<string>`${choreInstance}.xmin::text`;
const choreVersion = sql<string>`${chore}.xmin::text`;

/** The instance and its task, locked until the transaction ends; undefined when it is gone. */
async function lockForMove(tx: Tx, actor: Actor, id: string) {
  const [row] = await tx
    .select({
      dueDate: choreInstance.dueDate,
      completedAt: choreInstance.completedAt,
      instanceVersion,
      choreVersion,
    })
    .from(choreInstance)
    .innerJoin(chore, eq(chore.id, choreInstance.choreId))
    .where(
      and(eq(choreInstance.id, id), eq(choreInstance.householdId, actor.householdId), isNull(chore.archivedAt)),
    )
    .for("update");
  return row;
}

/**
 * Moves an open instance to a later day. Only that day changes, so a recurring task comes back
 * one interval after it is done, as ever. Resolves with what Ångra needs.
 */
export async function postponeInstance(actor: Actor, id: string, day: string) {
  assertCan(actor, "task:postpone");
  const input = postponeInput.parse({ id, day });

  return db.transaction(async (tx) => {
    const row = await lockForMove(tx, actor, input.id);
    if (!row) throw new UserError("Uppgiften finns inte längre");
    if (row.completedAt) throw new UserError("Någon har redan bockat av den");
    // The row offers only later days; one that is not has been overtaken (another move, midnight).
    if (!row.dueDate || input.day <= laterThan(row.dueDate, todayIso())) throw new UserError(SAVE_FAILED);
    const [moved] = await tx
      .update(choreInstance)
      .set({ dueDate: input.day })
      .where(eq(choreInstance.id, input.id))
      .returning({ version: instanceVersion });
    return { postponed: { from: row.dueDate, version: `${moved!.version}.${row.choreVersion}` } };
  });
}

/** Puts a postponed instance back, unless anything about it or its task has changed since. */
export async function undoPostpone(actor: Actor, id: string, back: { to: string; version: string }) {
  assertCan(actor, "task:postpone");
  const input = undoPostponeInput.parse({ ...back, id });

  await db.transaction(async (tx) => {
    const row = await lockForMove(tx, actor, input.id);
    if (
      !row ||
      row.completedAt ||
      `${row.instanceVersion}.${row.choreVersion}` !== input.version ||
      // Only ever back: a later day is Skjut upp's to give.
      !row.dueDate ||
      input.to >= row.dueDate
    )
      throw new UserError(SAVE_FAILED);
    await tx.update(choreInstance).set({ dueDate: input.to }).where(eq(choreInstance.id, input.id));
  });
}

/** Removes a task from the board. What has been done stays in the history. */
export async function deleteChore(actor: Actor, id: string) {
  assertCan(actor, "task:delete");
  const target = choreIdInput.parse(id);
  await db.transaction(async (tx) => {
    const archived = await tx
      .update(chore)
      .set({ archivedAt: new Date() })
      .where(and(eq(chore.id, target), eq(chore.householdId, actor.householdId), isNull(chore.archivedAt)))
      .returning({ id: chore.id });
    if (archived.length === 0) return;
    await tx.delete(choreInstance).where(and(eq(choreInstance.choreId, target), isNull(choreInstance.completedAt)));
  });
}

// ---------------------------------------------------------------------------
// Ticking off (everyone)
// ---------------------------------------------------------------------------

/** What a tick-off offers to celebrate: the day's chest, badges just won and a level just reached. */
export type CompleteReport = {
  chestId: string | null;
  chestCoins: number | null;
  badges: BadgeKey[];
  levelUp: { level: number; title: string } | null;
  /** Said to the person when the tick gave no coins because the chore was not yet due. */
  notice: string | null;
};

/**
 * Ticks off an open instance. For a recurring task the next instance is created at once,
 * due one interval after today, and assigned to whoever does the task every time.
 */
export async function completeInstance(
  actor: Actor,
  id: string,
  { offerChest = true }: { offerChest?: boolean } = {},
): Promise<CompleteReport> {
  assertCan(actor, "task:complete");
  const target = instanceIdInput.parse(id);

  const { chest, badges, levelUp, notice } = await db.transaction(async (tx) => {
    // Lock the instance and its task: two people ticking at the same moment must not both
    // create a next instance, and a tick and an undo of the same task take turns.
    const [row] = await tx
      .select({
        completedAt: choreInstance.completedAt,
        choreId: choreInstance.choreId,
        recurrenceUnit: chore.recurrenceUnit,
        recurrenceInterval: chore.recurrenceInterval,
        archivedAt: chore.archivedAt,
        seriesAssigneeId: chore.assigneeId,
        title: chore.title,
        roomId: chore.roomId,
        coins: chore.coins,
        dueDate: choreInstance.dueDate,
      })
      .from(choreInstance)
      .innerJoin(chore, eq(chore.id, choreInstance.choreId))
      .where(and(eq(choreInstance.id, target), eq(choreInstance.householdId, actor.householdId)))
      .for("update");
    if (!row || row.archivedAt) throw new UserError("Uppgiften finns inte längre");
    if (row.completedAt) throw new UserError("Någon har redan bockat av den");

    // Only if still open: correct even without the lock above, which just makes the loser
    // of a race wait for a clean answer.
    // The streak day this tick falls on gives the task's own coins an extra, kept in the tick so
    // that undoing it takes back exactly what it gave.
    // A repeating chore pays only on or after its day: a child may not tick it before, an adult may,
    // for no coins (so the next occurrence cannot be farmed the moment it comes back).
    const today = todayIso();
    const early = isNotYetDue({ dueDate: row.dueDate, recurrence: recurrenceOf(row) }, today);
    if (early && !can(actor.role, "task:tick-early")) throw new UserError(lockedMessage(row.title, row.dueDate!, today));
    const levelBefore = levelFor(await sumEarned(actor.householdId, actor.userId, tx));
    const days = await tickedDays(tx, actor);
    const coins = early ? 0 : withStreakBonus(row.coins, tickDay(streakOf(days, today)));
    const ticked = await tx
      .update(choreInstance)
      .set({
        completedAt: new Date(),
        completedById: actor.userId,
        doneTitle: row.title,
        doneRoomId: row.roomId,
        coins,
        tickedOn: today,
      })
      .where(and(eq(choreInstance.id, target), isNull(choreInstance.completedAt)))
      .returning({ id: choreInstance.id });
    if (ticked.length === 0) throw new UserError("Någon har redan bockat av den");

    const recurrence = recurrenceOf(row);
    if (recurrence) {
      await tx.insert(choreInstance).values({
        choreId: row.choreId,
        householdId: actor.householdId,
        dueDate: nextDueDate(todayIso(), recurrence),
        assigneeId: row.seriesAssigneeId,
      });
    }

    const badges = await awardBadges(tx, actor);
    const levelAfter = levelFor(await sumEarned(actor.householdId, actor.userId, tx));
    const levelUp =
      levelAfter.level > levelBefore.level ? { level: levelAfter.level, title: levelAfter.title } : null;

    // The first tick of the day that gives coins offers the day's chest; later ticks, and an
    // undone and repeated tick, find it taken. Undo never takes a chest back.
    const notice = early ? earlyDoneMessage(row.title, row.dueDate!, today) : null;
    if (coins <= 0 || !offerChest) return { chest: null, badges, levelUp, notice };
    const [chest] = await tx
      .insert(dailyChest)
      .values({ householdId: actor.householdId, userId: actor.userId, day: todayIso(), coins: rollChestCoins() })
      .onConflictDoNothing()
      .returning({ id: dailyChest.id, coins: dailyChest.coins });
    return { chest: chest ?? null, badges, levelUp, notice };
  });
  return { chestId: chest?.id ?? null, chestCoins: chest?.coins ?? null, badges, levelUp, notice };
}

/** Opens the actor's own chest, which credits its coins. Opening again changes nothing. */
export async function openChest(actor: Actor, id: string): Promise<number> {
  assertCan(actor, "task:complete");
  const chestId = z.string().uuid().safeParse(id);
  if (!chestId.success) throw new UserError("Kistan finns inte längre");
  const [chest] = await db
    .update(dailyChest)
    .set({ openedAt: sql`coalesce(${dailyChest.openedAt}, now())` })
    .where(and(eq(dailyChest.id, chestId.data), eq(dailyChest.userId, actor.userId)))
    .returning({ coins: dailyChest.coins });
  if (!chest) throw new UserError("Kistan finns inte längre");
  return chest.coins;
}

/**
 * Undoes a tick: the instance is open again, and the next instance that the tick created
 * is removed. Only a task's latest tick can be undone; children may undo only their own.
 */
export async function uncompleteInstance(
  actor: Actor,
  id: string,
  { confirmDebt = false }: { confirmDebt?: boolean } = {},
): Promise<{ confirm: UndoDebt } | { debt: UndoDebt } | undefined> {
  const target = instanceIdInput.parse(id);

  return db.transaction(async (tx) => {
    const [row] = await tx
      .select({
        choreId: choreInstance.choreId,
        completedAt: choreInstance.completedAt,
        completedById: choreInstance.completedById,
        coins: choreInstance.coins,
        archivedAt: chore.archivedAt,
      })
      .from(choreInstance)
      .innerJoin(chore, eq(chore.id, choreInstance.choreId))
      .where(and(eq(choreInstance.id, target), eq(choreInstance.householdId, actor.householdId)))
      // Lock the task too, so a tick and an undo of the same task take turns.
      .for("update");
    if (!row || row.archivedAt) throw new UserError("Uppgiften finns inte längre");
    if (!row.completedAt) return;
    if (row.completedById !== actor.userId) assertCan(actor, "task:uncomplete-others");

    const [later] = await tx
      .select({ id: choreInstance.id })
      .from(choreInstance)
      .where(
        and(
          eq(choreInstance.choreId, row.choreId),
          ne(choreInstance.id, target),
          isNotNull(choreInstance.completedAt),
          gt(choreInstance.completedAt, row.completedAt),
        ),
      )
      .limit(1);
    if (later) throw new UserError("Bara den senaste avbockningen kan ångras");

    // Taking the tick's coins back may leave the person below zero, when they spent them. They are
    // asked first; once confirmed the undo always goes ahead (nothing bought is taken away).
    // A tick that gave nothing takes nothing back, and one whose person is gone has no balance.
    const ticker = row.completedById;
    const given = row.coins ?? 0;
    let debt: UndoDebt | undefined;
    if (ticker && given > 0) {
      await tx.execute(sql`select pg_advisory_xact_lock(hashtext('hemmafix:coins:' || ${ticker}))`);
      const after = (await balanceOf(actor.householdId, ticker, tx)) - given;
      if (after < 0) {
        const [who] = await tx.select({ name: user.name }).from(user).where(eq(user.id, ticker));
        debt = { own: ticker === actor.userId, name: (who?.name ?? "").split(" ")[0] ?? "", balance: after };
        if (!confirmDebt) return { confirm: debt };
      }
    }

    await tx
      .delete(choreInstance)
      .where(and(eq(choreInstance.choreId, row.choreId), isNull(choreInstance.completedAt)));
    // The tick is taken back, so the cheers for it go too (the instance is reused by the next tick).
    await tx.delete(highFive).where(eq(highFive.instanceId, target));
    await tx
      .update(choreInstance)
      .set({ completedAt: null, completedById: null, doneTitle: null, doneRoomId: null, coins: null, tickedOn: null })
      .where(eq(choreInstance.id, target));
    return debt && { debt };
  });
}

/**
 * The actor's coins in hand: what they earned (`sumEarned`) less what they spent on looks and on rewards.
 * Derived, so a purchase is a row and nothing is stored twice.
 */
export async function balanceOf(householdId: string, userId: string, ex: Reader = db): Promise<number> {
  const [earned, [spent], [rewards]] = await Promise.all([
    sumEarned(householdId, userId, ex),
    ex
      .select({ total: sql<number>`coalesce(sum(${lookPurchase.price}), 0)::int` })
      .from(lookPurchase)
      .where(and(eq(lookPurchase.householdId, householdId), eq(lookPurchase.userId, userId))),
    // A reward costs coins while it waits or was given; a declined or cancelled one gave them back.
    ex
      .select({ total: sql<number>`coalesce(sum(${rewardPurchase.price}), 0)::int` })
      .from(rewardPurchase)
      .where(
        and(
          eq(rewardPurchase.householdId, householdId),
          eq(rewardPurchase.buyerId, userId),
          sql`${rewardPurchase.status} in ('waiting', 'given')`,
        ),
      ),
  ]);
  return earned - (spent?.total ?? 0) - (rewards?.total ?? 0);
}

/** The person's latest streak days, newest first: all that the 7+ cap needs. */
async function tickedDays(runner: Pick<typeof db, "selectDistinct">, actor: Pick<Actor, "householdId" | "userId">) {
  // Nothing older than a week matters to the cap, so the lookup stays small however long they have ticked.
  const since = addDays(todayIso(), -STREAK_CAP);
  const rows = await runner
    .selectDistinct({ day: choreInstance.tickedOn })
    .from(choreInstance)
    .where(
      and(
        eq(choreInstance.householdId, actor.householdId),
        eq(choreInstance.completedById, actor.userId),
        gte(choreInstance.tickedOn, since),
      ),
    )
    .orderBy(desc(choreInstance.tickedOn))
    .limit(STREAK_CAP + 1);
  return rows.map((r) => r.day!);
}

/** The actor's streak as of today, once per request like the coin total. */
const streakCache = cache(async (householdId: string, userId: string) =>
  streakOf(await tickedDays(db, { householdId, userId }), todayIso()),
);
export const getStreak = (actor: Actor) => streakCache(actor.householdId, actor.userId);

/** Once per request, though the corner is rendered by both the desktop strip and the phone header. */
const balanceCached = cache(balanceOf);
const earnedCached = cache(sumEarned);
export const getCoinTotal = (actor: Actor) => balanceCached(actor.householdId, actor.userId);

/**
 * Every coin the actor has earned, which their level comes from. Spending never lowers it, so once
 * the shop exists the pill's total (`getCoinTotal`) subtracts purchases and this does not; undoing a
 * tick takes its coins off both.
 */
export const getLifetimeCoins = (actor: Actor) => earnedCached(actor.householdId, actor.userId);

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

export type InstanceView = {
  id: string;
  choreId: string;
  title: string;
  roomId: string | null;
  roomName: string | null;
  floorName: string | null;
  dueDate: string | null;
  assigneeId: string | null;
  seriesAssigneeId: string | null;
  recurrence: Recurrence | null;
  completedAt: Date | null;
  completedById: string | null;
  completedByName: string | null;
  /** Whether this is the task's latest tick, the only one that can be undone. */
  isLatestTick: boolean;
  /** What a tick of the task gives; for a done row what that tick gave (null: before coins existed). */
  coins: number | null;
};

const completer = aliasedTable(user, "completer");

/** A done instance shows the title and room it had when ticked off; an open one the task's. */
// Gated on completed_at: an open row never shows a snapshot, even one left behind by an undo
// in a release that did not know about snapshots.
const shownTitle = sql<string>`case when ${choreInstance.completedAt} is not null then coalesce(${choreInstance.doneTitle}, ${chore.title}) else ${chore.title} end`;
const shownRoomId = sql`case when ${choreInstance.completedAt} is not null then coalesce(${choreInstance.doneRoomId}, ${chore.roomId}) else ${chore.roomId} end`;

// A done row shows what its tick gave (null for ticks from before coins existed), an open one what the task gives.
const shownCoins = sql<number | null>`case when ${choreInstance.completedAt} is not null then ${choreInstance.coins} else ${chore.coins} end`;

const instanceColumns = {
  id: choreInstance.id,
  choreId: chore.id,
  title: shownTitle,
  roomId: room.id,
  roomName: room.name,
  floorName: floor.name,
  dueDate: choreInstance.dueDate,
  assigneeId: choreInstance.assigneeId,
  seriesAssigneeId: chore.assigneeId,
  recurrenceUnit: chore.recurrenceUnit,
  recurrenceInterval: chore.recurrenceInterval,
  completedAt: choreInstance.completedAt,
  completedById: choreInstance.completedById,
  completedByName: completer.name,
  coins: shownCoins,
};

type Row = { [K in keyof typeof instanceColumns]: unknown } & {
  recurrenceUnit: Recurrence["unit"] | null;
  recurrenceInterval: number | null;
};

function toView({ recurrenceUnit, recurrenceInterval, ...rest }: Row & { isLatestTick?: boolean }): InstanceView {
  return {
    ...(rest as Omit<InstanceView, "recurrence" | "isLatestTick">),
    recurrence: recurrenceOf({ recurrenceUnit, recurrenceInterval }),
    isLatestTick: rest.isLatestTick ?? false,
  };
}

function selectInstances(where: SQL | undefined, extra = {}) {
  return db
    .select({ ...instanceColumns, ...extra })
    .from(choreInstance)
    .innerJoin(chore, eq(chore.id, choreInstance.choreId))
    .leftJoin(room, eq(room.id, shownRoomId))
    .leftJoin(floor, eq(floor.id, room.floorId))
    .leftJoin(completer, eq(completer.id, choreInstance.completedById))
    .where(where);
}

/** What is left to do, filtered on room and on who it is assigned to. */
export async function listOpenInstances(actor: Actor, filter: BoardFilter): Promise<InstanceView[]> {
  assertCan(actor, "task:view");
  const who =
    filter.who === "mine"
      ? eq(choreInstance.assigneeId, actor.userId)
      : filter.who === "none"
        ? isNull(choreInstance.assigneeId)
        : filter.who
          ? eq(choreInstance.assigneeId, filter.who)
          : undefined;

  const rows = await selectInstances(
    and(
      eq(choreInstance.householdId, actor.householdId),
      isNull(choreInstance.completedAt),
      isNull(chore.archivedAt),
      filter.roomId ? eq(chore.roomId, filter.roomId) : undefined,
      filter.floorId ? eq(room.floorId, filter.floorId) : undefined,
      who,
    ),
  ).orderBy(sql`${choreInstance.dueDate} asc nulls last`, asc(choreInstance.createdAt), asc(choreInstance.id));
  return rows.map((r) => toView(r as Row));
}

/**
 * Ticked off in the last week, newest first, so a mistaken tick can be undone. Children see
 * only their own: seeing what someone else has done is for adults.
 */
export async function listRecentlyCompleted(actor: Actor): Promise<InstanceView[]> {
  assertCan(actor, "task:view");
  const rows = await selectInstances(
    and(
      eq(choreInstance.householdId, actor.householdId),
      isNull(chore.archivedAt),
      isNotNull(choreInstance.completedAt),
      gt(choreInstance.completedAt, sql`now() - interval '7 days'`),
      // Who did what is for adults to see; children see their own ticks.
      can(actor.role, "history:view-anyone") ? undefined : eq(choreInstance.completedById, actor.userId),
    ),
    {
      isLatestTick: sql<boolean>`${choreInstance.completedAt} = max(${choreInstance.completedAt}) over (partition by ${choreInstance.choreId})`,
    },
  )
    .orderBy(desc(choreInstance.completedAt))
    .limit(20);
  return rows.map((r) => toView(r as Row));
}

/** Whether the actor may undo this tick (the UI shows the undo button only then). */
export function canUndo(
  actor: Pick<Actor, "role" | "userId">,
  instance: Pick<InstanceView, "completedById" | "isLatestTick">,
) {
  return instance.isLatestTick && (instance.completedById === actor.userId || can(actor.role, "task:uncomplete-others"));
}

// ---------------------------------------------------------------------------
// History: who did what
// ---------------------------------------------------------------------------

export const HISTORY_PERIODS = [7, 30, 365] as const;
export type HistoryPeriod = (typeof HISTORY_PERIODS)[number];

export type DoneView = {
  id: string;
  title: string;
  roomName: string | null;
  floorName: string | null;
  completedAt: Date;
  /** What that tick gave; null for a tick from before coins existed. */
  coins: number | null;
};

/** At most this many entries are shown; the page says so when the list is cut. */
export const HISTORY_LIMIT = 500;

/**
 * What `personId` ticked off in the last `days` calendar days in Swedish time (today
 * included), newest first. Everyone may see their
 * own; only adults may see someone else's. Deleted tasks and removed rooms are included:
 * what was done stays done.
 */
export async function listCompletedBy(actor: Actor, personId: string, days: HistoryPeriod): Promise<DoneView[]> {
  const person = memberIdInput.parse(personId);
  assertCan(actor, person === actor.userId ? "history:view-own" : "history:view-anyone");
  if (!HISTORY_PERIODS.includes(days)) throw new UserError("Ogiltig period");
  await assertMember(db, actor.householdId, person);

  const rows = await db
    .select({
      id: choreInstance.id,
      title: shownTitle,
      roomName: room.name,
      floorName: floor.name,
      completedAt: choreInstance.completedAt,
      coins: choreInstance.coins,
    })
    .from(choreInstance)
    .innerJoin(chore, eq(chore.id, choreInstance.choreId))
    .leftJoin(room, eq(room.id, shownRoomId))
    .leftJoin(floor, eq(floor.id, room.floorId))
    .where(
      and(
        eq(choreInstance.householdId, actor.householdId),
        eq(choreInstance.completedById, person),
        gte(choreInstance.completedAt, startOfDayInHomeZone(addDays(todayIso(), 1 - days))),
      ),
    )
    .orderBy(desc(choreInstance.completedAt), desc(choreInstance.id))
    .limit(HISTORY_LIMIT);
  return rows as DoneView[];
}

/** The instant a calendar day (YYYY-MM-DD) begins in the household's time zone. */
function startOfDayInHomeZone(day: string) {
  return sql`(${day}::date)::timestamp at time zone ${HOME_TIME_ZONE}`;
}
