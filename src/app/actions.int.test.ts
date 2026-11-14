// The server actions as a browser calls them, for an adult and for a child. Hidden buttons are
// not a permission check: a child can call any action directly, so each must refuse on its own.
import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { household, membership, room, task } from "@/db/schema";
import type { CurrentMember } from "@/server/dal";
import { createUser } from "../../test/integration/factories";

let current: CurrentMember | null = null;
vi.mock("@/server/dal", () => ({ getCurrentMember: async () => current }));
vi.mock("next/cache", () => ({ refresh: () => {} }));

const actions = await import("./actions");

let adult: CurrentMember;
let child: CurrentMember;

const form = (fields: Record<string, string>) => {
  const data = new FormData();
  for (const [k, v] of Object.entries(fields)) data.set(k, v);
  return data;
};
const as = (who: CurrentMember | null) => {
  current = who;
};

beforeEach(async () => {
  await db.delete(household);
  const [home] = await db.insert(household).values({ name: "Hemma" }).returning();
  const [anna, bo] = [await createUser("Anna"), await createUser("Bo")];
  await db.insert(membership).values([
    { userId: anna.id, householdId: home!.id, role: "adult" },
    { userId: bo.id, householdId: home!.id, role: "child" },
  ]);
  adult = { userId: anna.id, name: "Anna", image: null, householdId: home!.id, role: "adult" };
  child = { userId: bo.id, name: "Bo", image: null, householdId: home!.id, role: "child" };
});

const FORBIDDEN = "Det här får bara vuxna göra.";

describe("as a child", () => {
  beforeEach(() => as(child));

  it("cannot rename the home, add rooms or change roles", async () => {
    expect(await actions.renameHousehold({ ok: false }, form({ name: "Bos hus" }))).toEqual({ ok: false, error: FORBIDDEN });
    expect(await actions.addRoom({ ok: false }, form({ name: "Bos rum" }))).toEqual({ ok: false, error: FORBIDDEN });
    expect(await actions.setMemberRole(child.userId, "adult")).toEqual({ ok: false, error: FORBIDDEN });
    expect(await db.select().from(room)).toHaveLength(0);
  });

  it("cannot delete a room", async () => {
    const [kok] = await db.insert(room).values({ householdId: adult.householdId, name: "Kök" }).returning();
    await expect(actions.deleteRoom(kok!.id)).rejects.toThrow(FORBIDDEN);
    expect(await db.select().from(room)).toHaveLength(1);
  });

  it("cannot create, assign or delete tasks", async () => {
    expect(await actions.createTask({ ok: false }, form({ title: "Godis" }))).toEqual({ ok: false, error: FORBIDDEN });
    const [t] = await db.insert(task).values({ householdId: adult.householdId, title: "Diska" }).returning();
    await expect(actions.assignTask(t!.id, child.userId)).rejects.toThrow(FORBIDDEN);
    await expect(actions.deleteTask(t!.id)).rejects.toThrow(FORBIDDEN);
    const rows = await db.select().from(task);
    expect(rows).toHaveLength(1);
    expect(rows[0]!.assigneeId).toBeNull();
  });

  it("can tick off a task and undo it", async () => {
    const [t] = await db.insert(task).values({ householdId: adult.householdId, title: "Diska" }).returning();
    await actions.setTaskCompleted(t!.id, true);
    expect((await db.select().from(task).where(eq(task.id, t!.id)))[0]).toMatchObject({ completedById: child.userId });
    await actions.setTaskCompleted(t!.id, false);
    expect((await db.select().from(task).where(eq(task.id, t!.id)))[0]!.completedAt).toBeNull();
  });
});

describe("as an adult", () => {
  beforeEach(() => as(adult));

  it("can rename the home, add rooms and change roles", async () => {
    expect(await actions.renameHousehold({ ok: false }, form({ name: "Villa Kulla" }))).toEqual({ ok: true });
    expect(await actions.addRoom({ ok: false }, form({ name: "Kök" }))).toEqual({ ok: true });
    expect(await actions.setMemberRole(child.userId, "adult")).toEqual({ ok: true });
  });

  it("gets a readable error for invalid input or a duplicate room", async () => {
    expect(await actions.renameHousehold({ ok: false }, form({ name: "  " }))).toEqual({
      ok: false,
      error: "Hemmet behöver ett namn",
    });
    await actions.addRoom({ ok: false }, form({ name: "Kök" }));
    expect(await actions.addRoom({ ok: false }, form({ name: "kök" }))).toEqual({ ok: false, error: "Det rummet finns redan" });
  });

  it("can create, assign and delete tasks", async () => {
    expect(await actions.createTask({ ok: false }, form({ title: "Diska" }))).toEqual({ ok: true });
    const [t] = await db.select().from(task);
    await actions.assignTask(t!.id, child.userId);
    expect((await db.select().from(task))[0]!.assigneeId).toBe(child.userId);
    await actions.deleteTask(t!.id);
    expect(await db.select().from(task)).toHaveLength(0);
  });
});

describe("when logged out", () => {
  it("refuses every action", async () => {
    as(null);
    expect((await actions.addRoom({ ok: false }, form({ name: "Kök" }))).ok).toBe(false);
    await expect(actions.setTaskCompleted("00000000-0000-4000-8000-000000000000", true)).rejects.toThrow("utloggad");
  });
});
