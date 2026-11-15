import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { household, membership, user } from "@/db/schema";

process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
process.env.BETTER_AUTH_SECRET = "integration-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { resolveMcpMember } = await import("./mcp-access");

let homeId: string;
beforeAll(async () => {
  await db.delete(household);
});
beforeEach(async () => {
  await db.delete(user);
  await db.delete(household);
  [{ id: homeId }] = (await db.insert(household).values({ name: "Hemma" }).returning({ id: household.id })) as [{ id: string }];
  await db.insert(user).values([
    { id: "anna", name: "Anna", email: "anna@example.com", emailVerified: true },
    { id: "bo", name: "Bo", email: "bo@example.com", emailVerified: true },
    { id: "eve", name: "Eve", email: "eve@example.com", emailVerified: true },
  ]);
  await db.insert(membership).values([
    { userId: "anna", householdId: homeId, role: "adult" },
    { userId: "bo", householdId: homeId, role: "child" },
    { userId: "eve", householdId: homeId, role: "adult" },
  ]);
});

describe("who a connected token belongs to", () => {
  it("is the adult acting in their household", async () => {
    expect(await resolveMcpMember("anna")).toEqual({ actor: { userId: "anna", householdId: homeId, role: "adult" } });
  });

  it("is refused once the address is no longer on the allowlist", async () => {
    expect(await resolveMcpMember("eve")).toEqual({ denied: "removed" });
  });

  it("is refused for a child, also one who was an adult when connecting", async () => {
    expect(await resolveMcpMember("bo")).toEqual({ denied: "child" });
    await db.update(membership).set({ role: "child" }).where(eq(membership.userId, "anna"));
    expect(await resolveMcpMember("anna")).toEqual({ denied: "child" });
  });

  it("is refused for a user that no longer exists", async () => {
    expect(await resolveMcpMember("ghost")).toEqual({ denied: "removed" });
  });
});
