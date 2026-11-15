import { eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pg } from "@/db";
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
    expect(res.result.tools.map((t: { name: string }) => t.name).sort()).toEqual(["andra_roll", "lista_oppna_sysslor"]);
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

const changeRole = (userId: string, namn: string, roll: string) =>
  rpc(userId, "tools/call", { name: "andra_roll", arguments: { namn, roll } });
const roleOf = async (id: string) =>
  (await db.select({ role: membership.role }).from(membership).where(eq(membership.userId, id)))[0]?.role;

describe("the change-role tool", () => {
  it("is marked so the client asks for confirmation", async () => {
    const res = await rpc("anna", "tools/list");
    const tool = res.result.tools.find((t: { name: string }) => t.name === "andra_roll");
    expect(tool.annotations.readOnlyHint).toBe(false);
    expect(tool.annotations.destructiveHint).toBe(true);
  });

  it("makes a child an adult", async () => {
    const res = await changeRole("anna", "bo", "vuxen");
    expect(res.result.content[0].text).toBe("Bo är nu vuxen.");
    expect(await roleOf("bo")).toBe("adult");
  });

  it("changes nothing when the person already has the role", async () => {
    const res = await changeRole("anna", "Bo", "barn");
    expect(res.result.content[0].text).toBe("Bo är redan barn.");
    expect(await roleOf("bo")).toBe("child");
  });

  it("lets the home keep an adult: the last one cannot become a child", async () => {
    const res = await changeRole("anna", "Anna", "barn");
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toBe("Hemmet måste ha minst en vuxen");
    expect(await roleOf("anna")).toBe("adult");
  });

  it("lets an adult step down when another adult remains", async () => {
    await changeRole("anna", "Bo", "vuxen");
    const res = await changeRole("anna", "Anna", "barn");
    expect(res.result.content[0].text).toBe("Anna är nu barn.");
    expect(await roleOf("anna")).toBe("child");
  });

  it("finds a person with a full Google name by first name, and answers with the first name", async () => {
    await db.insert(user).values({ id: "cy", name: "Cy Berg", email: "cy@example.com", emailVerified: true });
    await db.insert(membership).values({ userId: "cy", householdId: homeId, role: "child" });
    const res = await changeRole("anna", "cy", "vuxen");
    expect(res.result.content[0].text).toBe("Cy är nu vuxen.");
    expect(await roleOf("cy")).toBe("adult");
    expect((await changeRole("anna", "Cy Berg", "barn")).result.content[0].text).toBe("Cy är nu barn.");
  });

  it("tells the family's open screens when a role changed, and only then", async () => {
    const seen: string[] = [];
    const sub = await pg.listen("hemmafix_tasks", (id) => void seen.push(id));
    await changeRole("bo", "Bo", "vuxen"); // refused
    await changeRole("anna", "Bo", "barn"); // no change
    await changeRole("anna", "Bo", "vuxen");
    await new Promise((r) => setTimeout(r, 200));
    await sub.unlisten();
    expect(seen).toEqual([homeId]);
  });

  it("takes effect for the next call: a person made a child is refused", async () => {
    await changeRole("anna", "Bo", "vuxen");
    await changeRole("bo", "Anna", "barn");
    const res = await changeRole("anna", "Bo", "barn");
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("Bara vuxna kan använda Hemmafix via Claude");
  });

  it("refuses a child and changes nothing", async () => {
    const res = await changeRole("bo", "Bo", "vuxen");
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("Bara vuxna kan använda Hemmafix via Claude");
    expect(await roleOf("bo")).toBe("child");
  });

  it("refuses an address removed from the allowlist", async () => {
    process.env.ALLOWED_EMAILS = "bo@example.com";
    let res;
    try {
      res = await changeRole("anna", "Bo", "vuxen");
    } finally {
      process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
    }
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("Ditt konto har inte längre tillgång");
    expect(await roleOf("bo")).toBe("child");
  });

  it("answers an unknown name, an ambiguous one and a bad role", async () => {
    expect((await changeRole("anna", "Cecilia", "vuxen")).result.content[0].text).toBe("Ingen i hemmet heter Cecilia.");
    await db.insert(user).values({ id: "bo2", name: "bo", email: "bo2@example.com", emailVerified: true });
    await db.insert(membership).values({ userId: "bo2", householdId: homeId, role: "child" });
    const dup = await changeRole("anna", "Bo", "vuxen");
    expect(dup.result.isError).toBe(true);
    expect(dup.result.content[0].text).toContain("Flera i hemmet heter Bo.");
    const bad = await changeRole("anna", "Anna", "kung");
    expect(bad.result.isError).toBe(true);
    expect(bad.result.content[0].text).toContain("vuxen");
    expect(bad.result.content[0].text).not.toMatch(/invalid|expected/i);
    const blank = await changeRole("anna", "  ", "vuxen");
    expect(blank.result.isError).toBe(true);
    expect(blank.result.content[0].text).toContain("namn");
  });

  it("does not reach a member of another household", async () => {
    const [other] = await db.insert(household).values({ name: "Grannen" }).returning({ id: household.id });
    await db.insert(user).values({ id: "cy", name: "Cy", email: "cy@example.com", emailVerified: true });
    await db.insert(membership).values({ userId: "cy", householdId: other!.id, role: "child" });
    const res = await changeRole("anna", "Cy", "vuxen");
    expect(res.result.content[0].text).toBe("Ingen i hemmet heter Cy.");
    expect(await roleOf("cy")).toBe("child");
  });
});
