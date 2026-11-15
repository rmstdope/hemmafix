import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { floor, household, membership } from "@/db/schema";
import { createUser } from "../../test/integration/factories";
import { UserError } from "@/lib/errors";
import { ForbiddenError } from "@/lib/permissions";
import {
  addRoom,
  deleteRoom,
  ensureMembership,
  listRooms,
  renameHousehold,
  setMemberRole,
  type Actor,
} from "./household";

const membershipOf = async (userId: string) =>
  (await db.select().from(membership).where(eq(membership.userId, userId)))[0];

describe("ensureMembership", () => {
  beforeEach(async () => {
    await db.delete(household);
  });

  it("lets the first login create the household and become an adult", async () => {
    process.env.HOUSEHOLD_NAME = "Familjen Test";
    const anna = await createUser("Anna");

    await ensureMembership(anna.id);

    const homes = await db.select().from(household);
    expect(homes).toHaveLength(1);
    expect(homes[0]!.name).toBe("Familjen Test");
    expect(await membershipOf(anna.id)).toMatchObject({ householdId: homes[0]!.id, role: "adult" });
  });

  it("adds later logins to the same household as children", async () => {
    const [anna, bo] = [await createUser("Anna"), await createUser("Bo")];

    await ensureMembership(anna.id);
    await ensureMembership(bo.id);

    const homes = await db.select().from(household);
    expect(homes).toHaveLength(1);
    expect(await membershipOf(bo.id)).toMatchObject({ householdId: homes[0]!.id, role: "child" });
  });

  it("changes nothing on a repeated login", async () => {
    const anna = await createUser("Anna");
    await ensureMembership(anna.id);
    const before = await membershipOf(anna.id);

    await ensureMembership(anna.id);

    expect(await db.select().from(membership)).toHaveLength(1);
    expect(await membershipOf(anna.id)).toEqual(before);
  });

  it("creates only one household when the first logins race", async () => {
    const people = await Promise.all(["Anna", "Bo", "Cleo", "Dag"].map(createUser));

    await Promise.all(people.map((p) => ensureMembership(p.id)));

    expect(await db.select().from(household)).toHaveLength(1);
    const roles = (await db.select().from(membership)).map((m) => m.role).sort();
    expect(roles).toEqual(["adult", "child", "child", "child"]);
  });
});

describe("the home: name, rooms and roles", () => {
  let homeA: string;
  let homeB: string;
  let adult: Actor;
  let child: Actor;
  let neighbour: Actor;

  beforeEach(async () => {
    await db.delete(household);
    const [a, b] = await db.insert(household).values([{ name: "Hemma" }, { name: "Grannar" }]).returning();
    await db.insert(floor).values([
      { householdId: a!.id, name: "1", position: 1 },
      { householdId: b!.id, name: "1", position: 1 },
    ]);
    homeA = a!.id;
    homeB = b!.id;
    const [anna, bo, eve] = [await createUser("Anna"), await createUser("Bo"), await createUser("Eve")];
    await db.insert(membership).values([
      { userId: anna.id, householdId: homeA, role: "adult" },
      { userId: bo.id, householdId: homeA, role: "child" },
      { userId: eve.id, householdId: homeB, role: "adult" },
    ]);
    adult = { userId: anna.id, householdId: homeA, role: "adult" };
    child = { userId: bo.id, householdId: homeA, role: "child" };
    neighbour = { userId: eve.id, householdId: homeB, role: "adult" };
  });

  const nameOf = async (id: string) => (await db.select().from(household).where(eq(household.id, id)))[0]!.name;
  const roleOf = async (userId: string) => (await membershipOf(userId))!.role;

  describe("renameHousehold", () => {
    it("lets an adult rename their own home, trimmed", async () => {
      await renameHousehold(adult, "  Villa Kulla ");
      expect(await nameOf(homeA)).toBe("Villa Kulla");
      expect(await nameOf(homeB)).toBe("Grannar");
    });

    it("refuses children and empty names", async () => {
      await expect(renameHousehold(child, "Bos hus")).rejects.toThrow(ForbiddenError);
      await expect(renameHousehold(adult, "   ")).rejects.toThrow();
      expect(await nameOf(homeA)).toBe("Hemma");
    });
  });

  describe("rooms", () => {
    it("lets an adult add rooms, listed alphabetically per home", async () => {
      await addRoom(adult, "Kök");
      await addRoom(adult, "badrum");
      await addRoom(neighbour, "Garage");
      expect((await listRooms(homeA)).map((r) => r.name)).toEqual(["badrum", "Kök"]);
      expect((await listRooms(homeB)).map((r) => r.name)).toEqual(["Garage"]);
    });

    it("refuses a room name that already exists, whatever the case", async () => {
      await addRoom(adult, "Kök");
      await expect(addRoom(adult, " KÖK ")).rejects.toThrow(UserError);
      await expect(addRoom(adult, " KÖK ")).rejects.toThrow("Det rummet finns redan");
      // Another home may have a room by the same name.
      await expect(addRoom(neighbour, "Kök")).resolves.toBeDefined();
    });

    it("refuses children adding or deleting rooms", async () => {
      const kok = await addRoom(adult, "Kök");
      await expect(addRoom(child, "Bos rum")).rejects.toThrow(ForbiddenError);
      await expect(deleteRoom(child, kok.id)).rejects.toThrow(ForbiddenError);
      expect(await listRooms(homeA)).toHaveLength(1);
    });

    it("deletes only rooms in the adult's own home", async () => {
      const kok = await addRoom(adult, "Kök");
      const garage = await addRoom(neighbour, "Garage");
      await deleteRoom(adult, garage.id);
      expect(await listRooms(homeB)).toHaveLength(1);
      await deleteRoom(adult, kok.id);
      expect(await listRooms(homeA)).toHaveLength(0);
    });
  });

  describe("setMemberRole", () => {
    it("lets an adult make a child an adult and back", async () => {
      await setMemberRole(adult, child.userId, "adult");
      expect(await roleOf(child.userId)).toBe("adult");
      await setMemberRole(adult, child.userId, "child");
      expect(await roleOf(child.userId)).toBe("child");
    });

    it("refuses children changing roles, including their own", async () => {
      await expect(setMemberRole(child, child.userId, "adult")).rejects.toThrow(ForbiddenError);
      expect(await roleOf(child.userId)).toBe("child");
    });

    it("never leaves the home without an adult", async () => {
      await expect(setMemberRole(adult, adult.userId, "child")).rejects.toThrow("minst en vuxen");
      await setMemberRole(adult, child.userId, "adult");
      await setMemberRole(adult, adult.userId, "child");
      expect(await roleOf(adult.userId)).toBe("child");
    });

    it("keeps one adult when two adults demote each other at the same time", async () => {
      await setMemberRole(adult, child.userId, "adult");
      const bo: Actor = { ...child, role: "adult" };

      const results = await Promise.allSettled([
        setMemberRole(adult, bo.userId, "child"),
        setMemberRole(bo, adult.userId, "child"),
      ]);

      expect(results.filter((r) => r.status === "fulfilled")).toHaveLength(1);
      const roles = [await roleOf(adult.userId), await roleOf(bo.userId)].sort();
      expect(roles).toEqual(["adult", "child"]);
    });

    it("refuses an adult who has just been made a child, even mid-request", async () => {
      await setMemberRole(adult, child.userId, "adult");
      await setMemberRole(adult, child.userId, "child");
      // `child` still claims to be an adult, as a request that started before the change would.
      await expect(setMemberRole({ ...child, role: "adult" }, adult.userId, "child")).rejects.toThrow(ForbiddenError);
      expect(await roleOf(adult.userId)).toBe("adult");
    });

    it("cannot change the role of someone in another home", async () => {
      await expect(setMemberRole(adult, neighbour.userId, "child")).rejects.toThrow("finns inte i hemmet");
      expect(await roleOf(neighbour.userId)).toBe("adult");
    });

    it("rejects roles that do not exist", async () => {
      await expect(setMemberRole(adult, child.userId, "admin" as never)).rejects.toThrow();
    });
  });
});
