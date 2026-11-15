import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { chore, choreInstance, household } from "@/db/schema";
import { todayIso } from "@/lib/dates";
import { ForbiddenError } from "@/lib/permissions";
import { nextDueDate } from "@/lib/recurrence";
import { createFamily } from "../../test/integration/factories";
import {
  assignChore,
  assignInstance,
  completeInstance,
  createChore,
  deleteChore,
  listOpenInstances,
  listRecentlyCompleted,
  uncompleteInstance,
} from "./chores";
import { deleteRoom } from "./household";

let f: Awaited<ReturnType<typeof createFamily>>;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
});

const weekly = (title: string, extra: Record<string, string> = {}) => ({
  title,
  roomId: f.kitchen.id,
  interval: "1",
  unit: "week",
  ...extra,
});
const once = (title: string, extra: Record<string, string> = {}) => ({
  title,
  roomId: f.kitchen.id,
  kind: "once",
  ...extra,
});

const open = (filter = {}) => listOpenInstances(f.adult, filter);
const instancesOf = async (choreId: string) =>
  db.select().from(choreInstance).where(eq(choreInstance.choreId, choreId)).orderBy(choreInstance.createdAt);

describe("createChore", () => {
  it("creates a recurring task, due today by default, with its first instance", async () => {
    await createChore(f.adult, weekly("Dammsuga"));

    const [instance] = await open();
    expect(instance).toMatchObject({
      title: "Dammsuga",
      roomName: "Kök",
      dueDate: todayIso(),
      recurrence: { unit: "week", interval: 1 },
      assigneeId: null,
    });
  });

  it("creates a one-off task, with or without a due date", async () => {
    await createChore(f.adult, once("Putsa fönster", { dueDate: "2026-12-24" }));
    await createChore(f.adult, once("Laga lampan"));

    expect((await open()).map((i) => [i.title, i.dueDate, i.recurrence])).toEqual([
      ["Putsa fönster", "2026-12-24", null],
      ["Laga lampan", null, null],
    ]);
  });

  it("assigns the first instance to whoever does it every time", async () => {
    await createChore(f.adult, weekly("Bädda", { assigneeId: f.child.userId }));
    expect((await open())[0]).toMatchObject({ assigneeId: f.child.userId, seriesAssigneeId: f.child.userId });
  });

  it("keeps the template a task was made from", async () => {
    const { id } = await createChore(f.adult, weekly("Diska", { templateKey: "diska" }));
    expect((await db.select().from(chore).where(eq(chore.id, id)))[0]!.templateKey).toBe("diska");
  });

  it("refuses children, and rooms or people from another home", async () => {
    await expect(createChore(f.child, weekly("Godis"))).rejects.toThrow(ForbiddenError);
    await expect(createChore(f.adult, weekly("x", { roomId: f.garage.id }))).rejects.toThrow("Rummet finns inte");
    await expect(createChore(f.adult, weekly("x", { assigneeId: f.neighbour.userId }))).rejects.toThrow(
      "Personen finns inte",
    );
    expect(await db.select().from(chore)).toHaveLength(0);
  });
});

describe("completeInstance", () => {
  it("creates the next instance of a recurring task, one interval after today", async () => {
    await createChore(f.adult, weekly("Dammsuga", { startDate: "2026-01-05" }));
    const [first] = await open();

    await completeInstance(f.child, first!.id);

    const [next] = await open();
    expect(next).toMatchObject({ title: "Dammsuga", dueDate: nextDueDate(todayIso(), { unit: "week", interval: 1 }) });
    expect(next!.id).not.toBe(first!.id);
    expect((await listRecentlyCompleted(f.adult))[0]).toMatchObject({
      id: first!.id,
      completedById: f.child.userId,
      completedByName: "Bo",
    });
  });

  it("gives the next instance to whoever does the task every time, not to this time's person", async () => {
    await createChore(f.adult, weekly("Diska", { assigneeId: f.child.userId }));
    const [first] = await open();
    await assignInstance(f.adult, first!.id, f.adult.userId);

    await completeInstance(f.adult, first!.id);

    expect((await open())[0]!.assigneeId).toBe(f.child.userId);
  });

  it("finishes a one-off task for good", async () => {
    await createChore(f.adult, once("Putsa fönster"));
    const [only] = await open();
    await completeInstance(f.adult, only!.id);
    expect(await open()).toHaveLength(0);
  });

  it("creates one next instance when two people tick at the same moment", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    const [first] = await open();

    const results = await Promise.allSettled([completeInstance(f.adult, first!.id), completeInstance(f.child, first!.id)]);

    expect(results.filter((r) => r.status === "rejected")).toHaveLength(1);
    const all = await instancesOf(id);
    expect(all).toHaveLength(2);
    expect(all.filter((i) => i.completedAt === null)).toHaveLength(1);
  });

  it("refuses an instance of another home", async () => {
    await createChore(f.neighbour, { title: "Tvätta bilen", roomId: f.garage.id, interval: "1", unit: "week" });
    const [theirs] = await listOpenInstances(f.neighbour, {});
    await expect(completeInstance(f.adult, theirs!.id)).rejects.toThrow("finns inte längre");
    expect(await listOpenInstances(f.neighbour, {})).toHaveLength(1);
  });
});

describe("uncompleteInstance", () => {
  it("reopens the instance and removes the next one the tick created", async () => {
    const { id } = await createChore(f.adult, weekly("Dammsuga"));
    const [first] = await open();
    await completeInstance(f.child, first!.id);

    await uncompleteInstance(f.child, first!.id);

    const all = await instancesOf(id);
    expect(all).toHaveLength(1);
    expect(all[0]).toMatchObject({ id: first!.id, completedAt: null, completedById: null });
  });

  it("lets a child undo only their own tick, and an adult anyone's", async () => {
    await createChore(f.adult, once("Diska"));
    await createChore(f.adult, once("Damma"));
    const [diska, damma] = await open();
    await completeInstance(f.adult, diska!.id);
    await completeInstance(f.child, damma!.id);

    await expect(uncompleteInstance(f.child, diska!.id)).rejects.toThrow(ForbiddenError);
    await uncompleteInstance(f.adult, damma!.id);
    expect((await open()).map((i) => i.title)).toEqual(["Damma"]);
  });

  it("only undoes a task's latest tick", async () => {
    await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await completeInstance(f.adult, first!.id);
    const [second] = await open();
    await completeInstance(f.adult, second!.id);

    await expect(uncompleteInstance(f.adult, first!.id)).rejects.toThrow("senaste avbockningen");
    await uncompleteInstance(f.adult, second!.id);
    expect((await open())[0]!.id).toBe(second!.id);
  });
});

describe("assigning", () => {
  it("assigns this time only, or every time from now on", async () => {
    await createChore(f.adult, weekly("Diska"));
    const [first] = await open();

    await assignInstance(f.adult, first!.id, f.child.userId);
    expect((await open())[0]).toMatchObject({ assigneeId: f.child.userId, seriesAssigneeId: null });

    await assignChore(f.adult, first!.choreId, f.adult.userId);
    expect((await open())[0]).toMatchObject({ assigneeId: f.adult.userId, seriesAssigneeId: f.adult.userId });
    await completeInstance(f.adult, first!.id);
    expect((await open())[0]!.assigneeId).toBe(f.adult.userId);

    await assignChore(f.adult, first!.choreId, null);
    expect((await open())[0]).toMatchObject({ assigneeId: null, seriesAssigneeId: null });
  });

  it("refuses children, people from another home and other homes' tasks", async () => {
    await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await expect(assignInstance(f.child, first!.id, f.child.userId)).rejects.toThrow(ForbiddenError);
    await expect(assignChore(f.child, first!.choreId, f.child.userId)).rejects.toThrow(ForbiddenError);
    await expect(assignInstance(f.adult, first!.id, f.neighbour.userId)).rejects.toThrow("Personen finns inte");
    await expect(assignChore(f.adult, first!.choreId, f.neighbour.userId)).rejects.toThrow("Personen finns inte");
    await expect(assignInstance(f.neighbour, first!.id, f.neighbour.userId)).rejects.toThrow();
    await expect(assignChore(f.neighbour, first!.choreId, null)).rejects.toThrow();
    expect((await open())[0]!.assigneeId).toBeNull();
  });

  it("cannot reassign an instance that is already done", async () => {
    await createChore(f.adult, once("Diska"));
    const [only] = await open();
    await completeInstance(f.child, only!.id);
    await expect(assignInstance(f.adult, only!.id, f.adult.userId)).rejects.toThrow("finns inte längre");
  });
});

describe("deleteChore", () => {
  it("takes the task off the board but keeps what was done", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await completeInstance(f.child, first!.id);

    await deleteChore(f.adult, id);

    expect(await open()).toHaveLength(0);
    const kept = await instancesOf(id);
    expect(kept).toHaveLength(1);
    expect(kept[0]).toMatchObject({ id: first!.id, completedById: f.child.userId });
  });

  it("refuses children and other homes", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    await expect(deleteChore(f.child, id)).rejects.toThrow(ForbiddenError);
    await deleteChore(f.neighbour, id);
    expect(await open()).toHaveLength(1);
  });
});

describe("listOpenInstances", () => {
  beforeEach(async () => {
    await createChore(f.adult, weekly("Diska", { assigneeId: f.child.userId, startDate: "2026-01-03" }));
    await createChore(f.adult, weekly("Toa", { roomId: f.bathroom.id, assigneeId: f.adult.userId, startDate: "2026-01-02" }));
    await createChore(f.adult, once("Byta lampa", { roomId: f.bathroom.id }));
    await createChore(f.adult, once("Torka bänken", { dueDate: "2026-01-01" }));
    await createChore(f.neighbour, { title: "Grannens", roomId: f.garage.id, interval: "1", unit: "day" });
  });

  const titles = async (filter: Parameters<typeof listOpenInstances>[1], who = f.adult) =>
    (await listOpenInstances(who, filter)).map((i) => i.title);

  it("lists the home's open tasks, earliest due first and undated last", async () => {
    expect(await titles({})).toEqual(["Torka bänken", "Toa", "Diska", "Byta lampa"]);
  });

  it("filters on room", async () => {
    expect(await titles({ roomId: f.bathroom.id })).toEqual(["Toa", "Byta lampa"]);
    expect(await titles({ roomId: f.garage.id })).toEqual([]);
  });

  it("filters on who the task is assigned to", async () => {
    expect(await titles({ who: "mine" })).toEqual(["Toa"]);
    expect(await titles({ who: "mine" }, f.child)).toEqual(["Diska"]);
    expect(await titles({ who: f.child.userId })).toEqual(["Diska"]);
    expect(await titles({ who: "none" })).toEqual(["Torka bänken", "Byta lampa"]);
  });

  it("combines the filters", async () => {
    expect(await titles({ roomId: f.kitchen.id, who: "none" })).toEqual(["Torka bänken"]);
  });

  it("is the same list for children, who may filter too", async () => {
    expect(await titles({}, f.child)).toEqual(await titles({}));
    expect(await titles({ roomId: f.bathroom.id, who: "none" }, f.child)).toEqual(["Byta lampa"]);
  });
});

describe("rooms with tasks", () => {
  it("cannot be deleted while they have tasks on the board", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    await expect(deleteRoom(f.adult, f.kitchen.id)).rejects.toThrow("Rummet har uppgifter");

    await deleteChore(f.adult, id);
    await deleteRoom(f.adult, f.kitchen.id);
    // The archived task and its history remain, without a room.
    expect((await db.select().from(chore).where(eq(chore.id, id)))[0]!.roomId).toBeNull();
  });
});
