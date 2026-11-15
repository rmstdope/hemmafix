"use server";

import { refresh } from "next/cache";
import { z } from "zod";
import { UserError } from "@/lib/errors";
import type { Role } from "@/lib/permissions";
import { getCurrentMember, type CurrentMember } from "@/server/dal";
import * as home from "@/server/household";
import * as chores from "@/server/chores";
import * as connections from "@/server/connections";

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
  await chores.notifyHouseholdChanged(member.householdId);
  refresh();
  return { ok: true };
}

// ---------------------------------------------------------------------------
// Home: name, rooms and members (adults only, checked in src/server/household.ts)
// ---------------------------------------------------------------------------

export async function renameHousehold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act((m) => home.renameHousehold(m, String(formData.get("name") ?? "")));
}

export async function addRoom(_prev: ActionState, formData: FormData): Promise<ActionState> {
  const floorId = formData.get("floorId");
  return act((m) => home.addRoom(m, String(formData.get("name") ?? ""), floorId ? String(floorId) : null));
}

export async function addFloor() {
  return act((m) => home.addFloor(m));
}

export async function renameFloor(id: string, name: string) {
  return act((m) => home.renameFloor(m, id, name));
}

export async function moveFloor(id: string, direction: "up" | "down") {
  return act((m) => home.moveFloor(m, id, direction));
}

export async function deleteFloor(id: string) {
  return act((m) => home.deleteFloor(m, id));
}

export async function renameRoom(id: string, name: string) {
  return act((m) => home.renameRoom(m, id, name));
}

export async function deleteRoom(id: string) {
  return act((m) => home.deleteRoom(m, id));
}

export async function setMemberRole(userId: string, role: Role) {
  return act((m) => home.setMemberRole(m, userId, role));
}

/** Disconnects one of the logged-in adult's own connected apps. */
export async function disconnectApp(connectionId: string) {
  return act((m) => connections.revokeConnection(m, connectionId));
}

// ---------------------------------------------------------------------------
// Tasks (who may do what is checked in src/server/chores.ts)
// ---------------------------------------------------------------------------

export async function createChore(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act((m) => chores.createChore(m, Object.fromEntries(formData)));
}

/** Edits a task from one of its open instances (the row the form was opened on). */
export async function editChore(
  instanceId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return act((m) => chores.editChore(m, instanceId, Object.fromEntries(formData)));
}

export async function completeInstance(id: string) {
  return act((m) => chores.completeInstance(m, id));
}

export async function uncompleteInstance(id: string) {
  return act((m) => chores.uncompleteInstance(m, id));
}

export async function assignInstance(id: string, assigneeId: string | null) {
  return act((m) => chores.assignInstance(m, id, assigneeId));
}

export async function assignChore(id: string, assigneeId: string | null) {
  return act((m) => chores.assignChore(m, id, assigneeId));
}

export async function deleteChore(id: string) {
  return act((m) => chores.deleteChore(m, id));
}
