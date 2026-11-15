import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { chore, choreInstance, floor, household, membership, room, user } from "@/db/schema";

process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
process.env.BETTER_AUTH_SECRET = "integration-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { handleMcpRequest } = await import("./mcp");

const rpc = async (userId: string, method: string, params: unknown = {}) => {
  const res = await handleMcpRequest(
    new Request("http://localhost:3000/mcp", {
      method: "POST",
      headers: { "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method, params }),
    }),
    userId,
  );
  const body = await res.text();
  const json = body.startsWith("event:") || body.includes("\ndata:") ? body.split("data: ").pop()! : body;
  return JSON.parse(json.trim());
};
const callTool = (userId: string) => rpc(userId, "tools/call", { name: "lista_oppna_sysslor", arguments: {} });

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
  ]);
  await db.insert(membership).values([
    { userId: "anna", householdId: homeId, role: "adult" },
    { userId: "bo", householdId: homeId, role: "child" },
  ]);
});

describe("the open-tasks tool", () => {
  it("is listed for a connected client", async () => {
    const res = await rpc("anna", "tools/list");
    expect(res.result.tools.map((t: { name: string }) => t.name)).toEqual(["lista_oppna_sysslor"]);
  });

  it("says nothing is left when nothing is open", async () => {
    const res = await callTool("anna");
    expect(res.result.content[0].text).toBe("Inget är kvar att göra just nu.");
  });

  it("lists the open tasks of the home", async () => {
    const [f] = await db.insert(floor).values({ householdId: homeId, name: "1", position: 1 }).returning({ id: floor.id });
    const [r] = await db.insert(room).values({ householdId: homeId, floorId: f!.id, name: "Kök" }).returning({ id: room.id });
    const [c] = await db.insert(chore).values({ householdId: homeId, roomId: r!.id, title: "Diska" }).returning({ id: chore.id });
    await db.insert(choreInstance).values({ choreId: c!.id, householdId: homeId, assigneeId: "anna" });

    const res = await callTool("anna");
    expect(res.result.content[0].text).toBe("- Diska – Kök, Anna, inget datum");
  });

  it("tells a child that only adults can use it", async () => {
    const res = await callTool("bo");
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toBe("Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.");
  });

  it("tells someone removed from the allowlist that their access is gone", async () => {
    process.env.ALLOWED_EMAILS = "bo@example.com";
    const res = await callTool("anna");
    process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("Ditt konto har inte längre tillgång till Hemmafix.");
  });
});
