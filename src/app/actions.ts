"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { UserError } from "@/lib/errors";
import { SAVE_FAILED } from "@/lib/routine-texts";
import type { Role } from "@/lib/permissions";
import { getCurrentMember, type CurrentMember } from "@/server/dal";
import * as home from "@/server/household";
import * as chores from "@/server/chores";
import * as connections from "@/server/connections";
import * as routines from "@/server/routines";
import * as lists from "@/server/lists";
import * as highFives from "@/server/high-fives";
import * as looks from "@/server/looks";
import * as weeks from "@/server/weeks";
import type { ItemView, ListOrder } from "@/lib/lists";

export type ActionState = {
  ok: boolean;
  error?: string;
  id?: string;
  count?: number;
  /** The day's chest a tick-off offered, and what is in it (completeInstance only). */
  chestId?: string;
  chestCoins?: number;
};

const LOGGED_OUT = "Du är utloggad – ladda om sidan och logga in igen.";

/**
 * Runs `fn` as the logged-in member, then tells the household's other devices and refreshes
 * this one. Mistakes the person can fix (invalid input, not allowed, already exists) come
 * back as `{ ok: false, error }`; anything else is a bug and is thrown.
 */
async function act(
  fn: (member: CurrentMember) => Promise<unknown>,
  { notify = true, refreshPage = true }: { notify?: boolean; refreshPage?: boolean } = {},
): Promise<ActionState> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: LOGGED_OUT };
  let extra: Partial<ActionState> = {};
  try {
    const out = await fn(member);
    // Only what a tick-off reports about its chest goes back; other results stay on the server.
    if (out && typeof out === "object") {
      const { chestId, chestCoins } = out as Partial<ActionState>;
      if (chestId && chestCoins !== undefined) extra = { chestId, chestCoins };
    }
  } catch (e) {
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? "Ogiltiga uppgifter" };
    throw e;
  }
  if (notify) await chores.notifyHouseholdChanged(member.householdId);
  if (refreshPage) refresh();
  return { ok: true, ...extra };
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
// Routines: tasks that are usually done together (adults only, checked in src/server/routines.ts)
// ---------------------------------------------------------------------------

/** Resolves with the new routine's id, so the page can open it. */
export async function createRoutine(name: string): Promise<ActionState> {
  let id: string | undefined;
  const result = await act(async (m) => {
    id = (await routines.createRoutine(m, name)).id;
  });
  return result.ok ? { ok: true, id } : result;
}

export async function renameRoutine(id: string, name: string) {
  return act((m) => routines.renameRoutine(m, id, name));
}

export async function deleteRoutine(id: string) {
  return act((m) => routines.deleteRoutine(m, id));
}

export async function addRoutineTask(routineId: string, title: string, coins?: number) {
  return act((m) => routines.addRoutineTask(m, routineId, title, coins));
}

export async function updateRoutineTask(routineId: string, taskId: string, title: string, coins?: number) {
  return act((m) => routines.updateRoutineTask(m, routineId, taskId, title, coins));
}

export async function removeRoutineTask(routineId: string, taskId: string) {
  return act((m) => routines.removeRoutineTask(m, routineId, taskId));
}

/** Adds every task of a routine to a room (adults); resolves with how many were added. */
export async function addRoutine(_prev: ActionState, formData: FormData): Promise<ActionState> {
  let count = 0;
  const result = await act(async (m) => {
    try {
      count = (await routines.addRoutineToHome(m, Object.fromEntries(formData))).count;
    } catch (e) {
      if (e instanceof UserError || e instanceof z.ZodError) throw e;
      // The transaction rolled back, so nothing was added: say so the agreed way.
      unstable_rethrow(e);
      console.error("addRoutine failed", e);
      throw new UserError(SAVE_FAILED);
    }
  });
  return result.ok ? { ok: true, count } : result;
}

// ---------------------------------------------------------------------------
// Lists: shared by the whole home, every member may do all of it (src/server/lists.ts)
// ---------------------------------------------------------------------------

/** Resolves with the new list's id, so the page can open it. */
export async function createList(name: string): Promise<ActionState> {
  let id: string | undefined;
  const result = await act(async (m) => {
    id = (await lists.createList(m, name)).id;
  });
  return result.ok ? { ok: true, id } : result;
}

export async function renameList(id: string, name: string) {
  return act((m) => lists.renameList(m, id, name));
}

/** No refresh: the page goes back to Listor itself, and refreshing first would flash "gone". */
export async function deleteList(id: string) {
  return act((m) => lists.deleteList(m, id), { refreshPage: false });
}

export async function addListItem(listId: string, itemId: string, text: string) {
  return act((m) => lists.addItem(m, listId, itemId, text));
}

export async function editListItem(listId: string, itemId: string, text: string) {
  return act((m) => lists.editItem(m, listId, itemId, text));
}

export async function setListItemDone(listId: string, itemId: string, done: boolean) {
  return act((m) => lists.setItemDone(m, listId, itemId, done));
}

export async function removeListItem(listId: string, itemId: string) {
  return act((m) => lists.removeItem(m, listId, itemId));
}

export async function clearListDone(listId: string, itemIds: string[]) {
  return act((m) => lists.clearDone(m, listId, itemIds));
}

/** Ångra after × or Rensa: puts the items back where they were. */
export async function restoreListItems(listId: string, items: ItemView[]) {
  return act((m) => lists.restoreItems(m, listId, items));
}

/** The person's own order for Listor: nobody else's changes, so nobody is told. */
export async function setListOrder(order: ListOrder) {
  return act((m) => lists.setListOrder(m, order), { notify: false });
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

export async function openChest(id: string) {
  return act((m) => chores.openChest(m, id));
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

/** Gives (`on`) or takes back the person's high five for someone else's tick. */
export async function setHighFive(instanceId: string, on: boolean) {
  return act((m) => highFives.setHighFive(m, instanceId, on));
}

/** The doer closes the notes about their cheered ticks; their other devices follow. */
export async function closeHighFiveNotes(instanceIds: string[]) {
  return act((m) => highFives.closeHighFiveNotes(m, instanceIds));
}

/** The person is through the "Din vecka" sheet; it stays closed on their other devices too. */
export async function closeWeekRecap() {
  return act((m) => weeks.closeWeekRecap(m), { notify: false, refreshPage: false });
}

/** Buys a look with coins and starts using it. */
export async function buyLook(kind: string, key: string) {
  return act((m) => looks.buyLook(m, kind, key));
}

/** Switches to a look the person owns (or the free default of its kind). */
export async function chooseLook(kind: string, key: string) {
  return act((m) => looks.chooseLook(m, kind, key));
}
