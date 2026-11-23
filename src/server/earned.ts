import "server-only";
import { and, eq, isNotNull, sql } from "drizzle-orm";
import { db } from "@/db";
import { badgeAward, choreInstance, dailyChest } from "@/db/schema";
import { todayIso } from "@/lib/dates";

/** Where a balance is read: the pool, or a transaction that already holds the person's coins lock. */
export type Reader = Pick<typeof db, "select">;

/**
 * Every coin the actor earned: what the ticks they hold are worth, their chests and their badges.
 * Derived, so Ångra takes coins back by clearing the tick, and a tick from before coins existed
 * (null) earns nothing. A badge's coins stay once won.
 */
export async function sumEarned(householdId: string, userId: string, ex: Reader = db): Promise<number> {
  const [ticks] = await ex
    .select({ total: sql<number>`coalesce(sum(${choreInstance.coins}), 0)::int` })
    .from(choreInstance)
    .where(
      and(
        eq(choreInstance.householdId, householdId),
        eq(choreInstance.completedById, userId),
        isNotNull(choreInstance.completedAt),
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
        sql`(${dailyChest.openedAt} is not null or ${dailyChest.day} < ${todayIso()})`,
      ),
    );
  const [badges] = await ex
    .select({ total: sql<number>`coalesce(sum(${badgeAward.coins}), 0)::int` })
    .from(badgeAward)
    .where(and(eq(badgeAward.householdId, householdId), eq(badgeAward.userId, userId)));
  return (ticks?.total ?? 0) + (chests?.total ?? 0) + (badges?.total ?? 0);
}
