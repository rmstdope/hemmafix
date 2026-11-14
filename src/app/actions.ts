"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { db } from "@/db";
import { task } from "@/db/schema";
import { assigneeIdInput, completedFlag, createTaskInput, taskId } from "@/lib/validation";
import { getCurrentMember } from "@/server/dal";
import { isMember, notifyTasksChanged } from "@/server/tasks";

export type ActionState = { ok: boolean; error?: string };

const LOGGED_OUT = "Du är utloggad – ladda om sidan och logga in igen.";

async function memberOrThrow() {
  const member = await getCurrentMember();
  if (!member) throw new Error(LOGGED_OUT);
  return member;
}

async function assertAssignee(householdId: string, assigneeId: string | null) {
  if (assigneeId && !(await isMember(householdId, assigneeId))) {
    throw new Error("Personen finns inte i hushållet");
  }
}

async function done(householdId: string) {
  await notifyTasksChanged(householdId);
  refresh();
}

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: LOGGED_OUT };
  const parsed = createTaskInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) {
    return { ok: false, error: parsed.error.issues[0]?.message ?? "Ogiltig uppgift" };
  }
  try {
    await assertAssignee(member.householdId, parsed.data.assigneeId);
  } catch (e) {
    return { ok: false, error: (e as Error).message };
  }

  await db.insert(task).values({
    ...parsed.data,
    householdId: member.householdId,
    createdById: member.userId,
  });
  await done(member.householdId);
  return { ok: true };
}

export async function setTaskCompleted(id: string, completed: boolean) {
  const member = await memberOrThrow();
  const isCompleted = completedFlag.parse(completed);
  await db
    .update(task)
    .set(
      isCompleted
        ? { completedAt: new Date(), completedById: member.userId }
        : { completedAt: null, completedById: null },
    )
    .where(and(eq(task.id, taskId.parse(id)), eq(task.householdId, member.householdId)));
  await done(member.householdId);
}

export async function assignTask(id: string, assigneeIdArg: string | null) {
  const member = await memberOrThrow();
  const assigneeId = assigneeIdInput.parse(assigneeIdArg);
  await assertAssignee(member.householdId, assigneeId);
  await db
    .update(task)
    .set({ assigneeId })
    .where(and(eq(task.id, taskId.parse(id)), eq(task.householdId, member.householdId)));
  await done(member.householdId);
}

export async function deleteTask(id: string) {
  const member = await memberOrThrow();
  await db
    .delete(task)
    .where(and(eq(task.id, taskId.parse(id)), eq(task.householdId, member.householdId)));
  await done(member.householdId);
}
