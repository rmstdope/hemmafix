import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { floor, household } from "@/db/schema";
import { ForbiddenError } from "@/lib/permissions";
import { createFamily } from "../../test/integration/factories";
import { createChore, listCompletedBy, listOpenInstances, completeInstance } from "./chores";
import {
  addFloor,
  addRoom,
  deleteFloor,
  deleteRoom,
  ensureMembership,
  listFloors,
  listRooms,
  moveFloor,
  renameFloor,
} from "./household";
import { createUser } from "../../test/integration/factories";

let f: Awaited<ReturnType<typeof createFamily>>;

beforeEach(async () => {
  await db.delete(household);
  f = await createFamily();
});

const floorNames = async (homeId = f.homeId) => (await listFloors(homeId)).map((x) => x.name);

describe("floors", () => {
  it("are named after the next free number, and stack upwards", async () => {
    await addFloor(f.adult);
    await addFloor(f.adult);
    expect(await floorNames()).toEqual(["3", "2", "1"]);
  });

  it("can be renamed, and the free number is reused", async () => {
    await addFloor(f.adult);
    const [top] = await listFloors(f.homeId);
    await renameFloor(f.adult, top!.id, "  Vind ");
    await addFloor(f.adult);
    expect(await floorNames()).toEqual(["2", "Vind", "1"]);
  });

  it("have unique names in a home, whatever the case", async () => {
    const second = await addFloor(f.adult);
    await expect(renameFloor(f.adult, second.id, "1")).rejects.toThrow("redan en våning");
    await renameFloor(f.adult, second.id, "Övervåning");
    await expect(renameFloor(f.adult, f.ground.id, "ÖVERVÅNING")).rejects.toThrow("redan en våning");
    await expect(renameFloor(f.adult, f.ground.id, "  ")).rejects.toThrow();
  });

  it("move up and down the house", async () => {
    const suterrang = await addFloor(f.adult, "Suterräng");
    // A basement added later goes on top; move it below floor 1.
    expect(await floorNames()).toEqual(["Suterräng", "1"]);
    await moveFloor(f.adult, suterrang.id, "down");
    expect(await floorNames()).toEqual(["1", "Suterräng"]);
    // Already at the bottom: nothing happens.
    await moveFloor(f.adult, suterrang.id, "down");
    expect(await floorNames()).toEqual(["1", "Suterräng"]);
    await addFloor(f.adult);
    await moveFloor(f.adult, suterrang.id, "up");
    expect(await floorNames()).toEqual(["2", "Suterräng", "1"]);
  });

  it("can be removed once empty, but a home keeps at least one", async () => {
    const second = await addFloor(f.adult);
    const bath = await addRoom(f.adult, "Badrum", second.id);
    await expect(deleteFloor(f.adult, second.id)).rejects.toThrow("Våningen har rum");

    await deleteRoom(f.adult, bath.id);
    await deleteFloor(f.adult, second.id);
    expect(await floorNames()).toEqual(["1"]);
    await expect(deleteFloor(f.adult, f.ground.id)).rejects.toThrow("minst en våning");
  });

  it("are managed by adults of the home only", async () => {
    const second = await addFloor(f.adult);
    await expect(addFloor(f.child)).rejects.toThrow(ForbiddenError);
    await expect(renameFloor(f.child, second.id, "Bos")).rejects.toThrow(ForbiddenError);
    await expect(moveFloor(f.child, second.id, "down")).rejects.toThrow(ForbiddenError);
    await expect(deleteFloor(f.child, second.id)).rejects.toThrow(ForbiddenError);

    await expect(renameFloor(f.neighbour, second.id, "Grannens")).rejects.toThrow("finns inte i hemmet");
    await expect(moveFloor(f.neighbour, second.id, "down")).rejects.toThrow("finns inte i hemmet");
    await deleteFloor(f.neighbour, second.id);
    expect(await floorNames()).toEqual(["2", "1"]);
  });

  it("are created for the first home with its first login", async () => {
    await db.delete(household);
    const anna = await createUser("Anna");
    await ensureMembership(anna.id);
    const [home] = await db.select().from(household);
    expect(await floorNames(home!.id)).toEqual(["1"]);
  });
});

describe("rooms on floors", () => {
  it("may share a name across floors, but not on one floor", async () => {
    const upstairs = await addFloor(f.adult);
    await addRoom(f.adult, "Badrum", upstairs.id);
    await expect(addRoom(f.adult, "badrum", upstairs.id)).rejects.toThrow("finns redan på våningen");
    // Badrum on floor 1 exists from the factory too.
    expect((await listRooms(f.homeId)).filter((r) => r.name.toLowerCase() === "badrum")).toHaveLength(2);
  });

  it("need a floor once the home has several, and only one of this home", async () => {
    await addFloor(f.adult);
    await expect(addRoom(f.adult, "Hall")).rejects.toThrow("Välj en våning");
    await expect(addRoom(f.adult, "Hall", f.neighbourFloor.id)).rejects.toThrow("finns inte i hemmet");
  });

  it("go on the only floor when there is just one", async () => {
    const hall = await addRoom(f.adult, "Hall");
    expect(hall.floorId).toBe(f.ground.id);
  });

  it("cannot be added to a removed floor", async () => {
    const attic = await addFloor(f.adult);
    await deleteFloor(f.adult, attic.id);
    await expect(addRoom(f.adult, "Vind", attic.id)).rejects.toThrow("finns inte i hemmet");
  });

  it("never end up on a removed floor, however the requests race", async () => {
    for (let i = 0; i < 10; i++) {
      const attic = await addFloor(f.adult, `Vind ${i}`);
      await Promise.allSettled([addRoom(f.adult, "Förråd", attic.id), deleteFloor(f.adult, attic.id)]);
      const [row] = await db.select().from(floor).where(eq(floor.id, attic.id));
      const roomsThere = (await listRooms(f.homeId)).filter((r) => r.floorId === attic.id);
      expect(row!.archivedAt !== null && roomsThere.length > 0).toBe(false);
    }
  });
});

describe("tasks and history on floors", () => {
  it("know their room's floor, and can be filtered on a whole floor", async () => {
    const upstairs = await addFloor(f.adult);
    const upperBath = await addRoom(f.adult, "Badrum", upstairs.id);
    await createChore(f.adult, { title: "Toa nere", roomId: f.bathroom.id, kind: "once" });
    await createChore(f.adult, { title: "Toa uppe", roomId: upperBath.id, kind: "once" });
    await createChore(f.adult, { title: "Diska", roomId: f.kitchen.id, kind: "once" });

    const all = await listOpenInstances(f.adult, {});
    expect(all.map((i) => [i.title, i.roomName, i.floorName])).toEqual([
      ["Toa nere", "Badrum", "1"],
      ["Toa uppe", "Badrum", "2"],
      ["Diska", "Kök", "1"],
    ]);
    expect((await listOpenInstances(f.adult, { floorId: upstairs.id })).map((i) => i.title)).toEqual(["Toa uppe"]);
    expect((await listOpenInstances(f.adult, { floorId: f.ground.id })).map((i) => i.title)).toEqual([
      "Toa nere",
      "Diska",
    ]);
    expect(await listOpenInstances(f.adult, { floorId: f.neighbourFloor.id })).toEqual([]);

    const [toaUppe] = await listOpenInstances(f.adult, { floorId: upstairs.id });
    await completeInstance(f.child, toaUppe!.id);
    expect((await listCompletedBy(f.child, f.child.userId, 7)).map((d) => [d.roomName, d.floorName])).toEqual([
      ["Badrum", "2"],
    ]);
  });
});
