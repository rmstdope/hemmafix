import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { household, rewardPurchase } from "@/db/schema";
import { ForbiddenError, type Action } from "@/lib/permissions";
import { giveRecipients } from "@/lib/rewards";
import { createFamily } from "../../test/integration/factories";
import { uncompleteInstance } from "./chores";
import { closeHighFiveNotes, setHighFive } from "./high-fives";
import type { Actor } from "./household";
import { setListOrder } from "./lists";
import { buyLook, chooseLook } from "./looks";
import { buyReward, cancelPurchase, listGoldRows } from "./rewards";
import { closeWeekRecap } from "./weeks";

/** Actions taken away from everyone for one test, on top of the real table. */
const denied = vi.hoisted(() => new Set<string>());

vi.mock("@/lib/permissions", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/permissions")>();
  const can: typeof real.can = (role, action) => !denied.has(action) && real.can(role, action);
  const assertCan: typeof real.assertCan = (actor, action) => {
    if (!can(actor.role, action)) throw new real.ForbiddenError();
  };
  return { ...real, can, assertCan };
});

let f: Awaited<ReturnType<typeof createFamily>>;

beforeEach(async () => {
  denied.clear();
  await db.delete(household);
  f = await createFamily();
});

// The ids point at nothing: the table is asked before anything is looked up.
const MUTATIONS: [string, Action, (actor: Actor) => Promise<unknown>][] = [
  ["buyReward", "coins:spend", (a) => buyReward(a, randomUUID())],
  ["buyLook", "coins:spend", (a) => buyLook(a, "frame", "guld")],
  ["chooseLook", "look:choose", (a) => chooseLook(a, "frame", "none")],
  ["cancelPurchase", "purchase:cancel", (a) => cancelPurchase(a, randomUUID())],
  ["closeHighFiveNotes", "note:close", (a) => closeHighFiveNotes(a, [])],
  ["closeWeekRecap", "note:close", (a) => closeWeekRecap(a)],
  ["setListOrder", "list:order", (a) => setListOrder(a, "alfabetiskt")],
  ["setHighFive, taking it back", "high-five:take-back", (a) => setHighFive(a, randomUUID(), false)],
  ["uncompleteInstance", "task:complete", (a) => uncompleteInstance(a, randomUUID())],
];

describe("the permissions table", () => {
  it.each(MUTATIONS)("decides %s", async (_name, action, run) => {
    denied.add(action);
    await expect(run(f.child)).rejects.toThrow(ForbiddenError);
  });

  it("decides who is asked to give a reward", async () => {
    await db.insert(rewardPurchase).values({ householdId: f.homeId, buyerId: f.child.userId, name: "Glass", price: 50 });
    expect(await listGoldRows(f.adult)).toHaveLength(1);
    denied.add("reward:give");
    expect(giveRecipients(f.child.userId, [{ id: f.adult.userId, role: "adult" }])).toEqual([]);
    expect(await listGoldRows(f.adult)).toEqual([]);
  });
});
