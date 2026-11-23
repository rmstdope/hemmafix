import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { choreInstance, household, weekRecapSeen } from "@/db/schema";
import { createFamily } from "../../test/integration/factories";
import { createChore, listOpenInstances } from "./chores";
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

  it("is per person", async () => {
    await getPendingRecap(f.adult, at("2026-11-24T08:00:00Z"));
    await getPendingRecap(f.child, at("2026-11-24T08:00:00Z"));
    await closeWeekRecap(f.adult, at("2026-12-01T08:00:00Z"));
    expect(await getPendingRecap(f.child, at("2026-12-01T08:00:00Z"))).not.toBeNull();
  });
});
