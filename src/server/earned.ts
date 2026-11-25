import "server-only";
import { and, eq, gte, isNotNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { badgeAward, choreInstance, dailyChest } from "@/db/schema";
import { HOME_TIME_ZONE, todayIso } from "@/lib/dates";

/** Where a balance is read: the pool, or a transaction that already holds the person's coins lock. */
export type Reader = Pick<typeof db, "select">;

/** Midnight in the household's time zone at the start of a YYYY-MM-DD day. */
export const startOfDay = (iso: string) => sql`(${iso}::date)::timestamp at time zone ${HOME_TIME_ZONE}`;

/** The days from `from` up to, not including, `before` (both YYYY-MM-DD, Europe/Stockholm). */
export type Days = { from: string; before: string };

/**
 * Every coin the actor earned: what the ticks they hold are worth, their chests and their badges.
 * Derived, so Ångra takes coins back by clearing the tick, and a tick from before coins existed
 * (null) earns nothing. A badge's coins stay once won.
 *
 * With `days`, only what falls in them: a tick by when it was done, a badge by when it was won
 * and a chest by its own day. `today` decides whether an unopened chest's day is over.
 */
export async function sumEarned(
  householdId: string,
  userId: string,
  ex: Reader = db,
  { days, today = todayIso() }: { days?: Days; today?: string } = {},
): Promise<number> {
  const within = (at: typeof choreInstance.completedAt | typeof badgeAward.wonAt) =>
    days ? and(gte(at, startOfDay(days.from)), lt(at, startOfDay(days.before))) : undefined;
  const [ticks] = await ex
    .select({ total: sql<number>`coalesce(sum(${choreInstance.coins}), 0)::int` })
    .from(choreInstance)
    .where(
      and(
        eq(choreInstance.householdId, householdId),
        eq(choreInstance.completedById, userId),
        isNotNull(choreInstance.completedAt),
        within(choreInstance.completedAt),
      ),
    );
  // A chest counts once opened, or once its day is over, so an unopened one is never lost.
  const [chests] = await ex
    .select({ total: sql<number>`coalesce(sum(${dailyChest.coins}), 0)::int` })
    .from(dailyChest)
    .where(
      and(
        eq(dailyChest.householdId, householdId),
        eq(dailyChest.userId, userId),
        sql`(${dailyChest.openedAt} is not null or ${dailyChest.day} < ${today})`,
        days ? and(gte(dailyChest.day, days.from), lt(dailyChest.day, days.before)) : undefined,
      ),
    );
  const [badges] = await ex
    .select({ total: sql<number>`coalesce(sum(${badgeAward.coins}), 0)::int` })
    .from(badgeAward)
    .where(and(eq(badgeAward.householdId, householdId), eq(badgeAward.userId, userId), within(badgeAward.wonAt)));
  return (ticks?.total ?? 0) + (chests?.total ?? 0) + (badges?.total ?? 0);
}
