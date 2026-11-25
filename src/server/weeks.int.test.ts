import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { badgeAward, choreInstance, dailyChest, household, weekRecapSeen } from "@/db/schema";
import { addDays, todayIso } from "@/lib/dates";
import type { BadgeKey } from "@/lib/badges";
import { weekStart } from "@/lib/weeks";
import { createFamily } from "../../test/integration/factories";
import { completeInstance, createChore, getCoinTotal, listOpenInstances, openChest, uncompleteInstance } from "./chores";
import { closeWeekRecap, getPendingRecap, getWeekCard, weekCounts } from "./weeks";

let f: Awaited<ReturnType<typeof createFamily>>;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
});

// Monday 23 November 2026, Stockholm is UTC+1.
const MONDAY = "2026-11-23";
const at = (iso: string) => new Date(iso);
let n = 0;

/** A task done by `by` at `when`, worth `coins` (null: ticked before coins existed). */
async function done(by: { userId: string; householdId: string }, when: string, coins: number | null = 10) {
  const title = `Uppgift ${++n}`;
  await createChore(f.adult, { title, roomId: f.kitchen.id, kind: "once" });
  const [t] = (await listOpenInstances(f.adult, {})).filter((i) => i.title === title);
  await db
    .update(choreInstance)
    .set({ completedAt: at(when), completedById: by.userId, coins })
    .where(eq(choreInstance.id, t!.id));
}

type Who = { userId: string; householdId: string };

/** A daily chest of `by` for the day `day`, unopened unless `openedAt` is given. */
async function chest(by: Who, day: string, coins = 9, openedAt: Date | null = null) {
  await db.insert(dailyChest).values({ householdId: by.householdId, userId: by.userId, day, coins, openedAt });
}

/** Makes `by`'s badge `key` one won at `when`, worth 25 coins (the family starts with all won, for nothing). */
async function badge(by: Who, key: BadgeKey, when: string) {
  const won = { coins: 25, wonAt: at(when) };
  await db
    .insert(badgeAward)
    .values({ householdId: by.householdId, userId: by.userId, key, ...won })
    .onConflictDoUpdate({ target: [badgeAward.userId, badgeAward.householdId, badgeAward.key], set: won });
}

describe("weekCounts", () => {
  it("counts the actor's own ticks and their coins, Monday to Sunday in Stockholm time", async () => {
    await done(f.adult, "2026-11-22T22:59:59Z"); // Sunday 23:59:59, last week
    await done(f.adult, "2026-11-22T23:00:00Z", 7); // Monday 00:00, this week
    await done(f.adult, "2026-11-29T22:59:59Z", 3); // Sunday 23:59:59, this week
    await done(f.adult, "2026-11-29T23:00:00Z"); // next Monday
    expect(await weekCounts(f.adult, MONDAY)).toEqual({ tasks: 2, coins: 10, badges: 0 });
    expect(await weekCounts(f.adult, "2026-11-16")).toEqual({ tasks: 1, coins: 10, badges: 0 });
  });

  it("leaves out other people's ticks, ticks without coins", async () => {
    await done(f.child, "2026-11-24T10:00:00Z");
    await done(f.adult, "2026-11-24T10:00:00Z", null);
    await done(f.adult, "2026-11-24T10:00:00Z", 0); // worth nothing, still a task
    expect(await weekCounts(f.adult, MONDAY)).toEqual({ tasks: 1, coins: 0, badges: 0 });
  });
});

describe("weekCounts, through the real tick and undo", () => {
  const open = async (title: string, by = f.adult) => {
    await createChore(f.adult, { title, roomId: f.kitchen.id, kind: "once" });
    return (await listOpenInstances(by, {})).find((i) => i.title === title)!.id;
  };

  it("counts a tick today and takes it back off when it is undone", async () => {
    const id = await open("Diska");
    await completeInstance(f.adult, id);
    const thisWeek = await getWeekCard(f.adult);
    expect(thisWeek.now.tasks).toBe(1);
    await uncompleteInstance(f.adult, id);
    expect((await getWeekCard(f.adult)).now).toEqual({ tasks: 0, coins: 0, badges: 0 });
  });
});

describe("the week's coins: ticks, chests and badges", () => {
  it("adds up to what the balance gained when a tick was undone: 59", async () => {
    await createChore(f.adult, { title: "Diska", roomId: f.kitchen.id, kind: "once" });
    const [t] = await listOpenInstances(f.adult, {});
    const { chestId } = await completeInstance(f.adult, t!.id);
    await openChest(f.adult, chestId!);
    await db.update(dailyChest).set({ coins: 9 });
    await badge(f.adult, "first-task", new Date().toISOString());
    await badge(f.adult, "week-streak", new Date().toISOString());
    await uncompleteInstance(f.adult, t!.id);
    const { now } = await getWeekCard(f.adult);
    expect(now.coins).toBe(59);
    expect(now.coins).toBe(await getCoinTotal(f.adult));
  });

  it("counts all three sources in this week and in last week", async () => {
    await done(f.adult, "2026-11-24T10:00:00Z", 10);
    await chest(f.adult, "2026-11-24", 9);
    await badge(f.adult, "first-task", "2026-11-24T10:00:00Z");
    await badge(f.adult, "week-streak", "2026-11-25T10:00:00Z");
    await done(f.adult, "2026-11-17T10:00:00Z", 20);
    await chest(f.adult, "2026-11-17", 7);
    await badge(f.adult, "ten-same", "2026-11-17T10:00:00Z");
    const card = await getWeekCard(f.adult, at("2026-11-26T12:00:00Z"));
    expect(card.now.coins).toBe(69);
    expect(card.before.coins).toBe(52);
  });

  it("puts a chest in the week of its own day, even when it is opened later", async () => {
    await chest(f.adult, "2026-11-22", 5, at("2026-11-24T10:00:00Z")); // Sunday of last week
    await chest(f.adult, "2026-11-23", 6); // Monday
    await chest(f.adult, "2026-11-29", 7); // Sunday
    await chest(f.adult, "2026-11-30", 8); // next Monday
    expect((await weekCounts(f.adult, MONDAY, "2026-12-07")).coins).toBe(13);
    expect((await weekCounts(f.adult, "2026-11-16", "2026-12-07")).coins).toBe(5);
  });

  it("leaves today's chest out until it is opened or its day is over", async () => {
    await chest(f.adult, "2026-11-24", 6);
    await chest(f.adult, "2026-11-25", 9);
    const coinsOn = async (now: string) => (await getWeekCard(f.adult, at(now))).now.coins;
    expect(await coinsOn("2026-11-25T12:00:00Z")).toBe(6);
    expect(await coinsOn("2026-11-25T23:00:00Z")).toBe(15); // Thursday 00:00 in Stockholm
    await db.update(dailyChest).set({ openedAt: at("2026-11-25T12:00:00Z") });
    expect(await coinsOn("2026-11-25T12:00:00Z")).toBe(15);
  });

  it("counts a badge in the week it was won, in Stockholm time", async () => {
    await badge(f.adult, "first-task", "2026-11-22T22:59:59Z"); // Sunday 23:59:59
    await badge(f.adult, "week-streak", "2026-11-22T23:00:00Z"); // Monday 00:00
    await badge(f.adult, "ten-same", "2026-11-29T23:00:00Z"); // next Monday
    expect((await weekCounts(f.adult, MONDAY)).coins).toBe(25);
    expect((await weekCounts(f.adult, "2026-11-16")).coins).toBe(25);
  });

  it("leaves out other people's chests and badges", async () => {
    const monday = weekStart(todayIso());
    await chest(f.child, addDays(monday, -7));
    await badge(f.child, "first-task", new Date().toISOString());
    expect((await weekCounts(f.adult, monday)).coins).toBe(0);
    expect((await weekCounts(f.adult, addDays(monday, -7))).coins).toBe(0);
  });
});

describe("getWeekCard", () => {
  it("shows this week against last", async () => {
    await done(f.adult, "2026-11-24T10:00:00Z", 10);
    await done(f.adult, "2026-11-25T10:00:00Z", 5);
    await done(f.adult, "2026-11-17T10:00:00Z", 20);
    expect(await getWeekCard(f.adult, at("2026-11-26T12:00:00Z"))).toEqual({
      now: { tasks: 2, coins: 15, badges: 0 },
      before: { tasks: 1, coins: 20, badges: 0 },
    });
  });
});

describe("getPendingRecap", () => {
  it("is never shown on a person's first open, which only records the week", async () => {
    expect(await getPendingRecap(f.adult, at("2026-11-24T08:00:00Z"))).toBeNull();
    const [row] = await db.select().from(weekRecapSeen).where(eq(weekRecapSeen.userId, f.adult.userId));
    expect(row?.weekStart).toBe(MONDAY);
    expect(await getPendingRecap(f.adult, at("2026-11-27T08:00:00Z"))).toBeNull();
  });

  it("shows last week against the week before on the first open of a later week, until closed", async () => {
    await getPendingRecap(f.adult, at("2026-11-24T08:00:00Z"));
    await done(f.adult, "2026-11-24T10:00:00Z", 10);
    await done(f.adult, "2026-11-25T10:00:00Z", 10);
    await done(f.adult, "2026-11-17T10:00:00Z", 5);
    const next = at("2026-12-01T08:00:00Z");
    const recap = await getPendingRecap(f.adult, next);
    expect(recap).toEqual({
      range: "23–29 november",
      week: { tasks: 2, coins: 20, badges: 0 },
      before: { tasks: 1, coins: 5, badges: 0 },
    });
    // Another device, and a reload: still pending until it is closed.
    expect(await getPendingRecap(f.adult, next)).toEqual(recap);
    await closeWeekRecap(f.adult, next);
    expect(await getPendingRecap(f.adult, next)).toBeNull();
  });

  it("counts chests and badges in both weeks", async () => {
    await getPendingRecap(f.adult, at("2026-11-24T08:00:00Z"));
    await done(f.adult, "2026-11-24T10:00:00Z", 10);
    await chest(f.adult, "2026-11-29", 9); // unopened, over by Monday
    await badge(f.adult, "first-task", "2026-11-24T10:00:00Z");
    await chest(f.adult, "2026-11-17", 7);
    await badge(f.adult, "week-streak", "2026-11-17T10:00:00Z");
    const recap = await getPendingRecap(f.adult, at("2026-11-30T08:00:00Z"));
    expect(recap?.week.coins).toBe(44);
    expect(recap?.before.coins).toBe(32);
  });

  it("is per person", async () => {
    await getPendingRecap(f.adult, at("2026-11-24T08:00:00Z"));
    await getPendingRecap(f.child, at("2026-11-24T08:00:00Z"));
    await closeWeekRecap(f.adult, at("2026-12-01T08:00:00Z"));
    expect(await getPendingRecap(f.child, at("2026-12-01T08:00:00Z"))).not.toBeNull();
  });
});
