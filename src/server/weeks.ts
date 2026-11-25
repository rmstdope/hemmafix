import "server-only";
import { and, count, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { badgeAward, choreInstance, weekRecapSeen } from "@/db/schema";
import { addDays, todayIso } from "@/lib/dates";
import { formatWeekRange, weekStart, type WeekCounts } from "@/lib/weeks";
import { startOfDay, sumEarned } from "./earned";
import type { Actor } from "./household";

/**
 * The actor's week starting on `start` (a Monday): the tasks are their own ticks that earned coins
 * (ticks from before coins existed have none), counted by when they were done; the coins are all
 * they earned in it, by the balance's rules; badges are those won in the week.
 */
export async function weekCounts(actor: Actor, start: string, today: string = todayIso()): Promise<WeekCounts> {
  const end = addDays(start, 7);
  const [badges] = await db
    .select({ n: count() })
    .from(badgeAward)
    .where(
      and(
        eq(badgeAward.userId, actor.userId),
        eq(badgeAward.householdId, actor.householdId),
        gte(badgeAward.wonAt, startOfDay(start)),
        lt(badgeAward.wonAt, startOfDay(end)),
      ),
    );
  const [row] = await db
    .select({ tasks: count() })
    .from(choreInstance)
    .where(
      and(
        eq(choreInstance.householdId, actor.householdId),
        eq(choreInstance.completedById, actor.userId),
        isNotNull(choreInstance.coins),
        gte(choreInstance.completedAt, startOfDay(start)),
        lt(choreInstance.completedAt, startOfDay(end)),
      ),
    );
  const coins = await sumEarned(actor.householdId, actor.userId, db, { days: { from: start, before: end }, today });
  return { tasks: row?.tasks ?? 0, coins, badges: badges?.n ?? 0 };
}

/** This week and last week, for the card on Framsteg. */
export async function getWeekCard(actor: Actor, now: Date = new Date()) {
  const today = todayIso(now);
  const thisWeek = weekStart(today);
  const [current, last] = await Promise.all([weekCounts(actor, thisWeek, today), weekCounts(actor, addDays(thisWeek, -7), today)]);
  return { now: current, before: last };
}

export type WeekRecap = { range: string; week: WeekCounts; before: WeekCounts };

/**
 * Last week against the week before, when the actor has not been through it yet. A person's first
 * open only records the current week (there is no last week to show), and the sheet comes the
 * first time they open Hemmafix in a later week, on any device.
 */
export async function getPendingRecap(actor: Actor, now: Date = new Date()): Promise<WeekRecap | null> {
  const today = todayIso(now);
  const thisWeek = weekStart(today);
  const [seen] = await db.select({ weekStart: weekRecapSeen.weekStart }).from(weekRecapSeen).where(eq(weekRecapSeen.userId, actor.userId));
  if (!seen) {
    await db.insert(weekRecapSeen).values({ userId: actor.userId, weekStart: thisWeek }).onConflictDoNothing();
    return null;
  }
  if (seen.weekStart >= thisWeek) return null;
  const last = addDays(thisWeek, -7);
  const [week, before] = await Promise.all([weekCounts(actor, last, today), weekCounts(actor, addDays(last, -7), today)]);
  return { range: formatWeekRange(last), week, before };
}

/** The actor is through the sheet for the weeks up to now; it does not come back this week. */
export async function closeWeekRecap(actor: Actor, now: Date = new Date()) {
  const thisWeek = weekStart(todayIso(now));
  await db
    .insert(weekRecapSeen)
    .values({ userId: actor.userId, weekStart: thisWeek })
    .onConflictDoUpdate({ target: weekRecapSeen.userId, set: { weekStart: thisWeek, seenAt: sql`now()` } });
}
