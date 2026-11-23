import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { choreInstance, household, membership } from "@/db/schema";
import { UserError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/permissions";
import { createFamily, createUser } from "../../test/integration/factories";
import { completeInstance, createChore, deleteChore, listOpenInstances, uncompleteInstance } from "./chores";
import { closeHighFiveNotes, listHighFiveNotes, listHighFives, setHighFive } from "./high-fives";

let f: Awaited<ReturnType<typeof createFamily>>;
let pappa: typeof f.adult;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
  const u = await createUser("Pappa");
  await db.insert(membership).values({ userId: u.id, householdId: f.homeId, role: "adult" });
  pappa = { ...f.adult, userId: u.id, name: "Pappa" };
});

/** Bo ticks off "Diska"; resolves with the done instance's id. */
async function boTicks(title = "Diska") {
  await createChore(f.adult, { title, roomId: f.kitchen.id, kind: "once" });
  const [t] = (await listOpenInstances(f.adult, {})).filter((i) => i.title === title);
  await completeInstance(f.child, t!.id);
  return t!.id;
}

describe("setHighFive", () => {
  it("gives one per person, and pressing again takes it back", async () => {
    const id = await boTicks();
    await setHighFive(f.adult, id, true);
    await setHighFive(f.adult, id, true);
    await setHighFive(pappa, id, true);
    expect((await listHighFives(f.child, [id])).get(id)?.names.sort()).toEqual(["Anna", "Pappa"]);
    await setHighFive(f.adult, id, false);
    expect((await listHighFives(f.child, [id])).get(id)?.names).toEqual(["Pappa"]);
  });

  it("refuses your own tick, an open task, another home's task and a child giving one", async () => {
    const id = await boTicks();
    await createChore(f.adult, { title: "Öppen", roomId: f.kitchen.id, kind: "once" });
    const [open] = (await listOpenInstances(f.adult, {})).filter((i) => i.title === "Öppen");
    await expect(setHighFive(f.child, id, true)).rejects.toThrow(ForbiddenError);
    await expect(setHighFive(f.adult, open!.id, true)).rejects.toThrow(UserError);
    await completeInstance(f.adult, open!.id);
    await expect(setHighFive(f.adult, open!.id, true)).rejects.toThrow(UserError);
    await expect(setHighFive(f.neighbour, id, true)).rejects.toThrow(UserError);
    await expect(setHighFive(f.adult, "00000000-0000-4000-8000-000000000000", true)).rejects.toThrow(UserError);
  });
});

describe("listHighFives", () => {
  it("names who only to the doer; the giver sees only whether they gave", async () => {
    const id = await boTicks();
    await setHighFive(f.adult, id, true);
    const mine = (await listHighFives(f.adult, [id])).get(id);
    expect(mine).toEqual({ givenByMe: true, names: [] });
    expect((await listHighFives(pappa, [id])).get(id)).toEqual({ givenByMe: false, names: [] });
    expect((await listHighFives(f.child, [id])).get(id)).toEqual({ givenByMe: false, names: ["Anna"] });
  });
});

describe("notes", () => {
  it("is not shown for a task that has since been deleted", async () => {
    const id = await boTicks();
    await setHighFive(f.adult, id, true);
    const [{ choreId }] = await db.select({ choreId: choreInstance.choreId }).from(choreInstance).where(eq(choreInstance.id, id));
    await deleteChore(f.adult, choreId);
    expect(await listHighFiveNotes(f.child)).toEqual([]);
  });

  it("one per cheered tick; gone when taken back; stays closed; a new high five brings a new note", async () => {
    const id = await boTicks();
    expect(await listHighFiveNotes(f.child)).toEqual([]);
    await setHighFive(f.adult, id, true);
    expect(await listHighFiveNotes(f.child)).toEqual([{ instanceId: id, title: "Diska", names: ["Anna"] }]);
    expect(await listHighFiveNotes(f.adult)).toEqual([]);

    await setHighFive(f.adult, id, false);
    expect(await listHighFiveNotes(f.child)).toEqual([]);

    await setHighFive(f.adult, id, true);
    await closeHighFiveNotes(f.child, [id]);
    expect(await listHighFiveNotes(f.child)).toEqual([]);
    // Still counted on the row.
    expect((await listHighFives(f.child, [id])).get(id)?.names).toEqual(["Anna"]);

    await setHighFive(pappa, id, true);
    expect(await listHighFiveNotes(f.child)).toEqual([{ instanceId: id, title: "Diska", names: ["Pappa"] }]);
  });

  it("only the doer closes their own notes", async () => {
    const id = await boTicks();
    await setHighFive(f.adult, id, true);
    await closeHighFiveNotes(pappa, [id]);
    expect(await listHighFiveNotes(f.child)).toHaveLength(1);
  });

  it("undoing the tick clears its high fives for the next tick", async () => {
    const id = await boTicks();
    await setHighFive(f.adult, id, true);
    await uncompleteInstance(f.child, id);
    await completeInstance(f.child, id);
    expect((await listHighFives(f.child, [id])).get(id)).toBeUndefined();
    expect(await listHighFiveNotes(f.child)).toEqual([]);
  });
});
