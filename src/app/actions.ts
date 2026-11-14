"use server";

import { and, eq } from "drizzle-orm";
import { refresh } from "next/cache";
import { z } from "zod";
import { db } from "@/db";
import { task } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { assertCan, type Role } from "@/lib/permissions";
import { assigneeIdInput, completedFlag, createTaskInput, taskId } from "@/lib/validation";
import { getCurrentMember, type CurrentMember } from "@/server/dal";
import * as home from "@/server/household";
import { isMember, notifyTasksChanged } from "@/server/tasks";

export type ActionState = { ok: boolean; error?: string };

const LOGGED_OUT = "Du är utloggad – ladda om sidan och logga in igen.";

/**
 * Runs `fn` as the logged-in member, then tells the household's other devices and refreshes
 * this one. Mistakes the person can fix (invalid input, not allowed, already exists) come
 * back as `{ ok: false, error }`; anything else is a bug and is thrown.
 */
async function act(fn: (member: CurrentMember) => Promise<unknown>): Promise<ActionState> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: LOGGED_OUT };
  try {
    await fn(member);
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Ogiltiga uppgifter" };
    throw e;
  }
  await notifyTasksChanged(member.householdId);
  refresh();
  return { ok: true };
}

/** For actions called from event handlers: throws, with a message fit to show. */
async function actOrThrow(fn: (member: CurrentMember) => Promise<unknown>) {
  const result = await act(fn);
  if (!result.ok) throw new Error(result.error);
}

async function assertAssignee(householdId: string, assigneeId: string | null) {
  if (assigneeId && !(await isMember(householdId, assigneeId))) {
    throw new UserError("Personen finns inte i hushållet");
  }
}

// ---------------------------------------------------------------------------
// Home: name, rooms and members (adults only, checked in src/server/household.ts)
// ---------------------------------------------------------------------------

export async function renameHousehold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act((m) => home.renameHousehold(m, String(formData.get("name") ?? "")));
}

export async function addRoom(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act((m) => home.addRoom(m, String(formData.get("name") ?? "")));
}

export async function deleteRoom(id: string) {
  await actOrThrow((m) => home.deleteRoom(m, id));
}

export async function setMemberRole(userId: string, role: Role) {
  return act((m) => home.setMemberRole(m, userId, role));
}

// ---------------------------------------------------------------------------
// Tasks
// ---------------------------------------------------------------------------

export async function createTask(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act(async (member) => {
    assertCan(member, "task:create");
    const input = createTaskInput.parse(Object.fromEntries(formData));
    await assertAssignee(member.householdId, input.assigneeId);
    await db.insert(task).values({ ...input, householdId: member.householdId, createdById: member.userId });
  });
}

export async function setTaskCompleted(id: string, completed: boolean) {
  await actOrThrow(async (member) => {
    assertCan(member, "task:complete");
    const isCompleted = completedFlag.parse(completed);
    await db
      .update(task)
      .set(
        isCompleted
          ? { completedAt: new Date(), completedById: member.userId }
          : { completedAt: null, completedById: null },
      )
      .where(and(eq(task.id, taskId.parse(id)), eq(task.householdId, member.householdId)));
  });
}

export async function assignTask(id: string, assigneeIdArg: string | null) {
  await actOrThrow(async (member) => {
    assertCan(member, "task:assign");
    const assigneeId = assigneeIdInput.parse(assigneeIdArg);
    await assertAssignee(member.householdId, assigneeId);
    await db
      .update(task)
      .set({ assigneeId })
      .where(and(eq(task.id, taskId.parse(id)), eq(task.householdId, member.householdId)));
  });
}

export async function deleteTask(id: string) {
  await actOrThrow(async (member) => {
    assertCan(member, "task:delete");
    await db.delete(task).where(and(eq(task.id, taskId.parse(id)), eq(task.householdId, member.householdId)));
  });
}
