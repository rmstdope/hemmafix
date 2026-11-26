import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { chore, choreInstance, dailyChest, household, membership } from "@/db/schema";
import { addDays, todayIso } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import { DEFAULT_COINS } from "@/lib/coins";
import { ForbiddenError } from "@/lib/permissions";
import { nextDueDate } from "@/lib/recurrence";
import { bringDueToday, createFamily } from "../../test/integration/factories";
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
  getStreak,
  listCompletedBy,
  listOpenInstances,
  listRecentlyCompleted,
  openChest,
  postponeInstance,
  uncompleteInstance,
  undoPostpone,
} from "./chores";
import { addRoom, deleteRoom, listRooms } from "./household";
import { buyLook, getLooks } from "./looks";

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

describe("completeInstance before a repeating chore's day", () => {
  const daily = (title: string, extra: Record<string, string> = {}) => weekly(title, { unit: "day", ...extra });
  /** A daily chore ticked today, which leaves tomorrow's instance open. */
  const tomorrows = async (title = "Diska", extra: Record<string, string> = {}) => {
    await createChore(f.adult, daily(title, extra));
    const [first] = await openOf(title);
    await completeInstance(f.adult, first!.id, { offerChest: false });
    const [next] = await openOf(title);
    expect(next!.dueDate).toBe(addDays(todayIso(), 1));
    return next!;
  };

  it("refuses a child, with the day it opens, and writes nothing", async () => {
    const next = await tomorrows();
    const before = await getCoinTotal(f.child);

    await expect(completeInstance(f.child, next.id)).rejects.toThrow(new UserError("Diska kan bockas av imorgon."));

    expect((await openOf("Diska")).map((i) => i.id)).toEqual([next.id]);
    expect(await getCoinTotal(f.child)).toBe(before);
  });

  it("names the day when it is further ahead", async () => {
    await createChore(f.adult, daily("Diska", { startDate: addDays(todayIso(), 3) }));
    const [far] = await openOf("Diska");
    await expect(completeInstance(f.child, far!.id)).rejects.toThrow(/^Diska kan bockas av \S{3} \d+ \S+\.$/);
  });

  it("lets an adult tick it for 0 coins, no chest and no bonus, and says so", async () => {
    const next = await tomorrows();
    const before = await getCoinTotal(f.adult);

    const report = await completeInstance(f.adult, next.id);

    expect(report.notice).toBe("Diska är klar. Inga mynt, eftersom den inte är dags förrän imorgon.");
    expect(report.chestId).toBeNull();
    expect(await getCoinTotal(f.adult)).toBe(before);
    const [done] = await db.select().from(choreInstance).where(eq(choreInstance.id, next.id));
    expect(done!.coins).toBe(0);
    const [after] = await openOf("Diska");
    expect(after!.dueDate).toBe(addDays(todayIso(), 1));
  });

  it("undoes an early tick with no question and no change of balance", async () => {
    const next = await tomorrows();
    await completeInstance(f.adult, next.id);
    const before = await getCoinTotal(f.adult);
    expect(await uncompleteInstance(f.adult, next.id)).toBeUndefined();
    expect(await getCoinTotal(f.adult)).toBe(before);
  });

  it("leaves a one-off chore with a future day unchanged: full coins, for a child too", async () => {
    await createChore(f.adult, once("Köp mjölk", { dueDate: addDays(todayIso(), 2) }));
    const [t] = await openOf("Köp mjölk");
    const before = await getCoinTotal(f.child);
    const report = await completeInstance(f.child, t!.id, { offerChest: false });
    expect(report.notice).toBeNull();
    expect(await getCoinTotal(f.child)).toBe(before + DEFAULT_COINS);
  });

  it("pays in full once its day has come", async () => {
    const next = await tomorrows();
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date(`${next.dueDate}T12:00:00Z`));
      const before = await getCoinTotal(f.child);
      const report = await completeInstance(f.child, next.id, { offerChest: false });
      expect(report.notice).toBeNull();
      expect(await getCoinTotal(f.child)).toBe(before + DEFAULT_COINS);
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("uncompleteInstance when the coins are spent", () => {
  /** Bo ticks a task worth `coins`; returns its instance id. */
  const tickAs = async (who: typeof f.child, title: string, coins: number) => {
    await createChore(f.adult, { ...once(title), coins: String(coins) });
    const [t] = await openOf(title);
    await completeInstance(who, t!.id, { offerChest: false });
    return t!.id;
  };

  it("undoes at once, with no question, while the balance stays at 0 or above", async () => {
    const id = await tickAs(f.child, "Damma", 100);
    expect(await uncompleteInstance(f.child, id)).toBeUndefined();
    expect(await getCoinTotal(f.child)).toBe(0);
  });

  it("undoes at once when it ends at exactly 0", async () => {
    await tickAs(f.child, "A", 100);
    const id = await tickAs(f.child, "B", 100);
    await buyLook(f.child, "coin", "silver");
    expect(await getCoinTotal(f.child)).toBe(100);
    expect(await uncompleteInstance(f.child, id)).toBeUndefined();
    expect(await getCoinTotal(f.child)).toBe(0);
  });

  it("asks instead of undoing when the coins are spent, and writes nothing", async () => {
    const id = await tickAs(f.child, "Damma", 100);
    await buyLook(f.child, "coin", "silver");
    expect(await getCoinTotal(f.child)).toBe(0);

    expect(await uncompleteInstance(f.child, id)).toEqual({ confirm: { own: true, name: "Bo", balance: -100 } });
    expect(await getCoinTotal(f.child)).toBe(0);
    expect((await listRecentlyCompleted(f.adult)).map((i) => i.id)).toContain(id);
  });

  it("undoes into debt once confirmed, and the look stays owned", async () => {
    const id = await tickAs(f.child, "Damma", 100);
    await buyLook(f.child, "coin", "silver");

    expect(await uncompleteInstance(f.child, id, { confirmDebt: true })).toEqual({ debt: { balance: -100, name: "Bo", own: true } });
    expect(await getCoinTotal(f.child)).toBe(-100);
    expect((await getLooks(f.child)).owned).toEqual(["coin:silver"]);
    expect((await openOf("Damma"))[0]!.completedAt).toBeNull();
  });

  it("names the person when an adult undoes their tick, from that person's balance", async () => {
    await tickAs(f.child, "Liten", 30);
    const id = await tickAs(f.child, "Rummet", 100);
    await buyLook(f.child, "coin", "silver");
    expect(await getCoinTotal(f.child)).toBe(30);

    expect(await uncompleteInstance(f.adult, id)).toEqual({ confirm: { own: false, name: "Bo", balance: -70 } });
  });

  it("asks again, with the new end number, while already below zero", async () => {
    const a = await tickAs(f.child, "A", 100);
    const b = await tickAs(f.child, "B", 50);
    await buyLook(f.child, "coin", "silver");
    expect(await uncompleteInstance(f.child, a, { confirmDebt: true })).toEqual({
      debt: { own: true, name: "Bo", balance: -50 },
    });
    expect(await uncompleteInstance(f.child, b)).toEqual({ confirm: { own: true, name: "Bo", balance: -100 } });
  });

  it("does not ask about a tick that gave no coins, even while below zero", async () => {
    const a = await tickAs(f.child, "A", 100);
    await buyLook(f.child, "coin", "silver");
    const free = await tickAs(f.child, "Gratis", 0);
    await uncompleteInstance(f.child, a, { confirmDebt: true });
    expect(await getCoinTotal(f.child)).toBe(-100);
    expect(await uncompleteInstance(f.child, free)).toBeUndefined();
    expect(await getCoinTotal(f.child)).toBe(-100);
  });

  it("never refuses a confirmed undo, even when the balance has recovered", async () => {
    const id = await tickAs(f.child, "Damma", 100);
    await tickAs(f.child, "Mer", 100);
    expect(await uncompleteInstance(f.child, id, { confirmDebt: true })).toBeUndefined();
    expect(await getCoinTotal(f.child)).toBe(100);
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

describe("postponeInstance", () => {
  const SAVE_FAILED = "Det gick inte att spara. Försök igen.";
  const inDays = (n: number) => addDays(todayIso(), n);
  /** A task due `days` from today, and its open instance. */
  const dueIn = async (days: number, input = weekly("Dammsuga")) => {
    const { id } = await createChore(f.adult, input);
    await db.update(choreInstance).set({ dueDate: inDays(days) }).where(eq(choreInstance.choreId, id));
    const [instance] = await instancesOf(id);
    return { choreId: id, id: instance!.id };
  };
  const dueDateOf = async (choreId: string) => (await instancesOf(choreId)).find((i) => !i.completedAt)?.dueDate;

  it.each([-3, 0, 4])("moves a task due %i days from today to a later day", async (days) => {
    const t = await dueIn(days);

    const { postponed } = await postponeInstance(f.adult, t.id, inDays(6));

    expect(postponed.from).toBe(inDays(days));
    expect(await dueDateOf(t.choreId)).toBe(inDays(6));
  });

  it("keeps a recurring task's rhythm from the day it is done, and pays nothing before the new day", async () => {
    const t = await dueIn(0);
    await postponeInstance(f.adult, t.id, inDays(2));

    await expect(completeInstance(f.child, t.id)).rejects.toThrow("kan bockas av");
    await bringDueToday(f.homeId);
    await completeInstance(f.adult, t.id);

    expect(await dueDateOf(t.choreId)).toBe(nextDueDate(todayIso(), { unit: "week", interval: 1 }));
  });

  it("is refused for a child, and for someone in another home", async () => {
    const t = await dueIn(0);
    await expect(postponeInstance(f.child, t.id, inDays(2))).rejects.toThrow(ForbiddenError);
    await expect(postponeInstance(f.neighbour, t.id, inDays(2))).rejects.toThrow("Uppgiften finns inte längre");
    expect(await dueDateOf(t.choreId)).toBe(todayIso());
  });

  it.each([
    [-3, 0],
    [-3, -1],
    [0, 0],
    [4, 4],
    [4, 2],
  ])("refuses to move a task due in %i days to %i days from today", async (due, to) => {
    const t = await dueIn(due);

    await expect(postponeInstance(f.adult, t.id, inDays(to))).rejects.toThrow(SAVE_FAILED);
    expect(await dueDateOf(t.choreId)).toBe(inDays(due));
  });

  it("refuses a task without a day, and a day that is not one", async () => {
    await createChore(f.adult, once("Laga lampan"));
    const [lamp] = await openOf("Laga lampan");

    await expect(postponeInstance(f.adult, lamp!.id, inDays(2))).rejects.toThrow(SAVE_FAILED);
    await expect(postponeInstance(f.adult, lamp!.id, "2026-02-30")).rejects.toThrow("Ogiltigt datum");
  });

  it("says when the task was ticked off or removed meanwhile", async () => {
    const done = await dueIn(0);
    await completeInstance(f.adult, done.id);
    await expect(postponeInstance(f.adult, done.id, inDays(2))).rejects.toThrow("Någon har redan bockat av den");

    const removed = await dueIn(0, weekly("Damma"));
    await deleteChore(f.adult, removed.choreId);
    await expect(postponeInstance(f.adult, removed.id, inDays(2))).rejects.toThrow("Uppgiften finns inte längre");
  });

  it("can be undone, back to a day that has passed", async () => {
    const t = await dueIn(-3);
    const { postponed } = await postponeInstance(f.adult, t.id, inDays(2));

    await undoPostpone(f.adult, t.id, { to: postponed.from, version: postponed.version });

    expect(await dueDateOf(t.choreId)).toBe(inDays(-3));
  });

  it("is not undone by a child, to a later day, or twice", async () => {
    const t = await dueIn(0);
    const { postponed } = await postponeInstance(f.adult, t.id, inDays(2));
    const back = { to: postponed.from, version: postponed.version };

    await expect(undoPostpone(f.child, t.id, back)).rejects.toThrow(ForbiddenError);
    await expect(undoPostpone(f.adult, t.id, { ...back, to: inDays(5) })).rejects.toThrow(SAVE_FAILED);
    expect(await dueDateOf(t.choreId)).toBe(inDays(2));
    await undoPostpone(f.adult, t.id, back);
    await expect(undoPostpone(f.adult, t.id, back)).rejects.toThrow(SAVE_FAILED);
  });

  it.each<[string, (t: { choreId: string; id: string }) => Promise<unknown>]>([
    ["moved again", (t) => postponeInstance(f.adult, t.id, inDays(5))],
    ["given to someone", (t) => assignInstance(f.adult, t.id, f.child.userId)],
    ["given to someone every time", (t) => assignChore(f.adult, t.choreId, f.child.userId)],
    ["edited", (t) => editChore(f.adult, t.id, weekly("Dammsuga trappan", { dueDate: inDays(2) }))],
    ["ticked off", (t) => completeInstance(f.adult, t.id)],
    ["removed", (t) => deleteChore(f.adult, t.choreId)],
  ])("is not undone once the task has been %s", async (_, change) => {
    const t = await dueIn(0);
    const { postponed } = await postponeInstance(f.adult, t.id, inDays(2));
    await change(t);
    const before = await instancesOf(t.choreId);

    await expect(undoPostpone(f.adult, t.id, { to: postponed.from, version: postponed.version })).rejects.toThrow(
      SAVE_FAILED,
    );
    expect(await instancesOf(t.choreId)).toEqual(before);
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

  it("gives each tick-off the coins that tick gave, and none for a tick from before coins existed", async () => {
    const diska = await tick("Diska", f.child);
    const old = await tick("Gammal", f.child);
    await setDoneAt(diska.instanceId, new Date(Date.now() - 60_000));
    await db.update(choreInstance).set({ coins: null }).where(eq(choreInstance.id, old.instanceId));
    await setDoneAt(old.instanceId, new Date(Date.now() - 2 * 60_000));
    await db.update(choreInstance).set({ coins: 7 }).where(eq(choreInstance.id, diska.instanceId));

    const rows = await listCompletedBy(f.child, f.child.userId, 30);
    expect(rows.map((d) => [d.title, d.coins])).toEqual([
      ["Diska", 7],
      ["Gammal", null],
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
    await bringDueToday(f.adult.householdId);
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
    await bringDueToday(f.adult.householdId);
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

    await bringDueToday(f.adult.householdId);
    await completeInstance(f.child, (await open())[0]!.id);
    expect(await total(f.child)).toBe(65);
    await bringDueToday(f.adult.householdId);
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

describe("daily chest", () => {
  const total = getCoinTotal;
  const chestsOf = (userId: string) => db.select().from(dailyChest).where(eq(dailyChest.userId, userId));

  it("is offered by the first coin-giving tick of the day, and not by the second", async () => {
    await createChore(f.adult, once("Diska"));
    await createChore(f.adult, once("Damma"));
    const [a, b] = await open();
    const first = await completeInstance(f.child, a!.id);
    const second = await completeInstance(f.child, b!.id);
    expect(first.chestId).toEqual(expect.any(String));
    expect(first.chestCoins).toBeGreaterThanOrEqual(5);
    expect(first.chestCoins).toBeLessThanOrEqual(10);
    expect(second).toMatchObject({ chestId: null, chestCoins: null });
    expect(await chestsOf(f.child.userId)).toHaveLength(1);
  });

  it("is not offered by a task worth 0 coins, which leaves the day's chest for the next tick", async () => {
    await createChore(f.adult, once("Gratis", { coins: "0" }));
    await createChore(f.adult, once("Diska"));
    const [free, diska] = await open();
    expect((await completeInstance(f.child, free!.id)).chestId).toBeNull();
    expect((await completeInstance(f.child, diska!.id)).chestId).toEqual(expect.any(String));
  });

  it("stays when the tick is undone, and ticking again the same day gives no second chest", async () => {
    await createChore(f.adult, once("Diska"));
    const [t] = await open();
    await completeInstance(f.child, t!.id);
    await uncompleteInstance(f.child, t!.id);
    expect(await chestsOf(f.child.userId)).toHaveLength(1);
    expect((await completeInstance(f.child, t!.id)).chestId).toBeNull();
  });

  it("is not made by a tick that asks for none, as the MCP tools do, and is still offered to the next tick", async () => {
    await createChore(f.adult, once("Diska"));
    await createChore(f.adult, once("Damma"));
    const [a, b] = await open();
    expect(await completeInstance(f.child, a!.id, { offerChest: false })).toMatchObject({ chestId: null, chestCoins: null });
    expect(await chestsOf(f.child.userId)).toHaveLength(0);
    expect((await completeInstance(f.child, b!.id)).chestId).not.toBeNull();
  });

  it("is each person's own", async () => {
    await createChore(f.adult, once("Diska"));
    await createChore(f.adult, once("Damma"));
    const [a, b] = await open();
    expect((await completeInstance(f.child, a!.id)).chestId).not.toBeNull();
    expect((await completeInstance(f.adult, b!.id)).chestId).not.toBeNull();
  });

  it("gives 5 to 10 coins once opened, and nothing before", async () => {
    await createChore(f.adult, once("Diska"));
    const [t] = await open();
    const { chestId, chestCoins } = await completeInstance(f.child, t!.id);
    expect(await total(f.child)).toBe(DEFAULT_COINS);

    const coins = await openChest(f.child, chestId!);
    expect(coins).toBe(chestCoins);
    expect(await total(f.child)).toBe(DEFAULT_COINS + coins);
    expect(await total(f.adult)).toBe(0);
  });

  it("is credited once however often it is opened, and stays after the tick is undone", async () => {
    await createChore(f.adult, once("Diska"));
    const [t] = await open();
    const { chestId } = await completeInstance(f.child, t!.id);
    const coins = await openChest(f.child, chestId!);
    expect(await openChest(f.child, chestId!)).toBe(coins);
    await uncompleteInstance(f.child, t!.id);
    expect(await total(f.child)).toBe(coins);
  });

  it("is credited without being opened once its day has passed", async () => {
    await db.insert(dailyChest).values({
      householdId: f.adult.householdId,
      userId: f.child.userId,
      day: addDays(todayIso(), -1),
      coins: 8,
    });
    expect(await total(f.child)).toBe(8);
  });

  it("is offered again the next day", async () => {
    await db.insert(dailyChest).values({
      householdId: f.adult.householdId,
      userId: f.child.userId,
      day: addDays(todayIso(), -1),
      coins: 8,
    });
    await createChore(f.adult, once("Diska"));
    const [t] = await open();
    expect((await completeInstance(f.child, t!.id)).chestId).not.toBeNull();
  });

  it("cannot be opened by someone else, or when it does not exist", async () => {
    await createChore(f.adult, once("Diska"));
    const [t] = await open();
    const { chestId } = await completeInstance(f.child, t!.id);
    await expect(openChest(f.adult, chestId!)).rejects.toThrow(UserError);
    await expect(openChest(f.child, "00000000-0000-4000-8000-000000000000")).rejects.toThrow(UserError);
    await expect(openChest(f.child, "nonsense")).rejects.toThrow();
  });
});

describe("streaks", () => {
  const today = () => todayIso();
  let n = 0;

  /** A tick by `actor` on `day`, made as if long ago: it counts as a streak day and gave 10. */
  async function tickedOn(actor: typeof f.child, day: string) {
    const title = `Gammal ${n++}`;
    await createChore(f.adult, once(title));
    const [t] = await openOf(title);
    await completeInstance(actor, t!.id);
    await db
      .update(choreInstance)
      .set({ tickedOn: day, completedAt: new Date(`${day}T12:00:00Z`), coins: 10 })
      .where(eq(choreInstance.id, t!.id));
  }
  const daysBack = async (actor: typeof f.child, count: number, from = 1) => {
    for (let i = from; i < from + count; i++) await tickedOn(actor, addDays(today(), -i));
  };
  /** Ticks a fresh 10-coin task now and returns what the tick gave. */
  async function tickNow(actor: typeof f.child, title = `Ny ${n++}`) {
    await createChore(f.adult, once(title));
    const [t] = await openOf(title);
    await completeInstance(actor, t!.id);
    const [row] = await db.select().from(choreInstance).where(eq(choreInstance.id, t!.id));
    return { id: t!.id, coins: row!.coins, tickedOn: row!.tickedOn };
  }

  it("is 0 for someone who has not ticked anything", async () => {
    expect(await getStreak(f.child)).toEqual({ run: 0, ticked: false });
  });

  it("makes today a day, with no bonus on the first", async () => {
    const tick = await tickNow(f.child);
    expect(tick).toMatchObject({ coins: 10, tickedOn: today() });
    expect(await getStreak(f.child)).toEqual({ run: 1, ticked: true });
  });

  it("gives nothing extra on day 3", async () => {
    await daysBack(f.child, 2);
    expect((await tickNow(f.child)).coins).toBe(10);
  });

  it("gives +10 % on day 4, rounded up", async () => {
    await daysBack(f.child, 3);
    expect((await tickNow(f.child)).coins).toBe(11);
  });

  it("gives +20 % from day 7, rounded up", async () => {
    await daysBack(f.child, 6);
    expect((await tickNow(f.child)).coins).toBe(12);
  });

  it("never raises a chest's coins", async () => {
    await createChore(f.adult, once("Diska"));
    const [t] = await open();
    await daysBack(f.child, 6); // each seeding tick takes today's chest first
    await db.delete(dailyChest);
    const done = await completeInstance(f.child, t!.id);
    expect(done.chestCoins).toBeGreaterThanOrEqual(5);
    expect(done.chestCoins).toBeLessThanOrEqual(10);
  });

  it("keeps the same bonus for the next ticks of the same day", async () => {
    await daysBack(f.child, 3);
    expect((await tickNow(f.child)).coins).toBe(11);
    expect((await tickNow(f.child)).coins).toBe(11);
    expect(await getStreak(f.child)).toEqual({ run: 4, ticked: true });
  });

  it("lives through a day without a tick yet, so the first tick of the day gets the next day's bonus", async () => {
    await daysBack(f.child, 3);
    expect(await getStreak(f.child)).toEqual({ run: 3, ticked: false });
    expect((await tickNow(f.child)).coins).toBe(11);
  });

  it("breaks after a full day without a tick", async () => {
    await daysBack(f.child, 5, 2);
    expect(await getStreak(f.child)).toEqual({ run: 0, ticked: false });
    expect((await tickNow(f.child)).coins).toBe(10);
    expect(await getStreak(f.child)).toEqual({ run: 1, ticked: true });
  });

  it("does not count ticks from before streaks existed", async () => {
    const old = await tickNow(f.child);
    await db.update(choreInstance).set({ tickedOn: null }).where(eq(choreInstance.id, old.id));
    expect(await getStreak(f.child)).toEqual({ run: 0, ticked: false });
  });

  it("counts for the person who ticked, not for the rest of the home", async () => {
    await tickNow(f.child);
    expect(await getStreak(f.adult)).toEqual({ run: 0, ticked: false });
  });

  it("counts a task worth 0 coins as a day", async () => {
    await createChore(f.adult, once("Noll", { coins: "0" }));
    const [t] = await openOf("Noll");
    await completeInstance(f.child, t!.id);
    expect(await getStreak(f.child)).toEqual({ run: 1, ticked: true });
  });

  it("undoing the only tick of today takes today back, and takes back exactly the coins it gave", async () => {
    await daysBack(f.child, 3);
    const before = await getCoinTotal(f.child);
    const tick = await tickNow(f.child);
    expect(await getCoinTotal(f.child)).toBe(before + 11);

    await uncompleteInstance(f.child, tick.id);

    expect(await getStreak(f.child)).toEqual({ run: 3, ticked: false });
    expect(await getCoinTotal(f.child)).toBe(before);
    expect((await db.select().from(choreInstance).where(eq(choreInstance.id, tick.id)))[0]!.tickedOn).toBeNull();
  });

  it("takes a child's day and coins from the child, not the adult, when an adult undoes their tick", async () => {
    await daysBack(f.child, 3);
    const tick = await tickNow(f.child);
    await tickNow(f.adult);
    const before = await getCoinTotal(f.child);

    await uncompleteInstance(f.adult, tick.id);

    expect(await getStreak(f.child)).toEqual({ run: 3, ticked: false });
    expect(await getCoinTotal(f.child)).toBe(before - 11);
    expect(await getStreak(f.adult)).toEqual({ run: 1, ticked: true });
  });

  it("keeps today when one of two ticks is undone", async () => {
    const a = await tickNow(f.child);
    await tickNow(f.child);
    await uncompleteInstance(f.child, a.id);
    expect(await getStreak(f.child)).toEqual({ run: 1, ticked: true });
  });

  it("goes by the Europe/Stockholm day around midnight", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    try {
      vi.setSystemTime(new Date("2026-01-14T23:30:00Z")); // 00:30 on the 15th in Stockholm
      expect((await tickNow(f.child)).tickedOn).toBe("2026-01-15");
    } finally {
      vi.useRealTimers();
    }
  });
});
