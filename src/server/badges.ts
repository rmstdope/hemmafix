import "server-only";
import { and, count, desc, eq, gte, isNotNull, isNull, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { badgeAward, badgeEpoch, choreInstance, lookPurchase, rewardPurchase, room } from "@/db/schema";
import {
  BADGE_COINS,
  BADGE_KEYS,
  BADGES,
  earnedKeys,
  progressLine,
  wonLine,
  type BadgeFacts,
  type BadgeKey,
} from "@/lib/badges";
import { addDays, todayIso } from "@/lib/dates";
import { STREAK_CAP, streakOf } from "@/lib/streak";
import { weekStart } from "@/lib/weeks";
import { sumEarned } from "./earned";
import type { Actor } from "./household";
import { notifyHouseholdChanged } from "./notify";

type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Runner = Tx | typeof db;

/** How many finished weeks back the quiet week is looked for. */
const QUIET_WEEKS_LOOKED_BACK = 12;

const daysBetween = (from: string, to: string) => Math.round((Date.parse(to) - Date.parse(from)) / 86_400_000);

async function epochOf(ex: Runner): Promise<Date> {
  const [row] = await ex.select({ at: badgeEpoch.startedAt }).from(badgeEpoch);
  return row?.at ?? new Date(0);
}

/** What the actor has done since badges began. */
async function gatherFacts(ex: Runner, actor: Actor, epoch: Date): Promise<BadgeFacts> {
  const today = todayIso();
  const epochDay = todayIso(epoch);
  const mine = and(
    eq(choreInstance.householdId, actor.householdId),
    eq(choreInstance.completedById, actor.userId),
    isNotNull(choreInstance.completedAt),
    gte(choreInstance.completedAt, epoch),
  );

  const [[ticks], perTask, days, [rooms], [roomsDone], [[looks], [rewards]], lifetime, quiet] = await Promise.all([
    ex.select({ n: count() }).from(choreInstance).where(mine),
    ex.select({ n: count() }).from(choreInstance).where(mine).groupBy(choreInstance.choreId).orderBy(desc(count())).limit(1),
    ex
      .selectDistinct({ day: choreInstance.tickedOn })
      .from(choreInstance)
      .where(and(mine, gte(choreInstance.tickedOn, addDays(today, -STREAK_CAP))))
      .orderBy(desc(choreInstance.tickedOn))
      .limit(STREAK_CAP + 1),
    ex
      .select({ n: count() })
      .from(room)
      .where(and(eq(room.householdId, actor.householdId), isNull(room.archivedAt))),
    ex
      .select({ n: sql<number>`count(distinct ${choreInstance.doneRoomId})::int` })
      .from(choreInstance)
      .innerJoin(room, and(eq(room.id, choreInstance.doneRoomId), eq(room.householdId, choreInstance.householdId)))
      .where(and(mine, isNull(room.archivedAt))),
    Promise.all([
      ex.select({ n: count() }).from(lookPurchase).where(and(eq(lookPurchase.userId, actor.userId), gte(lookPurchase.createdAt, epoch))),
      ex.select({ n: count() }).from(rewardPurchase).where(and(eq(rewardPurchase.buyerId, actor.userId), gte(rewardPurchase.createdAt, epoch))),
    ]),
    sumEarned(actor.householdId, actor.userId, ex),
    quietWeeks(ex, actor, epoch, epochDay, today),
  ]);

  const streakDays = days.map((d) => d.day!).filter((d) => d >= epochDay);
  return {
    ticks: ticks?.n ?? 0,
    sameTaskBest: perTask[0]?.n ?? 0,
    run: streakOf(streakDays, today).run,
    roomsDone: roomsDone?.n ?? 0,
    rooms: rooms?.n ?? 0,
    quietDays: quiet.quietDays,
    quietWeek: quiet.quietWeek,
    lifetime,
    bought: (looks?.n ?? 0) + (rewards?.n ?? 0) > 0,
  };
}

/**
 * The quiet week: a finished Monday-Sunday week that began on or after the epoch, in which the
 * actor ticked a task and none of their instances due that week was done after its due date or
 * is still open past it. `quietDays` is the running week's days so far with nothing late.
 */
async function quietWeeks(ex: Runner, actor: Actor, epoch: Date, epochDay: string, today: string) {
  const thisWeek = weekStart(today);
  const lastDone = addDays(thisWeek, -7);
  let first = weekStart(epochDay);
  if (first < epochDay) first = addDays(first, 7);
  first = first < addDays(lastDone, -7 * (QUIET_WEEKS_LOOKED_BACK - 1)) ? addDays(lastDone, -7 * (QUIET_WEEKS_LOOKED_BACK - 1)) : first;

  const late = and(
    eq(choreInstance.householdId, actor.householdId),
    eq(choreInstance.assigneeId, actor.userId),
    lt(choreInstance.dueDate, today),
    sql`(${choreInstance.tickedOn} > ${choreInstance.dueDate} or (${choreInstance.completedAt} is null))`,
  );
  const weekOf = (col: unknown) => sql<string>`date_trunc('week', ${col})::date::text`;
  const to = addDays(thisWeek, 6);
  const [tickedWeeks, lateWeeks] = await Promise.all([
    ex
      .select({ week: weekOf(choreInstance.tickedOn) })
      .from(choreInstance)
      .where(
        and(
          eq(choreInstance.householdId, actor.householdId),
          eq(choreInstance.completedById, actor.userId),
          gte(choreInstance.completedAt, epoch),
          gte(choreInstance.tickedOn, first),
        ),
      )
      .groupBy(weekOf(choreInstance.tickedOn)),
    ex
      .select({ week: weekOf(choreInstance.dueDate) })
      .from(choreInstance)
      .where(and(late, gte(choreInstance.dueDate, first), lt(choreInstance.dueDate, to)))
      .groupBy(weekOf(choreInstance.dueDate)),
  ]);
  const lateSet = new Set(lateWeeks.map((w) => w.week));
  const quietWeek = tickedWeeks.some((w) => w.week >= first && w.week <= lastDone && !lateSet.has(w.week));
  const since = thisWeek < epochDay ? epochDay : thisWeek;
  const quietDays = lateSet.has(thisWeek) ? 0 : Math.max(0, daysBetween(since, today));
  return { quietWeek, quietDays };
}

/**
 * Records every badge the actor has now earned and not yet won, 25 coins each, and returns the
 * keys newly won. Run inside the transaction of whatever may have earned one. A second pass
 * catches Nivå 5, which the first pass's coins can lift the actor to.
 */
export async function awardBadges(ex: Runner, actor: Actor): Promise<BadgeKey[]> {
  const newlyWon: BadgeKey[] = [];
  const epoch = await epochOf(ex);
  for (let pass = 0; pass < 2; pass++) {
    const have = new Set(
      (await ex.select({ key: badgeAward.key }).from(badgeAward).where(and(eq(badgeAward.userId, actor.userId), eq(badgeAward.householdId, actor.householdId)))).map((r) => r.key),
    );
    if (have.size >= BADGE_KEYS.length) break;
    const missing = earnedKeys(await gatherFacts(ex, actor, epoch)).filter((k) => !have.has(k));
    if (missing.length === 0) break;
    const rows = await ex
      .insert(badgeAward)
      .values(missing.map((key) => ({ householdId: actor.householdId, userId: actor.userId, key, coins: BADGE_COINS })))
      .onConflictDoNothing()
      .returning({ key: badgeAward.key });
    newlyWon.push(...rows.map((r) => r.key as BadgeKey));
    if (rows.length === 0) break;
  }
  return newlyWon;
}

export type BadgeView = {
  key: BadgeKey;
  emoji: string;
  name: string;
  description: string;
  won: boolean;
  /** "Vunnet 12 november." once won. */
  wonText: string | null;
  /** How far along, for a badge not won yet that can be counted. */
  progress: { have: number; need: number; text: string } | null;
};

/**
 * The actor's eight badges for Framsteg. Reading first records any that became true with no
 * action of theirs (a finished quiet week), and tells the household's open pages if one did.
 */
export async function getBadges(actor: Actor): Promise<BadgeView[]> {
  const newlyWon = await db.transaction((tx) => awardBadges(tx, actor));
  if (newlyWon.length > 0) await notifyHouseholdChanged(actor.householdId);
  const wonAt = new Map(
    (await db.select({ key: badgeAward.key, at: badgeAward.wonAt }).from(badgeAward).where(and(eq(badgeAward.userId, actor.userId), eq(badgeAward.householdId, actor.householdId)))).map((r) => [
      r.key,
      r.at,
    ]),
  );
  const unwon = BADGES.filter((b) => !wonAt.has(b.key));
  const facts = unwon.length > 0 ? await gatherFacts(db, actor, await epochOf(db)) : null;
  return BADGES.map((b) => {
    const at = wonAt.get(b.key);
    return {
      ...b,
      won: at !== undefined,
      wonText: at ? wonLine(at) : null,
      progress: at || !facts ? null : progressLine(b.key, facts),
    };
  });
}
