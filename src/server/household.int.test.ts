import { eq } from "drizzle-orm";
import { beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { household, membership } from "@/db/schema";
import { createUser } from "../../test/integration/factories";
import { ensureMembership } from "./household";

const membershipOf = async (userId: string) =>
  (await db.select().from(membership).where(eq(membership.userId, userId)))[0];

describe("ensureMembership", () => {
  beforeEach(async () => {
    await db.delete(household);
  });

  it("lets the first login create the household and become its admin", async () => {
    process.env.HOUSEHOLD_NAME = "Familjen Test";
    const anna = await createUser("Anna");

    await ensureMembership(anna.id);

    const homes = await db.select().from(household);
    expect(homes).toHaveLength(1);
    expect(homes[0]!.name).toBe("Familjen Test");
    expect(await membershipOf(anna.id)).toMatchObject({ householdId: homes[0]!.id, role: "admin" });
  });

  it("adds later logins to the same household as members", async () => {
    const [anna, bo] = [await createUser("Anna"), await createUser("Bo")];

    await ensureMembership(anna.id);
    await ensureMembership(bo.id);

    const homes = await db.select().from(household);
    expect(homes).toHaveLength(1);
    expect(await membershipOf(bo.id)).toMatchObject({ householdId: homes[0]!.id, role: "member" });
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
    expect(roles).toEqual(["admin", "member", "member", "member"]);
  });
});
