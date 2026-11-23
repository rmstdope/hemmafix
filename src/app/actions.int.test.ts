// The server actions as a browser calls them, for an adult and for a child. Hidden buttons are
// not a permission check: a child can call any action directly, so each must refuse on its own.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { chore, choreInstance, household, oauthClient, oauthRefreshToken, room } from "@/db/schema";
import type { CurrentMember } from "@/server/dal";
import { createFamily } from "../../test/integration/factories";

let current: CurrentMember | null = null;
vi.mock("@/server/dal", () => ({ getCurrentMember: async () => current }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

const actions = await import("./actions");
const chores = await import("@/server/chores");
const lists = await import("@/server/lists");

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

    // The first tick of the day also reports the day's chest.
    expect(await actions.completeInstance(mine.instanceId)).toEqual({
      ...OK,
      chestId: expect.any(String),
      chestCoins: expect.any(Number),
    });
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
    expect(await actions.completeInstance(first.id)).toMatchObject(OK);
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

describe("disconnecting an app", () => {
  beforeEach(async () => {
    await db.delete(oauthClient);
  });

  const connect = async (userId: string) => {
    const clientId = `client-${userId}`;
    await db.insert(oauthClient).values({ id: clientId, clientId, name: "Claude", redirectUris: ["https://x.test/cb"] });
    await db.insert(oauthRefreshToken).values({
      id: `r-${userId}`,
      token: `t-${userId}`,
      clientId,
      userId,
      authorizationCodeId: `fam-${userId}`,
      scopes: ["openid"],
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 86_400_000),
    });
    return `fam-${userId}`;
  };

  it("lets an adult disconnect their own app", async () => {
    const id = await connect(f.adult.userId);
    as(f.adult);
    expect(await actions.disconnectApp(id)).toEqual(OK);
    expect(await db.select().from(oauthRefreshToken)).toEqual([]);
  });

  it("refuses a child, and leaves the connection alone", async () => {
    const id = await connect(f.child.userId);
    as(f.child);
    expect(await actions.disconnectApp(id)).toEqual(FORBIDDEN);
    expect(await db.select().from(oauthRefreshToken)).toHaveLength(1);
  });

  it("does not disconnect somebody else's app", async () => {
    const id = await connect(f.neighbour.userId);
    as(f.adult);
    await actions.disconnectApp(id);
    expect(await db.select().from(oauthRefreshToken)).toHaveLength(1);
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

  it("refuses every list action", async () => {
    const { id } = await lists.createList(f.adult, "Inköp");
    const item = "00000000-0000-4000-8000-000000000001";
    as(null);
    const results = [
      await actions.createList("Ny"),
      await actions.renameList(id, "Ny"),
      await actions.deleteList(id),
      await actions.addListItem(id, item, "x"),
      await actions.editListItem(id, item, "x"),
      await actions.setListItemDone(id, item, true),
      await actions.removeListItem(id, item),
      await actions.clearListDone(id, []),
      await actions.restoreListItems(id, []),
      await actions.setListOrder("skapad"),
    ];
    expect(results.every((r) => !r.ok)).toBe(true);
    expect((await lists.getList(f.adult, id))!.name).toBe("Inköp");
  });
});

describe("addRoutine", () => {
  const routines = async () => import("@/server/routines");
  const fields = (routineId: string, extra: Record<string, string> = {}) =>
    form({ mode: "routine", routineId, roomId: f.kitchen.id, kind: "once", ...extra });

  it("adds the routine's tasks for an adult and says how many", async () => {
    as(f.adult);
    const r = await routines();
    const { id } = await r.createRoutine(f.adult, "Städa");
    await r.addRoutineTask(f.adult, id, "A");
    await r.addRoutineTask(f.adult, id, "B");
    expect(await actions.addRoutine({ ok: false }, fields(id))).toEqual({ ok: true, count: 2 });
    expect(await db.select().from(chore).where(eq(chore.householdId, f.homeId))).toHaveLength(2);
  });

  it("refuses a child, and a routine that is gone", async () => {
    as(f.child);
    expect(await actions.addRoutine({ ok: false }, fields("00000000-0000-4000-8000-000000000000"))).toEqual(FORBIDDEN);
    as(f.adult);
    expect(await actions.addRoutine({ ok: false }, fields("00000000-0000-4000-8000-000000000000"))).toEqual({
      ok: false,
      error: "Rutinen finns inte längre",
    });
  });

  it("answers an unexpected failure with the agreed notice and adds none of the tasks", async () => {
    as(f.adult);
    const r = await routines();
    const { id } = await r.createRoutine(f.adult, "Städa");
    for (const t of ["A", "B", "C"]) await r.addRoutineTask(f.adult, id, t);
    // Fails on the second task, inside the transaction: the first must not stay.
    const quiet = vi.spyOn(console, "error").mockImplementation(() => {});
    const real = chores.insertChore;
    let calls = 0;
    vi.spyOn(chores, "insertChore").mockImplementation((...args) => {
      if (++calls === 2) throw new Error("down");
      return real(...args);
    });
    expect(await actions.addRoutine({ ok: false }, fields(id))).toEqual({
      ok: false,
      error: "Det gick inte att spara. Försök igen.",
    });
    vi.restoreAllMocks();
    quiet.mockRestore();
    expect(await db.select().from(chore).where(eq(chore.householdId, f.homeId))).toHaveLength(0);
  });

  it("does not claim a failure once the tasks are saved", async () => {
    as(f.adult);
    const r = await routines();
    const { id } = await r.createRoutine(f.adult, "Städa");
    await r.addRoutineTask(f.adult, id, "A");
    vi.spyOn(chores, "notifyHouseholdChanged").mockRejectedValueOnce(new Error("down"));
    await expect(actions.addRoutine({ ok: false }, fields(id))).rejects.toThrow("down");
    vi.restoreAllMocks();
    expect(await db.select().from(chore).where(eq(chore.householdId, f.homeId))).toHaveLength(1);
  });
});
