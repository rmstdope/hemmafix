import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { chore, choreInstance, household, membership } from "@/db/schema";
import { addDays, todayIso } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { DEFAULT_COINS } from "@/lib/coins";
import { ForbiddenError } from "@/lib/permissions";
import { nextDueDate } from "@/lib/recurrence";
import { createFamily } from "../../test/integration/factories";
import {
  assignChore,
  assignInstance,
  canUndo,
  completeInstance,
  createChore,
  deleteChore,
  editChore,
  getCoinTotal,
  getLifetimeCoins,
  listCompletedBy,
  listOpenInstances,
  listRecentlyCompleted,
  uncompleteInstance,
} from "./chores";
import { addRoom, deleteRoom, listRooms } from "./household";

let f: Awaited<ReturnType<typeof createFamily>>;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
});

const weekly = (title: string, extra: Record<string, string> = {}) => ({
  title,
  roomId: f.kitchen.id,
  kind: "recurring",
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
const openOf = async (title: string) => (await open()).filter((i) => i.title === title);
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

    const rejected = results.filter((r) => r.status === "rejected");
    expect(rejected).toHaveLength(1);
    // A readable message, not a database error from the one-open-instance index.
    expect(String(rejected[0]!.reason)).toContain("redan bockat av");
    const all = await instancesOf(id);
    expect(all).toHaveLength(2);
    expect(all.filter((i) => i.completedAt === null)).toHaveLength(1);
  });

  it("counts from today in Swedish time, whatever the server's clock zone", async () => {
    await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      // 23:30 UTC on the 15th is already 00:30 on the 16th in Stockholm.
      vi.setSystemTime(new Date("2026-11-15T23:30:00Z"));
      await completeInstance(f.adult, first!.id);
    } finally {
      vi.useRealTimers();
    }
    expect((await open())[0]!.dueDate).toBe("2026-11-23");
  });

  it("refuses a task that has been deleted", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await deleteChore(f.adult, id);
    await expect(completeInstance(f.adult, first!.id)).rejects.toThrow("finns inte längre");
    expect(await instancesOf(id)).toHaveLength(0);
  });

  it("refuses an instance of another home", async () => {
    await createChore(f.neighbour, { title: "Tvätta bilen", roomId: f.garage.id, kind: "recurring", interval: "1", unit: "week" });
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

  it("cannot bring back a deleted task", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await completeInstance(f.adult, first!.id);
    await deleteChore(f.adult, id);

    await expect(uncompleteInstance(f.adult, first!.id)).rejects.toThrow("finns inte längre");
    const all = await instancesOf(id);
    expect(all).toHaveLength(1);
    expect(all[0]!.completedAt).not.toBeNull();
  });

  it("drops a one-time assignment of the next instance it removes", async () => {
    // Documented behaviour: the next instance is recreated on the next tick, assigned to
    // whoever does the task every time.
    await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await completeInstance(f.adult, first!.id);
    const [next] = await open();
    await assignInstance(f.adult, next!.id, f.child.userId);

    await uncompleteInstance(f.adult, first!.id);
    await completeInstance(f.adult, first!.id);

    expect((await open())[0]!.assigneeId).toBeNull();
  });

  it("only undoes a task's latest tick", async () => {
    await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await completeInstance(f.adult, first!.id);
    const [second] = await open();
    await completeInstance(f.adult, second!.id);

    const recent = await listRecentlyCompleted(f.adult);
    expect(recent.map((i) => [i.id, i.isLatestTick])).toEqual([
      [second!.id, true],
      [first!.id, false],
    ]);
    expect(canUndo(f.adult, recent[1]!)).toBe(false);
    expect(canUndo(f.adult, recent[0]!)).toBe(true);
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
    // What was already done keeps who it was assigned to.
    const doneOne = (await instancesOf(first!.choreId)).find((i) => i.id === first!.id);
    expect(doneOne!.assigneeId).toBe(f.adult.userId);
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
    await createChore(f.neighbour, { title: "Grannens", roomId: f.garage.id, kind: "recurring", interval: "1", unit: "day" });
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

describe("rooms", () => {
  it("cannot be removed while they have tasks on the board", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    await expect(deleteRoom(f.adult, f.kitchen.id)).rejects.toThrow("Rummet har uppgifter");
    expect((await listRooms(f.homeId)).map((r) => r.name)).toContain("Kök");

    await deleteChore(f.adult, id);
    await deleteRoom(f.adult, f.kitchen.id);
    expect((await listRooms(f.homeId)).map((r) => r.name)).not.toContain("Kök");
  });

  it("keep their name in the history once removed, and the name can be used again", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await completeInstance(f.child, first!.id);
    await deleteChore(f.adult, id);
    await deleteRoom(f.adult, f.kitchen.id);

    const [kept] = await db.select().from(chore).where(eq(chore.id, id));
    expect(kept!.roomId).toBe(f.kitchen.id);
    const newKitchen = await addRoom(f.adult, "Kök");
    expect(newKitchen.id).not.toBe(f.kitchen.id);
  });

  it("get no new tasks once removed", async () => {
    await deleteRoom(f.adult, f.bathroom.id);
    await expect(createChore(f.adult, weekly("Toa", { roomId: f.bathroom.id }))).rejects.toThrow("Rummet finns inte");
  });

  it("never end up removed with a task on the board, however the requests race", async () => {
    for (let i = 0; i < 10; i++) {
      const r = await addRoom(f.adult, `Rum ${i}`);
      const results = await Promise.allSettled([
        createChore(f.adult, weekly(`Uppgift ${i}`, { roomId: r.id })),
        deleteRoom(f.adult, r.id),
      ]);
      // Whichever wins, the loser fails with a message meant for people, not a database error.
      for (const result of results) {
        if (result.status === "rejected") expect(result.reason).toBeInstanceOf(UserError);
      }
      const removed = !(await listRooms(f.homeId)).some((x) => x.id === r.id);
      const tasks = (await open()).filter((t) => t.roomId === r.id);
      expect(removed && tasks.length > 0).toBe(false);
    }
  });
});

describe("listCompletedBy", () => {
  const tick = async (title: string, who: typeof f.adult, extra: Record<string, string> = {}) => {
    const { id } = await createChore(f.adult, once(title, extra));
    const [instance] = await instancesOf(id);
    await completeInstance(who, instance!.id);
    return { choreId: id, instanceId: instance!.id };
  };
  const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

  const setDoneAt = (instanceId: string, at: Date) =>
    db.update(choreInstance).set({ completedAt: at }).where(eq(choreInstance.id, instanceId));

  it("shows what a person ticked off, newest first, with the room", async () => {
    const diska = await tick("Diska", f.child);
    const toa = await tick("Toa", f.child, { roomId: f.bathroom.id });
    await tick("Annas", f.adult);
    await setDoneAt(diska.instanceId, new Date(Date.now() - 2 * 60_000));
    await setDoneAt(toa.instanceId, new Date(Date.now() - 60_000));

    const bos = await listCompletedBy(f.child, f.child.userId, 30);
    expect(bos.map((d) => [d.title, d.roomName])).toEqual([
      ["Toa", "Badrum"],
      ["Diska", "Kök"],
    ]);
  });

  it("lets everyone see their own, and only adults see someone else's", async () => {
    await tick("Diska", f.child);
    await tick("Annas", f.adult);

    expect(titles(await listCompletedBy(f.adult, f.child.userId, 30))).toEqual(["Diska"]);
    expect(titles(await listCompletedBy(f.adult, f.adult.userId, 30))).toEqual(["Annas"]);
    await expect(listCompletedBy(f.child, f.adult.userId, 30)).rejects.toThrow(ForbiddenError);
  });

  it("never shows another home's people or tasks", async () => {
    await createChore(f.neighbour, { title: "Tvätta bilen", roomId: f.garage.id, kind: "once" });
    const [theirs] = await listOpenInstances(f.neighbour, {});
    await completeInstance(f.neighbour, theirs!.id);

    await expect(listCompletedBy(f.adult, f.neighbour.userId, 30)).rejects.toThrow("Personen finns inte");
    expect(await listCompletedBy(f.neighbour, f.neighbour.userId, 30)).toHaveLength(1);
  });

  it("keeps what was done after the task is deleted and its room removed", async () => {
    const { choreId } = await tick("Diska", f.child);
    await deleteChore(f.adult, choreId);
    await deleteRoom(f.adult, f.kitchen.id);

    expect((await listCompletedBy(f.child, f.child.userId, 30)).map((d) => [d.title, d.roomName])).toEqual([
      ["Diska", "Kök"],
    ]);
  });

  it("drops a tick that was undone, and counts each tick of a recurring task", async () => {
    const mistake = await tick("Fel", f.child);
    await uncompleteInstance(f.child, mistake.instanceId);
    await createChore(f.adult, weekly("Diska"));
    const [first] = await openOf("Diska");
    await completeInstance(f.child, first!.id);
    const [second] = await openOf("Diska");
    await completeInstance(f.child, second!.id);

    expect(titles(await listCompletedBy(f.child, f.child.userId, 30))).toEqual(["Diska", "Diska"]);
  });

  it("covers whole calendar days in Swedish time, today included", async () => {
    // The 7-day period starts at midnight, Swedish time, six days ago.
    const [{ start }] = (await db.execute(
      sql`select ((${addDays(todayIso(), -6)}::date)::timestamp at time zone 'Europe/Stockholm') as start`,
    )) as unknown as [{ start: string }];
    const startsAt = new Date(start).getTime();
    const minute = 60_000;

    const justInside = await tick("Strax efter midnatt", f.child);
    await setDoneAt(justInside.instanceId, new Date(startsAt + minute));
    const justOutside = await tick("Strax före midnatt", f.child);
    await setDoneAt(justOutside.instanceId, new Date(startsAt - minute));
    const old = await tick("Länge sen", f.child);
    await setDoneAt(old.instanceId, new Date(Date.now() - 40 * 86_400_000));
    await tick("Idag", f.child);

    expect(titles(await listCompletedBy(f.child, f.child.userId, 7))).toEqual(["Idag", "Strax efter midnatt"]);
    expect(titles(await listCompletedBy(f.child, f.child.userId, 30))).toEqual([
      "Idag",
      "Strax efter midnatt",
      "Strax före midnatt",
    ]);
    expect(titles(await listCompletedBy(f.child, f.child.userId, 365))).toEqual([
      "Idag",
      "Strax efter midnatt",
      "Strax före midnatt",
      "Länge sen",
    ]);
    await expect(listCompletedBy(f.child, f.child.userId, 5 as never)).rejects.toThrow("Ogiltig period");
  });

  it("shows only this home's tasks for someone who belongs to two homes", async () => {
    await db.insert(membership).values({ userId: f.child.userId, householdId: f.neighbour.householdId, role: "child" });
    await createChore(f.neighbour, { title: "Hos grannen", roomId: f.garage.id, kind: "once" });
    const [theirs] = await listOpenInstances(f.neighbour, {});
    await completeInstance({ ...f.child, householdId: f.neighbour.householdId }, theirs!.id);
    await tick("Hemma", f.child);

    expect(titles(await listCompletedBy(f.adult, f.child.userId, 30))).toEqual(["Hemma"]);
  });
});

describe("listRecentlyCompleted", () => {
  it("shows adults everyone's recent ticks, and children only their own", async () => {
    await createChore(f.adult, once("Annas"));
    await createChore(f.adult, once("Bos"));
    const [annas, bos] = await open();
    await completeInstance(f.adult, annas!.id);
    await completeInstance(f.child, bos!.id);

    expect((await listRecentlyCompleted(f.adult)).map((i) => i.title).sort()).toEqual(["Annas", "Bos"]);
    expect((await listRecentlyCompleted(f.child)).map((i) => i.title)).toEqual(["Bos"]);
  });
});


describe("editChore", () => {
  // Edits are made from the task's open instance, as the form does.
  const openInstanceOf = async (choreId: string) =>
    (await instancesOf(choreId)).find((i) => !i.completedAt)?.id ?? choreId;
  const editFrom = (instanceId: string, fields: Record<string, string>, who = f.adult) =>
    editChore(who, instanceId, { roomId: f.kitchen.id, interval: "1", unit: "week", ...fields });
  const edit = async (choreId: string, fields: Record<string, string>, who = f.adult) =>
    editFrom(await openInstanceOf(choreId), fields, who);

  it("refuses a stale form: a one-off ticked off since cannot become recurring with nothing open", async () => {
    const { id } = await createChore(f.adult, once("Putsa fönster"));
    const [only] = await open();
    await completeInstance(f.child, only!.id);

    await expect(editFrom(only!.id, { title: "Putsa fönster", kind: "recurring" })).rejects.toThrow(
      "bockat av den under tiden",
    );
    expect((await db.select().from(chore).where(eq(chore.id, id)))[0]!.recurrenceUnit).toBeNull();
  });

  it("refuses a stale form: the next instance keeps its date", async () => {
    await createChore(f.adult, weekly("Diska", { startDate: "2026-01-05" }));
    const [first] = await open();
    await completeInstance(f.child, first!.id);
    const [next] = await open();

    await expect(editFrom(first!.id, { title: "Diska", dueDate: "2026-01-05" })).rejects.toThrow(
      "bockat av den under tiden",
    );
    expect((await open())[0]).toMatchObject({ id: next!.id, dueDate: next!.dueDate, title: "Diska" });
  });

  it("shows an open row as the task is, even if an older release left a snapshot on it", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await completeInstance(f.adult, first!.id);
    await uncompleteInstance(f.adult, first!.id);
    // An undo by the previous release clears only completed_at / completed_by_id.
    await db
      .update(choreInstance)
      .set({ doneTitle: "Gammalt namn", doneRoomId: f.bathroom.id })
      .where(eq(choreInstance.id, first!.id));
    await edit(id, { title: "Handdiska" });

    expect((await open()).map((i) => [i.title, i.roomName])).toEqual([["Handdiska", "Kök"]]);
    expect((await open({ roomId: f.kitchen.id })).map((i) => i.title)).toEqual(["Handdiska"]);
  });

  it("changes the title, room, how often and the next due date", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));

    await edit(id, { title: "Diska och torka", roomId: f.bathroom.id, interval: "2", unit: "day", dueDate: "2026-12-01" });

    expect((await open())[0]).toMatchObject({
      title: "Diska och torka",
      roomName: "Badrum",
      recurrence: { unit: "day", interval: 2 },
      dueDate: "2026-12-01",
    });
  });

  it("turns a recurring task into a one-off and back", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    await edit(id, { title: "Diska", kind: "once", dueDate: "" });
    let [instance] = await open();
    expect(instance).toMatchObject({ recurrence: null, dueDate: null });

    await completeInstance(f.adult, instance!.id);
    expect(await open()).toHaveLength(0);

    const { id: other } = await createChore(f.adult, once("Putsa fönster"));
    await edit(other, { title: "Putsa fönster", kind: "recurring", interval: "1", unit: "month", dueDate: "" });
    [instance] = await open();
    // A recurring task is always due some day: today when no date is given.
    expect(instance).toMatchObject({ recurrence: { unit: "month", interval: 1 }, dueDate: todayIso() });
    await completeInstance(f.adult, instance!.id);
    expect((await open())[0]!.dueDate).toBe(nextDueDate(todayIso(), { unit: "month", interval: 1 }));
  });

  it("keeps the template only while the title is the template's", async () => {
    const { id } = await createChore(f.adult, weekly("Diska", { templateKey: "diska" }));
    await edit(id, { title: "Diska", roomId: f.bathroom.id });
    expect((await db.select().from(chore).where(eq(chore.id, id)))[0]!.templateKey).toBe("diska");
    await edit(id, { title: "Diska för hand" });
    expect((await db.select().from(chore).where(eq(chore.id, id)))[0]!.templateKey).toBeNull();
  });

  it("leaves what was done as it was, in the history and among the recently done", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await completeInstance(f.child, first!.id);

    await edit(id, { title: "Handdiska", roomId: f.bathroom.id });

    expect((await listCompletedBy(f.child, f.child.userId, 7)).map((d) => [d.title, d.roomName])).toEqual([
      ["Diska", "Kök"],
    ]);
    expect((await listRecentlyCompleted(f.adult)).map((d) => [d.title, d.roomName])).toEqual([["Diska", "Kök"]]);
    expect((await open()).map((d) => [d.title, d.roomName])).toEqual([["Handdiska", "Badrum"]]);
  });

  it("forgets the snapshot when a tick is undone", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    const [first] = await open();
    await completeInstance(f.adult, first!.id);
    await uncompleteInstance(f.adult, first!.id);
    await edit(id, { title: "Handdiska" });
    expect((await open())[0]!.title).toBe("Handdiska");
    const [row] = await db.select().from(choreInstance).where(eq(choreInstance.id, first!.id));
    expect(row).toMatchObject({ doneTitle: null, doneRoomId: null });
  });

  it("refuses children, other homes, removed rooms, deleted tasks and bad input", async () => {
    const { id } = await createChore(f.adult, weekly("Diska"));
    await expect(edit(id, { title: "Godis" }, f.child)).rejects.toThrow(ForbiddenError);
    await expect(edit(id, { title: "Grannens" }, f.neighbour)).rejects.toThrow("finns inte längre");
    await expect(edit(id, { title: "Diska", roomId: f.garage.id })).rejects.toThrow("Rummet finns inte");
    await expect(edit(id, { title: "  " })).rejects.toThrow();
    await expect(edit(id, { title: "Diska", interval: "0" })).rejects.toThrow();
    const stale = await openInstanceOf(id);
    await deleteChore(f.adult, id);
    await expect(editFrom(stale, { title: "Diska" })).rejects.toThrow("finns inte längre");
    expect((await db.select().from(chore).where(eq(chore.id, id)))[0]!.title).toBe("Diska");
  });
});

describe("coins", () => {
  const total = getCoinTotal;

  it("starts at 0", async () => {
    expect(await total(f.adult)).toBe(0);
    expect(await total(f.child)).toBe(0);
  });

  it("goes to whoever ticked, whoever the task was assigned to, and to adults and children alike", async () => {
    await createChore(f.adult, once("Diska", { assigneeId: f.child.userId }));
    await createChore(f.adult, once("Damma", { assigneeId: f.adult.userId }));
    const [diska, damma] = await open();

    await completeInstance(f.adult, diska!.id);
    await completeInstance(f.child, damma!.id);

    expect(await total(f.adult)).toBe(DEFAULT_COINS);
    expect(await total(f.child)).toBe(DEFAULT_COINS);
    expect(await total(f.neighbour)).toBe(0);
  });

  it("is earned every time a recurring task is ticked", async () => {
    await createChore(f.adult, weekly("Dammsuga"));
    await completeInstance(f.child, (await open())[0]!.id);
    await completeInstance(f.child, (await open())[0]!.id);
    expect(await total(f.child)).toBe(2 * DEFAULT_COINS);
  });

  it("is taken back by Ångra, also from a child when an adult undoes it, and earned again by a new tick", async () => {
    await createChore(f.adult, once("Diska"));
    await createChore(f.adult, once("Damma"));
    const [t, own] = await open();
    await completeInstance(f.adult, own!.id);
    await completeInstance(f.child, t!.id);

    await uncompleteInstance(f.adult, t!.id);
    expect(await total(f.child)).toBe(0);
    expect(await total(f.adult)).toBe(DEFAULT_COINS);

    await completeInstance(f.child, t!.id);
    expect(await total(f.child)).toBe(DEFAULT_COINS);
  });

  it("is not earned by a tick from before coins existed, and undoing one takes nothing and never goes below 0", async () => {
    await createChore(f.adult, once("Gammal"));
    await createChore(f.adult, once("Ny"));
    const [gammal, ny] = await open();
    await completeInstance(f.child, gammal!.id);
    await db.update(choreInstance).set({ coins: null }).where(eq(choreInstance.id, gammal!.id));
    await completeInstance(f.child, ny!.id);
    expect(await total(f.child)).toBe(DEFAULT_COINS);

    await uncompleteInstance(f.child, gammal!.id);
    expect(await total(f.child)).toBe(DEFAULT_COINS);
    await uncompleteInstance(f.child, ny!.id);
    expect(await total(f.child)).toBe(0);
  });

  it("ignores a coin value the previous release's undo left on an open instance", async () => {
    await createChore(f.adult, once("Diska"));
    const [t] = await open();
    await completeInstance(f.child, t!.id);
    await db
      .update(choreInstance)
      .set({ completedAt: null, completedById: null })
      .where(eq(choreInstance.id, t!.id));
    expect(await total(f.child)).toBe(0);
  });
});

describe("lifetime coins", () => {
  it("count what a member's ticks gave, not other members' or other homes'", async () => {
    await createChore(f.adult, once("Diska", { coins: "30" }));
    await createChore(f.adult, once("Damma", { coins: "20" }));
    const [diska, damma] = await open();
    await completeInstance(f.child, diska!.id);
    await completeInstance(f.adult, damma!.id);
    expect(await getLifetimeCoins(f.child)).toBe(30);
    expect(await getLifetimeCoins(f.adult)).toBe(20);
    expect(await getLifetimeCoins(f.neighbour)).toBe(0);
  });

  it("lose a tick that is undone, and count a tick from before coins existed as nothing", async () => {
    await createChore(f.adult, once("Diska", { coins: "30" }));
    await createChore(f.adult, once("Damma", { coins: "20" }));
    const [diska, damma] = await open();
    await completeInstance(f.child, diska!.id);
    await completeInstance(f.child, damma!.id);
    await db.update(choreInstance).set({ coins: null }).where(eq(choreInstance.id, damma!.id));
    expect(await getLifetimeCoins(f.child)).toBe(30);
    await uncompleteInstance(f.child, diska!.id);
    expect(await getLifetimeCoins(f.child)).toBe(0);
  });
});

describe("what a task gives", () => {
  const total = getCoinTotal;
  const editWith = async (coins?: string, who = f.adult) => {
    const [current] = await open();
    return editChore(who, current!.id, {
      title: current!.title,
      roomId: f.kitchen.id,
      kind: "once",
      ...(coins !== undefined && { coins }),
    });
  };

  it("is 10 for a new task, and the list shows it", async () => {
    await createChore(f.adult, once("Diska"));
    expect((await open())[0]!.coins).toBe(10);
  });

  it("is set when a task is added, 0 to 100, and a tick earns exactly that", async () => {
    await createChore(f.adult, once("Putsa", { coins: "35" }));
    await createChore(f.adult, once("Damma", { coins: "0" }));
    const rows = await open();
    expect(rows.map((r) => [r.title, r.coins])).toEqual([
      ["Putsa", 35],
      ["Damma", 0],
    ]);
    await completeInstance(f.child, rows[0]!.id);
    await completeInstance(f.child, rows[1]!.id);
    expect(await total(f.child)).toBe(35);
  });

  it("refuses an amount outside 0 to 100", async () => {
    await expect(createChore(f.adult, once("x", { coins: "101" }))).rejects.toThrow("mellan 0 och 100");
    await expect(createChore(f.adult, once("x", { coins: "-1" }))).rejects.toThrow("mellan 0 och 100");
    expect(await open()).toHaveLength(0);
  });

  it("changes from the next tick on, for a recurring task every time, and ↺ takes back what that tick gave", async () => {
    await createChore(f.adult, weekly("Dammsuga", { coins: "20" }));
    await completeInstance(f.child, (await open())[0]!.id);
    expect(await total(f.child)).toBe(20);

    await editChore(f.adult, (await open())[0]!.id, {
      title: "Dammsuga",
      roomId: f.kitchen.id,
      kind: "recurring",
      interval: "1",
      unit: "week",
      coins: "45",
    });
    expect((await open())[0]!.coins).toBe(45);
    expect(await total(f.child)).toBe(20);

    await completeInstance(f.child, (await open())[0]!.id);
    expect(await total(f.child)).toBe(65);
    await completeInstance(f.child, (await open())[0]!.id);
    expect(await total(f.child)).toBe(110);

    // The first tick earned 20; undoing the latest (45) takes back 45, not the first's 20.
    const done = await listRecentlyCompleted(f.adult);
    expect(done.map((d) => d.coins).sort()).toEqual([20, 45, 45]);
    await uncompleteInstance(f.child, done.find((d) => d.isLatestTick)!.id);
    expect(await total(f.child)).toBe(65);
  });

  it("is left alone by an edit that gives no amount", async () => {
    await createChore(f.adult, once("Putsa", { coins: "35" }));
    await editWith(undefined);
    expect((await open())[0]!.coins).toBe(35);
    await editWith("");
    expect((await open())[0]!.coins).toBe(35);
  });

  it("shows a done row what its tick gave, and nothing for a tick from before coins existed", async () => {
    await createChore(f.adult, once("Ny", { coins: "30" }));
    await createChore(f.adult, once("Gammal"));
    const [ny, gammal] = await open();
    await completeInstance(f.child, ny!.id);
    await completeInstance(f.child, gammal!.id);
    await db.update(choreInstance).set({ coins: null }).where(eq(choreInstance.id, gammal!.id));
    const done = await listRecentlyCompleted(f.adult);
    expect(done.map((d) => [d.title, d.coins]).sort()).toEqual([
      ["Gammal", null],
      ["Ny", 30],
    ]);
  });

  it("is for adults only: a child can neither add nor change an amount", async () => {
    await expect(createChore(f.child, once("Godis", { coins: "100" }))).rejects.toThrow(ForbiddenError);
    await createChore(f.adult, once("Diska"));
    await expect(editWith("100", f.child)).rejects.toThrow(ForbiddenError);
    expect((await open())[0]!.coins).toBe(10);
  });
});
