"use server";

import { refresh } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { z } from "zod";
import { UserError } from "@/lib/errors";
import { SAVE_FAILED } from "@/lib/routine-texts";
import type { Role } from "@/lib/permissions";
import { formInput, INVALID_INPUT } from "@/lib/validation";
import { getCurrentMember, type CurrentMember } from "@/server/dal";
import * as home from "@/server/household";
import * as chores from "@/server/chores";
import * as connections from "@/server/connections";
import * as routines from "@/server/routines";
import * as lists from "@/server/lists";
import * as highFives from "@/server/high-fives";
import * as looks from "@/server/looks";
import * as weeks from "@/server/weeks";
import * as rewards from "@/server/rewards";
import type { Won } from "@/server/badges";
import type { ItemView, ListOrder, ListSharing } from "@/lib/lists";

/** Everything an action reports back to the app: a task's own reports, and what a purchase won. */
type Report = chores.TaskReport | Won;

/** The one thing added to a report on its way to the app: a level-up also says who reached it. */
type ReachedBy = { levelUp?: (NonNullable<Won["levelUp"]> & Pick<CurrentMember, "name" | "image">) | null };

export type ActionState<R extends Report = never> = {
  ok: boolean;
  error?: string;
  id?: string;
  count?: number;
  /** What the server function reports, as it is (see its type for what each field means). */
  report?: R & ReachedBy;
};

const LOGGED_OUT = "Du är utloggad – ladda om sidan och logga in igen.";

type ActOptions = { notify?: boolean; refreshPage?: boolean; refreshOnError?: boolean };

/**
 * Runs `fn` as the logged-in member and, if it `changed` something, tells the household's other
 * devices and refreshes this one. Mistakes the person can fix (invalid input, not allowed, already
 * exists) come back as `{ ok: false, error }`; anything else is a bug and is thrown.
 */
async function perform<T>(
  fn: (member: CurrentMember) => Promise<T>,
  { notify = true, refreshPage = true, refreshOnError = false }: ActOptions,
  changed: (out: T) => boolean = () => true,
): Promise<{ ok: false; error: string } | { ok: true; out: T; member: CurrentMember }> {
  const member = await getCurrentMember();
  if (!member) return { ok: false, error: LOGGED_OUT };
  let out: T;
  try {
    out = await fn(member);
  } catch (e) {
    // A refusal that means the page is behind (the row moved or went) brings the fresh list with it.
    if (refreshOnError && e instanceof UserError) refresh();
    if (e instanceof UserError) return { ok: false, error: e.message };
    if (e instanceof z.ZodError) return { ok: false, error: e.issues[0]?.message ?? INVALID_INPUT };
    throw e;
  }
  if (changed(out)) {
    if (notify) await chores.notifyHouseholdChanged(member.householdId);
    if (refreshPage) refresh();
  }
  return { ok: true, out, member };
}

/** `perform` for an action with nothing to report: whatever `fn` resolves with stays on the server. */
async function act(fn: (member: CurrentMember) => Promise<unknown>, options: ActOptions = {}): Promise<ActionState> {
  const done = await perform(fn, options);
  return done.ok ? { ok: true } : done;
}

/**
 * `perform` for an action whose report goes back to the app. The whole object is sent, so `fn` must
 * resolve with exactly what the app may see, never a row. One that only asked has changed nothing.
 */
async function actAndReport<R extends Report>(
  fn: (member: CurrentMember) => Promise<R>,
  options: ActOptions = {},
): Promise<ActionState<R>> {
  const done = await perform(fn, options, (report) => !("kind" in report && report.kind === "asked"));
  if (!done.ok) return done;
  const { out, member } = done;
  const reached: ReachedBy =
    "levelUp" in out && out.levelUp ? { levelUp: { ...out.levelUp, name: member.name, image: member.image } } : {};
  return { ok: true, report: { ...out, ...reached } };
}

// ---------------------------------------------------------------------------
// Home: name, rooms and members (adults only, checked in src/server/household.ts)
// ---------------------------------------------------------------------------

export async function renameHousehold(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act((m) => home.renameHousehold(m, String(formInput.parse(formData).get("name") ?? "")));
}

export async function addRoom(_prev: ActionState, formData: FormData): Promise<ActionState> {
  return act((m) => {
    const form = formInput.parse(formData);
    const floorId = form.get("floorId");
    return home.addRoom(m, String(form.get("name") ?? ""), floorId ? String(floorId) : null);
  });
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
    const form = formInput.parse(formData);
    try {
      count = (await routines.addRoutineToHome(m, Object.fromEntries(form))).count;
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
// Lists: public to the whole home or private to the people chosen (src/server/lists.ts)
// ---------------------------------------------------------------------------

/** Resolves with the new list's id, so the page can open it. */
export async function createList(name: string, sharing?: ListSharing): Promise<ActionState> {
  let id: string | undefined;
  const result = await act(async (m) => {
    id = (await lists.createList(m, name, sharing)).id;
  });
  return result.ok ? { ok: true, id } : result;
}

export async function setListSharing(id: string, sharing: ListSharing) {
  return act((m) => lists.setListSharing(m, id, sharing));
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
  return act((m) => chores.createChore(m, Object.fromEntries(formInput.parse(formData))));
}

/** Edits a task from one of its open instances (the row the form was opened on). */
export async function editChore(
  instanceId: string,
  _prev: ActionState,
  formData: FormData,
): Promise<ActionState> {
  return act((m) => chores.editChore(m, instanceId, Object.fromEntries(formInput.parse(formData))));
}

export async function completeInstance(id: string) {
  return actAndReport((m) => chores.completeInstance(m, id));
}

export async function postponeInstance(id: string, day: string) {
  return actAndReport((m) => chores.postponeInstance(m, id, day), { refreshOnError: true });
}

export async function undoPostpone(id: string, back: { to: string; version: string }) {
  return act((m) => chores.undoPostpone(m, id, back), { refreshOnError: true });
}

export async function openChest(id: string) {
  return act((m) => chores.openChest(m, id));
}

export async function uncompleteInstance(id: string, confirmDebt = false) {
  return actAndReport((m) => chores.uncompleteInstance(m, id, { confirmDebt }));
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
  return actAndReport((m) => looks.buyLook(m, kind, key));
}

/** Switches to a look the person owns (or the free default of its kind). */
export async function chooseLook(kind: string, key: string) {
  return act((m) => looks.chooseLook(m, kind, key));
}

// ---------------------------------------------------------------------------
// Rewards: adults manage them, anyone buys, the buyer cancels, an adult gives
// ---------------------------------------------------------------------------

export async function addReward(input: { name: string; price: string }) {
  return act((m) => rewards.addReward(m, input));
}

export async function updateReward(id: string, input: { name: string; price: string }) {
  return act((m) => rewards.updateReward(m, id, input));
}

export async function deleteReward(id: string) {
  return act((m) => rewards.deleteReward(m, id));
}

export async function buyReward(id: string) {
  return actAndReport((m) => rewards.buyReward(m, id));
}

export async function cancelPurchase(id: string) {
  return act((m) => rewards.cancelPurchase(m, id));
}

export async function giveReward(id: string) {
  return act((m) => rewards.giveReward(m, id));
}

export async function declineReward(id: string) {
  return act((m) => rewards.declineReward(m, id));
}
