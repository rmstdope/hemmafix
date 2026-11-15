// The server actions as a browser calls them, for an adult and for a child. Hidden buttons are
// not a permission check: a child can call any action directly, so each must refuse on its own.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { chore, choreInstance, household, room } from "@/db/schema";
import type { CurrentMember } from "@/server/dal";
import { createFamily } from "../../test/integration/factories";

let current: CurrentMember | null = null;
vi.mock("@/server/dal", () => ({ getCurrentMember: async () => current }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

const actions = await import("./actions");
const chores = await import("@/server/chores");

let f: Awaited<ReturnType<typeof createFamily>>;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const as = (who: CurrentMember | null) => {
  current = who;
};
const FORBIDDEN = { ok: false, error: "Det här får bara vuxna göra." };
const OK = { ok: true };

/** A weekly kitchen task created by the adult, and its open instance. */
async function weeklyTask(title = "Diska") {
  const { id } = await chores.createChore(f.adult, { title, roomId: f.kitchen.id, interval: "1", unit: "week" });
  const [instance] = await db.select().from(choreInstance).where(eq(choreInstance.choreId, id));
  return { choreId: id, instanceId: instance!.id };
}
const openInstance = async (choreId: string) =>
  (await db.select().from(choreInstance).where(eq(choreInstance.choreId, choreId))).find((i) => !i.completedAt);

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
});

describe("as a child", () => {
  beforeEach(() => as(f.child));

  it("cannot rename the home, add or delete rooms, or change roles", async () => {
    expect(await actions.renameHousehold({ ok: false }, form({ name: "Bos hus" }))).toEqual(FORBIDDEN);
    expect(await actions.addRoom({ ok: false }, form({ name: "Bos rum" }))).toEqual(FORBIDDEN);
    expect(await actions.deleteRoom(f.kitchen.id)).toEqual(FORBIDDEN);
    expect(await actions.setMemberRole(f.child.userId, "adult")).toEqual(FORBIDDEN);
    expect(await db.select().from(room).where(eq(room.householdId, f.homeId))).toHaveLength(2);
  });

  it("cannot create, assign or delete tasks", async () => {
    expect(
      await actions.createChore({ ok: false }, form({ title: "Godis", roomId: f.kitchen.id, interval: "1", unit: "day" })),
    ).toEqual(FORBIDDEN);
    const t = await weeklyTask();
    expect(await actions.assignInstance(t.instanceId, f.child.userId)).toEqual(FORBIDDEN);
    expect(await actions.assignChore(t.choreId, f.child.userId)).toEqual(FORBIDDEN);
    expect(await actions.deleteChore(t.choreId)).toEqual(FORBIDDEN);
    expect(
      await actions.editChore(t.instanceId, { ok: false }, form({ title: "Godis", roomId: f.kitchen.id, kind: "once" })),
    ).toEqual(FORBIDDEN);
    expect(await actions.renameRoom(f.kitchen.id, "Godisrum")).toEqual(FORBIDDEN);

    const [c] = await db.select().from(chore);
    expect(c).toMatchObject({ assigneeId: null, archivedAt: null });
    expect((await openInstance(t.choreId))!.assigneeId).toBeNull();
  });

  it("can tick off a task and undo their own tick, but not an adult's", async () => {
    const mine = await weeklyTask("Diska");
    const annas = await weeklyTask("Damma");

    expect(await actions.completeInstance(mine.instanceId)).toEqual(OK);
    expect(await actions.uncompleteInstance(mine.instanceId)).toEqual(OK);

    as(f.adult);
    await actions.completeInstance(annas.instanceId);
    as(f.child);
    expect(await actions.uncompleteInstance(annas.instanceId)).toEqual(FORBIDDEN);
  });
});

describe("as an adult", () => {
  beforeEach(() => as(f.adult));

  it("can rename the home, add rooms and change roles", async () => {
    expect(await actions.renameHousehold({ ok: false }, form({ name: "Villa Kulla" }))).toEqual(OK);
    expect(await actions.addRoom({ ok: false }, form({ name: "Hall" }))).toEqual(OK);
    expect(await actions.setMemberRole(f.child.userId, "adult")).toEqual(OK);
  });

  it("gets a readable error for invalid input, a duplicate room or a room with tasks", async () => {
    expect(await actions.renameHousehold({ ok: false }, form({ name: "  " }))).toEqual({
      ok: false,
      error: "Hemmet behöver ett namn",
    });
    expect(await actions.addRoom({ ok: false }, form({ name: "kök" }))).toEqual({ ok: false, error: "Det rummet finns redan på våningen" });
    expect(await actions.createChore({ ok: false }, form({ title: "Diska", interval: "1", unit: "day" }))).toEqual({
      ok: false,
      error: "Välj ett rum",
    });
    await weeklyTask();
    expect(await actions.deleteRoom(f.kitchen.id)).toEqual({ ok: false, error: "Rummet har uppgifter. Ta bort dem först." });
  });

  it("can create, assign, tick off, undo and delete tasks", async () => {
    expect(
      await actions.createChore(
        { ok: false },
        form({ title: "Diska", roomId: f.kitchen.id, kind: "recurring", interval: "1", unit: "day", templateKey: "diska" }),
      ),
    ).toEqual(OK);
    const [c] = await db.select().from(chore);
    const first = (await openInstance(c!.id))!;

    expect(await actions.assignInstance(first.id, f.child.userId)).toEqual(OK);
    expect(await actions.assignChore(c!.id, f.adult.userId)).toEqual(OK);
    expect(
      await actions.editChore(first.id, { ok: false }, form({ title: "Diska allt", roomId: f.kitchen.id, interval: "2", unit: "day" })),
    ).toEqual(OK);
    expect(await actions.completeInstance(first.id)).toEqual(OK);
    expect(await actions.completeInstance(first.id)).toEqual({ ok: false, error: "Någon har redan bockat av den" });
    expect(await actions.uncompleteInstance(first.id)).toEqual(OK);
    expect(await actions.deleteChore(c!.id)).toEqual(OK);
    expect(await openInstance(c!.id)).toBeUndefined();
  });
});

describe("another household's data", () => {
  let theirs: { choreId: string; instanceId: string };

  beforeEach(async () => {
    const { id } = await chores.createChore(f.neighbour, { title: "Tvätta bilen", roomId: f.garage.id, kind: "once" });
    const [instance] = await db.select().from(choreInstance).where(eq(choreInstance.choreId, id));
    theirs = { choreId: id, instanceId: instance!.id };
    as(f.adult);
  });

  it("cannot be ticked off, assigned or deleted by an adult of this household", async () => {
    expect((await actions.completeInstance(theirs.instanceId)).ok).toBe(false);
    expect((await actions.assignInstance(theirs.instanceId, f.adult.userId)).ok).toBe(false);
    expect((await actions.assignChore(theirs.choreId, f.adult.userId)).ok).toBe(false);
    await actions.deleteChore(theirs.choreId);

    expect(await openInstance(theirs.choreId)).toMatchObject({ completedAt: null, assigneeId: null });
    expect((await db.select().from(chore).where(eq(chore.id, theirs.choreId)))[0]!.archivedAt).toBeNull();
  });

  it("cannot have a tick undone by an adult of this household", async () => {
    await chores.completeInstance(f.neighbour, theirs.instanceId);
    expect((await actions.uncompleteInstance(theirs.instanceId)).ok).toBe(false);
    expect(await openInstance(theirs.choreId)).toBeUndefined();
  });

  it("cannot have its rooms used or deleted, or its members' roles changed", async () => {
    expect((await actions.createChore({ ok: false }, form({ title: "x", roomId: f.garage.id, kind: "once" }))).ok).toBe(false);
    await actions.deleteRoom(f.garage.id);
    expect(await db.select().from(room).where(eq(room.id, f.garage.id))).toHaveLength(1);
    expect(await actions.setMemberRole(f.neighbour.userId, "child")).toEqual({
      ok: false,
      error: "Personen finns inte i hemmet",
    });
  });

  it("cannot be assigned tasks of this household", async () => {
    const t = await weeklyTask();
    expect(await actions.assignInstance(t.instanceId, f.neighbour.userId)).toEqual({
      ok: false,
      error: "Personen finns inte i hemmet",
    });
    expect(await actions.assignChore(t.choreId, f.neighbour.userId)).toEqual({
      ok: false,
      error: "Personen finns inte i hemmet",
    });
    expect((await openInstance(t.choreId))!.assigneeId).toBeNull();
  });
});

describe("when logged out", () => {
  it("refuses every action", async () => {
    const t = await weeklyTask();
    as(null);
    expect((await actions.addRoom({ ok: false }, form({ name: "Hall" }))).ok).toBe(false);
    expect((await actions.completeInstance(t.instanceId)).ok).toBe(false);
    expect((await openInstance(t.choreId))!.completedAt).toBeNull();
  });
});
