import "server-only";
import { and, count, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { badgeAward, choreInstance, weekRecapSeen } from "@/db/schema";
import { addDays, HOME_TIME_ZONE, todayIso } from "@/lib/dates";
import { formatWeekRange, weekStart, type WeekCounts } from "@/lib/weeks";
import type { Actor } from "./household";

const startOfDay = (iso: string) => sql`(${iso}::date)::timestamp at time zone ${HOME_TIME_ZONE}`;

/**
 * What the actor ticked off in the week starting on `start` (a Monday): their own ticks that
 * earned coins (ticks from before coins existed have none), counted by when they were done.
 * Badges are those won in the week.
 */
export async function weekCounts(actor: Actor, start: string): Promise<WeekCounts> {
  const [badges] = await db
    .select({ n: count() })
    .from(badgeAward)
    .where(
      and(
        eq(badgeAward.userId, actor.userId),
        gte(badgeAward.wonAt, startOfDay(start)),
        lt(badgeAward.wonAt, startOfDay(addDays(start, 7))),
      ),
    );
  const [row] = await db
    .select({ tasks: count(), coins: sql<number>`coalesce(sum(${choreInstance.coins}), 0)::int` })
    .from(choreInstance)
    .where(
      and(
        eq(choreInstance.householdId, actor.householdId),
        eq(choreInstance.completedById, actor.userId),
        isNotNull(choreInstance.coins),
        gte(choreInstance.completedAt, startOfDay(start)),
        lt(choreInstance.completedAt, startOfDay(addDays(start, 7))),
      ),
    );
  return { tasks: row?.tasks ?? 0, coins: row?.coins ?? 0, badges: badges?.n ?? 0 };
}

/** This week and last week, for the card on Framsteg. */
export async function getWeekCard(actor: Actor, now: Date = new Date()) {
  const thisWeek = weekStart(todayIso(now));
  const [current, last] = await Promise.all([weekCounts(actor, thisWeek), weekCounts(actor, addDays(thisWeek, -7))]);
  return { now: current, before: last };
}

export type WeekRecap = { range: string; week: WeekCounts; before: WeekCounts };

/**
 * Last week against the week before, when the actor has not been through it yet. A person's first
 * open only records the current week (there is no last week to show), and the sheet comes the
 * first time they open Hemmafix in a later week, on any device.
 */
export async function getPendingRecap(actor: Actor, now: Date = new Date()): Promise<WeekRecap | null> {
  const thisWeek = weekStart(todayIso(now));
  const [seen] = await db.select({ weekStart: weekRecapSeen.weekStart }).from(weekRecapSeen).where(eq(weekRecapSeen.userId, actor.userId));
  if (!seen) {
    await db.insert(weekRecapSeen).values({ userId: actor.userId, weekStart: thisWeek }).onConflictDoNothing();
    return null;
  }
  if (seen.weekStart >= thisWeek) return null;
  const last = addDays(thisWeek, -7);
  const [week, before] = await Promise.all([weekCounts(actor, last), weekCounts(actor, addDays(last, -7))]);
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
