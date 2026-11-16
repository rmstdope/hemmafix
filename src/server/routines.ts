import "server-only";
import { and, asc, eq, ne, sql } from "drizzle-orm";
import { db } from "@/db";
import { household, routine, routineTask } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { assertCan } from "@/lib/permissions";
import { ROUTINE_GONE, SAVE_FAILED } from "@/lib/routine-texts";
import { MAX_ROUTINE_TASKS, READY_MADE_ROUTINES } from "@/lib/ready-made-routines";
import { addRoutineInput, routineId, routineName, routineTaskId, routineTaskTitle } from "@/lib/validation";
import { assertMember, insertChore, lockRoom, type Tx } from "./chores";
import type { Actor } from "./household";

const GONE = "Den här rutinen finns inte längre.";

export type RoutineSummary = { id: string; name: string; taskCount: number };
export type RoutineView = { id: string; name: string; tasks: { id: string; title: string }[] };

/**
 * Gives the home its ready-made routines, once. The marker on the household stays set when
 * the family changes or removes them, so they never come back. Every function below calls
 * this first, which is how a home that existed before routines got them too.
 */
async function ensureReadyMadeRoutines(tx: Tx, householdId: string) {
  const [home] = await tx
    .select({ seeded: household.routinesSeededAt })
    .from(household)
    .where(eq(household.id, householdId));
  if (!home || home.seeded) return;
  // Lock the home and look again: two adults opening the page at once seed it once.
  const [locked] = await tx
    .select({ seeded: household.routinesSeededAt })
    .from(household)
    .where(eq(household.id, householdId))
    .for("update");
  if (!locked || locked.seeded) return;
  for (const ready of READY_MADE_ROUTINES) {
    const [created] = await tx
      .insert(routine)
      .values({ householdId, name: ready.name })
      .returning({ id: routine.id });
    for (const title of ready.tasks) await tx.insert(routineTask).values({ routineId: created!.id, title });
  }
  await tx.update(household).set({ routinesSeededAt: new Date() }).where(eq(household.id, householdId));
}

/** Runs `fn` in a transaction on a home that has been given its ready-made routines. */
async function inHome<T>(actor: Actor, fn: (tx: Tx) => Promise<T>): Promise<T> {
  assertCan(actor, "routine:manage");
  return db.transaction(async (tx) => {
    await ensureReadyMadeRoutines(tx, actor.householdId);
    return fn(tx);
  });
}

/** The routine's row, locked so its tasks change one request at a time. */
async function lockRoutine(tx: Tx, actor: Actor, id: string) {
  const parsed = routineId.safeParse(id);
  if (!parsed.success) throw new UserError(GONE);
  const [found] = await tx
    .select({ id: routine.id })
    .from(routine)
    .where(and(eq(routine.id, parsed.data), eq(routine.householdId, actor.householdId)))
    .for("update");
  if (!found) throw new UserError(GONE);
  return found.id;
}

async function nameClash(tx: Tx, householdId: string, name: string, exceptId?: string) {
  const [clash] = await tx
    .select({ name: routine.name })
    .from(routine)
    .where(
      and(
        eq(routine.householdId, householdId),
        sql`lower(${routine.name}) = lower(${name})`,
        exceptId ? ne(routine.id, exceptId) : undefined,
      ),
    )
    .limit(1);
  return clash?.name ?? null;
}

const duplicateName = (existing: string) => new UserError(`Det finns redan en rutin som heter ${existing}`);

/** The home's routines in the order they were made. */
export async function listRoutines(actor: Actor): Promise<RoutineSummary[]> {
  return inHome(actor, (tx) =>
    tx
      .select({
        id: routine.id,
        name: routine.name,
        taskCount: sql<number>`count(${routineTask.id})::int`,
      })
      .from(routine)
      .leftJoin(routineTask, eq(routineTask.routineId, routine.id))
      .where(eq(routine.householdId, actor.householdId))
      .groupBy(routine.id)
      .orderBy(asc(routine.seq)),
  );
}

/** One routine with its tasks in the order they were added; null when it does not exist here. */
export async function getRoutine(actor: Actor, id: string): Promise<RoutineView | null> {
  const parsed = routineId.safeParse(id);
  return inHome(actor, async (tx) => {
    if (!parsed.success) return null;
    const [found] = await tx
      .select({ id: routine.id, name: routine.name })
      .from(routine)
      .where(and(eq(routine.id, parsed.data), eq(routine.householdId, actor.householdId)));
    if (!found) return null;
    const tasks = await tx
      .select({ id: routineTask.id, title: routineTask.title })
      .from(routineTask)
      .where(eq(routineTask.routineId, found.id))
      .orderBy(asc(routineTask.seq));
    return { ...found, tasks };
  });
}

export async function createRoutine(actor: Actor, name: string): Promise<{ id: string }> {
  assertCan(actor, "routine:manage");
  const value = routineName.parse(name);
  return inHome(actor, async (tx) => {
    const [created] = await tx
      .insert(routine)
      .values({ householdId: actor.householdId, name: value })
      .onConflictDoNothing()
      .returning({ id: routine.id });
    if (created) return created;
    throw duplicateName((await nameClash(tx, actor.householdId, value)) ?? value);
  });
}

export async function renameRoutine(actor: Actor, id: string, name: string) {
  assertCan(actor, "routine:manage");
  const value = routineName.parse(name);
  await inHome(actor, async (tx) => {
    const target = await lockRoutine(tx, actor, id);
    const clash = await nameClash(tx, actor.householdId, value, target);
    if (clash) throw duplicateName(clash);
    try {
      await tx.transaction((inner) => inner.update(routine).set({ name: value }).where(eq(routine.id, target)));
    } catch (err) {
      // Another rename to the same name at the same moment: the unique index stops the second.
      if ((err as { cause?: { code?: string } }).cause?.code !== "23505") throw err;
      throw duplicateName((await nameClash(tx, actor.householdId, value, target)) ?? value);
    }
  });
}

/** Removes the routine and its tasks. Tasks already in the home are copies and stay. */
export async function deleteRoutine(actor: Actor, id: string) {
  await inHome(actor, async (tx) => {
    const parsed = routineId.safeParse(id);
    if (!parsed.success) return;
    await tx.delete(routine).where(and(eq(routine.id, parsed.data), eq(routine.householdId, actor.householdId)));
  });
}

export async function addRoutineTask(actor: Actor, id: string, title: string): Promise<{ id: string }> {
  assertCan(actor, "routine:manage");
  const value = routineTaskTitle.parse(title);
  return inHome(actor, async (tx) => {
    const target = await lockRoutine(tx, actor, id);
    const existing = await tx
      .select({ title: routineTask.title })
      .from(routineTask)
      .where(eq(routineTask.routineId, target));
    if (existing.some((t) => t.title.toLowerCase() === value.toLowerCase())) {
      throw new UserError(`${value} finns redan i rutinen`);
    }
    if (existing.length >= MAX_ROUTINE_TASKS) throw new UserError("En rutin kan ha högst 30 uppgifter");
    const [created] = await tx.insert(routineTask).values({ routineId: target, title: value }).returning({ id: routineTask.id });
    return created!;
  });
}

export async function updateRoutineTask(actor: Actor, id: string, taskId: string, title: string) {
  assertCan(actor, "routine:manage");
  const value = routineTaskTitle.parse(title);
  const task = routineTaskId.safeParse(taskId);
  await inHome(actor, async (tx) => {
    const target = await lockRoutine(tx, actor, id);
    if (!task.success) throw new UserError("Uppgiften finns inte längre.");
    const existing = await tx
      .select({ id: routineTask.id, title: routineTask.title })
      .from(routineTask)
      .where(eq(routineTask.routineId, target));
    if (!existing.some((t) => t.id === task.data)) throw new UserError("Uppgiften finns inte längre.");
    if (existing.some((t) => t.id !== task.data && t.title.toLowerCase() === value.toLowerCase())) {
      throw new UserError(`${value} finns redan i rutinen`);
    }
    await tx.update(routineTask).set({ title: value }).where(eq(routineTask.id, task.data));
  });
}

export async function removeRoutineTask(actor: Actor, id: string, taskId: string) {
  await inHome(actor, async (tx) => {
    const parsed = routineId.safeParse(id);
    const task = routineTaskId.safeParse(taskId);
    if (!parsed.success || !task.success) return;
    const [owned] = await tx
      .select({ id: routine.id })
      .from(routine)
      .where(and(eq(routine.id, parsed.data), eq(routine.householdId, actor.householdId)));
    if (!owned) return;
    await tx.delete(routineTask).where(and(eq(routineTask.id, task.data), eq(routineTask.routineId, owned.id)));
  });
}

export type RoutineWithTasks = { id: string; name: string; tasks: string[] };

/** The home's routines with their task titles, for the add-a-routine form (adults). */
export async function listRoutinesWithTasks(actor: Actor): Promise<RoutineWithTasks[]> {
  return inHome(actor, async (tx) => {
    // One statement, so routines and tasks come from one snapshot: two would let a routine
    // removed in between show up with no tasks.
    const rows = await tx
      .select({ id: routine.id, name: routine.name, title: routineTask.title })
      .from(routine)
      .leftJoin(routineTask, eq(routineTask.routineId, routine.id))
      .where(eq(routine.householdId, actor.householdId))
      .orderBy(asc(routine.seq), asc(routineTask.seq));
    const routines = new Map<string, RoutineWithTasks>();
    for (const { id, name, title } of rows) {
      const r = routines.get(id) ?? { id, name, tasks: [] };
      routines.set(id, r);
      if (title !== null) r.tasks.push(title);
    }
    return [...routines.values()];
  });
}

/**
 * Adds every task of a routine to a room as an ordinary task with the chosen cadence, date
 * and person. The routine is only a template: nothing links the new tasks back to it.
 * All or nothing.
 */
export async function addRoutineToHome(actor: Actor, raw: unknown): Promise<{ count: number }> {
  assertCan(actor, "task:create");
  const input = addRoutineInput.parse(raw);
  return inHome(actor, async (tx) => {
    // Share-lock the routine so it cannot be removed while its tasks are copied.
    const [found] = await tx
      .select({ id: routine.id })
      .from(routine)
      .where(and(eq(routine.id, input.routineId), eq(routine.householdId, actor.householdId)))
      .for("share");
    if (!found) throw new UserError(ROUTINE_GONE);
    await lockRoom(tx, actor, input.roomId);
    await assertMember(tx, actor.householdId, input.assigneeId);
    const tasks = await tx
      .select({ title: routineTask.title })
      .from(routineTask)
      .where(eq(routineTask.routineId, found.id))
      .orderBy(asc(routineTask.seq));
    if (tasks.length === 0) throw new UserError(SAVE_FAILED);
    // One transaction means one now(): stamp each task a millisecond apart so the list keeps the routine's order.
    const start = Date.now();
    for (const [i, t] of tasks.entries()) {
      await insertChore(tx, actor, { ...input, title: t.title, templateKey: null, createdAt: new Date(start + i) });
    }
    return { count: tasks.length };
  });
}
