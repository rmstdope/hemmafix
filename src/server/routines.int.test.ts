import { eq, sql } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { chore, choreInstance, household, routine } from "@/db/schema";
import { ForbiddenError } from "@/lib/permissions";
import { READY_MADE_ROUTINES } from "@/lib/ready-made-routines";
import { createFamily } from "../../test/integration/factories";
import {
  addRoutineTask,
  addRoutineToHome,
  listRoutinesWithTasks,
  createRoutine,
  deleteRoutine,
  getRoutine,
  listRoutines,
  removeRoutineTask,
  renameRoutine,
  updateRoutineTask,
} from "./routines";

let f: Awaited<ReturnType<typeof createFamily>>;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
});

/** A home's routines without the ready-made ones, which have their own tests. */
const clearReadyMade = async () => {
  for (const r of await listRoutines(f.adult)) await deleteRoutine(f.adult, r.id);
};
const titles = async (id: string) => (await getRoutine(f.adult, id))!.tasks.map((t) => t.title);

describe("ready-made routines", () => {
  it("are given to a home once, with the agreed tasks in order", async () => {
    const routines = await listRoutines(f.adult);
    expect(routines.map((r) => [r.name, r.taskCount])).toEqual([
      ["Städa badrum", 5],
      ["Städa kök", 6],
      ["Städa sovrum", 4],
    ]);
    for (const [i, r] of routines.entries()) {
      expect(await titles(r.id)).toEqual(READY_MADE_ROUTINES[i]!.tasks);
    }
    expect((await listRoutines(f.adult)).length).toBe(3);
  });

  it("never come back once changed or removed", async () => {
    const [bath, kitchen] = await listRoutines(f.adult);
    await deleteRoutine(f.adult, bath!.id);
    await renameRoutine(f.adult, kitchen!.id, "Köket");
    const names = (await listRoutines(f.adult)).map((r) => r.name);
    expect(names).toEqual(["Köket", "Städa sovrum"]);
    await clearReadyMade();
    expect(await listRoutines(f.adult)).toEqual([]);
  });

  it("are seeded once even when two adults open the page at the same time", async () => {
    await Promise.all([listRoutines(f.adult), listRoutines(f.adult), listRoutines(f.adult)]);
    expect((await listRoutines(f.adult)).length).toBe(3);
  });

  it("go to each home on its own, and an existing home gets them too", async () => {
    // The factory's homes exist without ever having been given the routines.
    expect((await listRoutines(f.neighbour)).length).toBe(3);
    expect((await db.select().from(routine)).length).toBe(3);
    expect((await listRoutines(f.adult)).length).toBe(3);
    expect((await db.select().from(routine)).length).toBe(6);
  });
});

describe("routines", () => {
  beforeEach(async () => {
    await listRoutines(f.adult);
    await clearReadyMade();
  });

  it("are created, listed in creation order with their task counts, renamed and deleted", async () => {
    const a = await createRoutine(f.adult, "  Städa hall ");
    const b = await createRoutine(f.adult, "Tvätta");
    await addRoutineTask(f.adult, a.id, "Moppa");
    expect(await listRoutines(f.adult)).toEqual([
      { id: a.id, name: "Städa hall", taskCount: 1 },
      { id: b.id, name: "Tvätta", taskCount: 0 },
    ]);
    await renameRoutine(f.adult, a.id, "Hallen");
    expect((await getRoutine(f.adult, a.id))!.name).toBe("Hallen");
    await deleteRoutine(f.adult, a.id);
    expect(await getRoutine(f.adult, a.id)).toBeNull();
    await deleteRoutine(f.adult, a.id); // already gone: nothing to do
    expect((await listRoutines(f.adult)).map((r) => r.name)).toEqual(["Tvätta"]);
  });

  it("have unique names whatever the case, and the message names the existing one", async () => {
    const a = await createRoutine(f.adult, "Städa hall");
    await expect(createRoutine(f.adult, "STÄDA HALL")).rejects.toThrow("Det finns redan en rutin som heter Städa hall");
    const b = await createRoutine(f.adult, "Tvätta");
    await expect(renameRoutine(f.adult, b.id, "städa hall")).rejects.toThrow(
      "Det finns redan en rutin som heter Städa hall",
    );
    await renameRoutine(f.adult, a.id, "STÄDA HALL"); // its own name in another case is fine
    // Another home may use the same name.
    await clearNeighbour();
    await createRoutine(f.neighbour, "Tvätta");
  });

  it("two renames to one name at once leave one, with the friendly message", async () => {
    const a = await createRoutine(f.adult, "A");
    const b = await createRoutine(f.adult, "B");
    const results = await Promise.allSettled([renameRoutine(f.adult, a.id, "Samma"), renameRoutine(f.adult, b.id, "samma")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toContain(
      "Det finns redan en rutin som heter",
    );
  });

  it("refuse an empty name and one over 40 characters", async () => {
    await expect(createRoutine(f.adult, "   ")).rejects.toThrow("Skriv rutinens namn");
    await expect(createRoutine(f.adult, "x".repeat(41))).rejects.toThrow("Max 40 tecken");
    await createRoutine(f.adult, "x".repeat(40));
  });

  it("two creations of one name at once leave one", async () => {
    const results = await Promise.allSettled([createRoutine(f.adult, "Nytt"), createRoutine(f.adult, "nytt")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect(String((results.find((r) => r.status === "rejected") as PromiseRejectedResult).reason)).toContain(
      "Det finns redan en rutin som heter",
    );
  });
});

describe("tasks in a routine", () => {
  let id: string;
  beforeEach(async () => {
    await listRoutines(f.adult);
    await clearReadyMade();
    id = (await createRoutine(f.adult, "Städa hall")).id;
  });

  it("keep the order they were added in, and are changed and removed", async () => {
    await addRoutineTask(f.adult, id, "  Moppa ");
    await addRoutineTask(f.adult, id, "Damma");
    await addRoutineTask(f.adult, id, "Dammsuga");
    const [, damma] = (await getRoutine(f.adult, id))!.tasks;
    await updateRoutineTask(f.adult, id, damma!.id, "Torka");
    expect(await titles(id)).toEqual(["Moppa", "Torka", "Dammsuga"]);
    await removeRoutineTask(f.adult, id, damma!.id);
    await removeRoutineTask(f.adult, id, damma!.id); // already gone
    expect(await titles(id)).toEqual(["Moppa", "Dammsuga"]);
  });

  it("refuse a duplicate in the same routine, any case, but not in another routine", async () => {
    await addRoutineTask(f.adult, id, "Moppa");
    await expect(addRoutineTask(f.adult, id, "moppa")).rejects.toThrow("moppa finns redan i rutinen");
    await addRoutineTask(f.adult, id, "Damma");
    const [, damma] = (await getRoutine(f.adult, id))!.tasks;
    await expect(updateRoutineTask(f.adult, id, damma!.id, "MOPPA")).rejects.toThrow("MOPPA finns redan i rutinen");
    await updateRoutineTask(f.adult, id, damma!.id, "DAMMA"); // its own title in another case
    const other = await createRoutine(f.adult, "Annat");
    await addRoutineTask(f.adult, other.id, "Moppa");
  });

  it("refuse an empty task and one over 200 characters", async () => {
    await expect(addRoutineTask(f.adult, id, " ")).rejects.toThrow("Skriv vad som ska göras");
    await expect(addRoutineTask(f.adult, id, "x".repeat(201))).rejects.toThrow("Max 200 tecken");
    await addRoutineTask(f.adult, id, "x".repeat(200));
  });

  it("hold at most 30, even when two are added at the same time", async () => {
    for (let i = 1; i <= 29; i++) await addRoutineTask(f.adult, id, `Uppgift ${i}`);
    const results = await Promise.allSettled([addRoutineTask(f.adult, id, "A"), addRoutineTask(f.adult, id, "B")]);
    expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
    expect((await titles(id)).length).toBe(30);
    await expect(addRoutineTask(f.adult, id, "En till")).rejects.toThrow("En rutin kan ha högst 30 uppgifter");
  });

  it("cannot be changed once removed", async () => {
    const task = await addRoutineTask(f.adult, id, "Moppa");
    await removeRoutineTask(f.adult, id, task.id);
    await expect(updateRoutineTask(f.adult, id, task.id, "Ny")).rejects.toThrow("Uppgiften finns inte längre.");
    await expect(updateRoutineTask(f.adult, id, "inte-ett-id", "Ny")).rejects.toThrow("Uppgiften finns inte längre.");
  });

  it("cannot be added to a routine that is gone", async () => {
    await deleteRoutine(f.adult, id);
    await expect(addRoutineTask(f.adult, id, "Moppa")).rejects.toThrow("Den här rutinen finns inte längre.");
    await expect(renameRoutine(f.adult, id, "Ny")).rejects.toThrow("Den här rutinen finns inte längre.");
    await removeRoutineTask(f.adult, id, "6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70"); // nothing to do
  });
});

describe("who may", () => {
  it("only adults, in their own home", async () => {
    await listRoutines(f.adult);
    await clearReadyMade();
    const mine = await createRoutine(f.adult, "Min");
    const task = await addRoutineTask(f.adult, mine.id, "Moppa");
    const childCalls = [
      () => listRoutines(f.child),
      () => getRoutine(f.child, mine.id),
      () => createRoutine(f.child, "Barn"),
      () => renameRoutine(f.child, mine.id, "Barn"),
      () => deleteRoutine(f.child, mine.id),
      () => addRoutineTask(f.child, mine.id, "X"),
      () => updateRoutineTask(f.child, mine.id, task.id, "X"),
      () => removeRoutineTask(f.child, mine.id, task.id),
    ];
    for (const call of childCalls) await expect(call()).rejects.toThrow(ForbiddenError);

    // A neighbour cannot see or change it either.
    expect(await getRoutine(f.neighbour, mine.id)).toBeNull();
    await expect(renameRoutine(f.neighbour, mine.id, "Deras")).rejects.toThrow("finns inte längre");
    await expect(addRoutineTask(f.neighbour, mine.id, "X")).rejects.toThrow("finns inte längre");
    await expect(updateRoutineTask(f.neighbour, mine.id, task.id, "X")).rejects.toThrow("finns inte längre");
    await deleteRoutine(f.neighbour, mine.id);
    await removeRoutineTask(f.neighbour, mine.id, task.id);
    expect(await titles(mine.id)).toEqual(["Moppa"]);
    expect(await getRoutine(f.adult, "inte-ett-id")).toBeNull();
  });

  it("removing the home removes its routines", async () => {
    await listRoutines(f.adult);
    await db.delete(household).where(eq(household.id, f.homeId));
    expect((await db.select().from(routine)).length).toBe(0);
  });
});

async function clearNeighbour() {
  for (const r of await listRoutines(f.neighbour)) await deleteRoutine(f.neighbour, r.id);
}

describe("addRoutineToHome", () => {
  const makeRoutine = async (name: string, taskTitles: string[]) => {
    const { id } = await createRoutine(f.adult, name);
    for (const t of taskTitles) await addRoutineTask(f.adult, id, t);
    return id;
  };
  const added = async () =>
    db
      .select({
        title: chore.title,
        roomId: chore.roomId,
        unit: chore.recurrenceUnit,
        interval: chore.recurrenceInterval,
        assigneeId: chore.assigneeId,
        templateKey: chore.templateKey,
        due: choreInstance.dueDate,
        instanceAssignee: choreInstance.assigneeId,
      })
      .from(chore)
      .innerJoin(choreInstance, eq(choreInstance.choreId, chore.id))
      .orderBy(chore.createdAt, chore.title);

  it("adds every task as its own ordinary task with the chosen cadence, date and person", async () => {
    const id = await makeRoutine("Storstäd", ["Dammsuga", "Moppa", "Damma"]);
    const result = await addRoutineToHome(f.adult, {
      routineId: id,
      roomId: f.kitchen.id,
      kind: "recurring",
      interval: "2",
      unit: "week",
      startDate: "2026-12-01",
      assigneeId: f.child.userId,
    });
    expect(result).toEqual({ count: 3 });
    const rows = await added();
    expect(rows.map((r) => r.title).sort()).toEqual(["Damma", "Dammsuga", "Moppa"]);
    for (const r of rows) {
      expect(r).toMatchObject({
        roomId: f.kitchen.id,
        unit: "week",
        interval: 2,
        assigneeId: f.child.userId,
        instanceAssignee: f.child.userId,
        due: "2026-12-01",
        templateKey: null,
      });
    }
  });

  it("keeps the routine's order on the list", async () => {
    const id = await makeRoutine("Ordning", ["Tre", "Ett", "Fyra", "Två", "Fem"]);
    await addRoutineToHome(f.adult, { routineId: id, roomId: f.kitchen.id, kind: "once" });
    const rows = await db
      .select({ title: chore.title })
      .from(choreInstance)
      .innerJoin(chore, eq(chore.id, choreInstance.choreId))
      .orderBy(choreInstance.createdAt, choreInstance.id);
    expect(rows.map((r) => r.title)).toEqual(["Tre", "Ett", "Fyra", "Två", "Fem"]);
  });

  it("adds one-off tasks with a due date, or none", async () => {
    const id = await makeRoutine("Engång", ["Putsa"]);
    await addRoutineToHome(f.adult, { routineId: id, roomId: f.bathroom.id, kind: "once", dueDate: "2026-12-24" });
    await addRoutineToHome(f.adult, { routineId: id, roomId: f.bathroom.id, kind: "once", dueDate: "" });
    const rows = await added();
    expect(rows.map((r) => r.due).sort()).toEqual(["2026-12-24", null]);
    for (const r of rows) expect([r.unit, r.interval, r.assigneeId]).toEqual([null, null, null]);
  });

  it("adds a task whose name is already in the room, and is not tied to the routine afterwards", async () => {
    const id = await makeRoutine("Städa", ["Dammsuga"]);
    const input = { routineId: id, roomId: f.kitchen.id, kind: "once" };
    await addRoutineToHome(f.adult, input);
    await addRoutineToHome(f.adult, input);
    await renameRoutine(f.adult, id, "Annat");
    await deleteRoutine(f.adult, id);
    expect((await added()).map((r) => r.title)).toEqual(["Dammsuga", "Dammsuga"]);
  });

  it("adds a full routine of 30 tasks", async () => {
    const id = await makeRoutine("Stor", Array.from({ length: 30 }, (_, i) => `Uppgift ${i}`));
    expect(await addRoutineToHome(f.adult, { routineId: id, roomId: f.kitchen.id, kind: "once" })).toEqual({ count: 30 });
    expect((await added()).length).toBe(30);
  });

  it("is for adults, for this home's routines and rooms, and adds nothing when it fails", async () => {
    const id = await makeRoutine("Städa", ["A", "B"]);
    const theirs = await createRoutine(f.neighbour, "Deras");
    await addRoutineTask(f.neighbour, theirs.id, "X");
    const input = { routineId: id, roomId: f.kitchen.id, kind: "once" };
    await expect(addRoutineToHome(f.child, input)).rejects.toThrow(ForbiddenError);
    await expect(addRoutineToHome(f.adult, { ...input, routineId: theirs.id })).rejects.toThrow("Rutinen finns inte längre");
    await expect(
      addRoutineToHome(f.adult, { ...input, routineId: "00000000-0000-4000-8000-000000000000" }),
    ).rejects.toThrow("Rutinen finns inte längre");
    await expect(addRoutineToHome(f.adult, { ...input, roomId: f.garage.id })).rejects.toThrow("Rummet finns inte i hemmet");
    await expect(addRoutineToHome(f.adult, { ...input, assigneeId: f.neighbour.userId })).rejects.toThrow(
      "Personen finns inte i hemmet",
    );
    expect(await added()).toEqual([]);
  });

  it("adds nothing for a routine without tasks", async () => {
    const id = await makeRoutine("Tom", []);
    await expect(addRoutineToHome(f.adult, { routineId: id, roomId: f.kitchen.id, kind: "once" })).rejects.toThrow(
      "Det gick inte att spara",
    );
    expect(await added()).toEqual([]);
  });
});

describe("listRoutinesWithTasks", () => {
  it("lists the home's routines in creation order, each with its tasks in order", async () => {
    await clearReadyMade();
    const a = await createRoutine(f.adult, "Första");
    const b = await createRoutine(f.adult, "Andra");
    await addRoutineTask(f.adult, a.id, "Ett");
    await addRoutineTask(f.adult, a.id, "Två");
    expect(await listRoutinesWithTasks(f.adult)).toEqual([
      { id: a.id, name: "Första", tasks: ["Ett", "Två"] },
      { id: b.id, name: "Andra", tasks: [] },
    ]);
  });

  it("gives a home its ready-made routines and is adults only", async () => {
    expect((await listRoutinesWithTasks(f.adult)).map((r) => r.name)).toEqual(["Städa badrum", "Städa kök", "Städa sovrum"]);
    await expect(listRoutinesWithTasks(f.child)).rejects.toThrow(ForbiddenError);
  });

  it("never lists a routine without its tasks when it is removed during the read", async () => {
    const kitchen = (await listRoutinesWithTasks(f.adult)).find((r) => r.name === "Städa kök")!;
    let read: ReturnType<typeof listRoutinesWithTasks> | undefined;
    await db.transaction(async (tx) => {
      // Hold routine_task, so the read stops where it first needs it, and remove the routine
      // (its tasks go with it) while it waits: a page rendering as another adult removes it.
      await tx.execute(sql`lock table routine_task in access exclusive mode`);
      read = listRoutinesWithTasks(f.adult);
      await waitForLockOn("routine_task");
      await tx.delete(routine).where(eq(routine.id, kitchen.id));
    });
    expect((await read!).map((r) => [r.name, r.tasks.length])).toEqual([
      ["Städa badrum", 5],
      ["Städa sovrum", 4],
    ]);
  });
});

/** Waits until some session is queued for a lock on `table`. */
async function waitForLockOn(table: string) {
  for (let i = 0; i < 200; i++) {
    const waiting = await db.execute(
      sql`select 1 from pg_locks where relation = ${table}::regclass and not granted`,
    );
    if (waiting.length > 0) return;
    await new Promise((resolve) => setTimeout(resolve, 10));
  }
  throw new Error(`nobody waited for a lock on ${table}`);
}
