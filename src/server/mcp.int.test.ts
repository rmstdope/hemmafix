import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pg } from "@/db";
import { chore, choreInstance, floor, household, membership, room, user } from "@/db/schema";

process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com, eve@example.com";
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
    expect(res.result.tools.map((t: { name: string }) => t.name).sort()).toEqual([
      "andra_roll",
      "lista_familjen",
      "lista_oppna_sysslor",
      "lista_vaningar_och_rum",
      "visa_gjort",
    ]);
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
    process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com, eve@example.com";
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

const call = (userId: string, name: string, args: Record<string, unknown> = {}) =>
  rpc(userId, "tools/call", { name, arguments: args });
const textOf = (res: { result: { content: { text: string }[] } }) => res.result.content[0]!.text;

/** Anna's home: Plan 2 (Badrum, Sovrum) above Plan 1 (Kök); a neighbouring home with its own data. */
async function seedHomes() {
  const [f1, f2] = (await db
    .insert(floor)
    .values([
      { householdId: homeId, name: "1", position: 1 },
      { householdId: homeId, name: "2", position: 2 },
    ])
    .returning({ id: floor.id })) as [{ id: string }, { id: string }];
  const [kok, badrum] = await db
    .insert(room)
    .values([
      { householdId: homeId, floorId: f1.id, name: "Kök" },
      { householdId: homeId, floorId: f2.id, name: "Badrum" },
    ])
    .returning({ id: room.id });
  const [other] = await db.insert(household).values({ name: "Grannar" }).returning({ id: household.id });
  const [of] = await db.insert(floor).values({ householdId: other!.id, name: "1", position: 1 }).returning({ id: floor.id });
  const [garage] = await db.insert(room).values({ householdId: other!.id, floorId: of!.id, name: "Garage" }).returning({ id: room.id });
  await db.insert(user).values({ id: "eve", name: "Eve", email: "eve@example.com", emailVerified: true });
  await db.insert(membership).values({ userId: "eve", householdId: other!.id, role: "adult" });
  return { f1: f1.id, f2: f2.id, kok: kok!.id, badrum: badrum!.id, garage: garage!.id, otherFloor: of!.id };
}

async function addTask(roomId: string, title: string, householdId: string, assigneeId: string | null) {
  const [c] = await db.insert(chore).values({ householdId, roomId, title }).returning({ id: chore.id });
  await db.insert(choreInstance).values({ choreId: c!.id, householdId, assigneeId });
}

describe("floors and rooms", () => {
  it("lists the home's floors top first with their rooms, and nothing from another home", async () => {
    const ids = await seedHomes();
    const text = textOf(await call("anna", "lista_vaningar_och_rum"));
    expect(text).toBe(`Plan 2 [${ids.f2}]\n- Badrum [${ids.badrum}]\n\nPlan 1 [${ids.f1}]\n- Kök [${ids.kok}]`);
    expect(text).not.toContain("Garage");
  });
});

describe("the family", () => {
  it("lists members with roles and not another home's members", async () => {
    await seedHomes();
    const text = textOf(await call("anna", "lista_familjen"));
    expect(text).toBe("- Anna – Vuxen [anna]\n- Bo – Barn [bo]");
  });
});

describe("open tasks, filtered as in the app", () => {
  it("filters on room, floor, person, myself and unassigned", async () => {
    const ids = await seedHomes();
    await addTask(ids.kok, "Diska", homeId, "anna");
    await addTask(ids.badrum, "Torka", homeId, "bo");
    await addTask(ids.badrum, "Skura", homeId, null);
    const lines = async (args: Record<string, unknown>) => textOf(await call("anna", "lista_oppna_sysslor", args)).split("\n");

    expect(await lines({ rum: ids.kok })).toEqual(["- Diska – Kök · Plan 1, Anna, inget datum"]);
    expect(await lines({ vaning: ids.f2 })).toHaveLength(2);
    expect(await lines({ vem: "bo" })).toEqual(["- Torka – Badrum · Plan 2, Bo, inget datum"]);
    expect(await lines({ vem: "jag" })).toEqual(["- Diska – Kök · Plan 1, Anna, inget datum"]);
    expect(await lines({ vem: "ingen" })).toEqual(["- Skura – Badrum · Plan 2, ingen tilldelad, inget datum"]);
    expect(await lines({})).toHaveLength(3);
  });

  it("never shows another home's tasks, and refuses another home's ids", async () => {
    const ids = await seedHomes();
    const [other] = await db.select({ id: household.id }).from(household).where(eq(household.name, "Grannar"));
    await addTask(ids.garage, "Städa garaget", other!.id, "eve");
    expect(textOf(await call("anna", "lista_oppna_sysslor"))).toBe("Inget är kvar att göra just nu.");
    const room = await call("anna", "lista_oppna_sysslor", { rum: ids.garage });
    expect(room.result.isError).toBe(true);
    expect(textOf(room)).toBe("Rummet finns inte i hemmet");
    expect(textOf(await call("anna", "lista_oppna_sysslor", { vaning: ids.otherFloor }))).toBe("Våningen finns inte i hemmet");
    expect(textOf(await call("anna", "lista_oppna_sysslor", { vem: "eve" }))).toBe("Personen finns inte i hemmet");
  });
});

describe("what someone has done", () => {
  const done = async (roomId: string, title: string, householdId: string, by: string, daysAgo: number) => {
    const [c] = await db.insert(chore).values({ householdId, roomId, title }).returning({ id: chore.id });
    await db.insert(choreInstance).values({
      choreId: c!.id,
      householdId,
      completedById: by,
      completedAt: new Date(Date.now() - daysAgo * 86_400_000),
      doneTitle: title,
      doneRoomId: roomId,
    });
  };

  it("shows my own by default and another member's, within the period", async () => {
    const ids = await seedHomes();
    await done(ids.kok, "Diska", homeId, "anna", 0);
    await done(ids.kok, "Dammsug", homeId, "anna", 10);
    await done(ids.badrum, "Torka", homeId, "bo", 1);

    const mine = textOf(await call("anna", "visa_gjort", { period: 30 }));
    expect(mine).toContain("Anna har gjort, senaste månaden");
    expect(mine).toContain("Diska – Kök · Plan 1");
    expect(mine).toContain("Dammsug");
    expect(mine).not.toContain("Torka");

    const week = textOf(await call("anna", "visa_gjort", { period: 7 }));
    expect(week).toContain("Diska");
    expect(week).not.toContain("Dammsug");

    const bos = textOf(await call("anna", "visa_gjort", { vem: "bo" }));
    expect(bos).toContain("Bo har gjort");
    expect(bos).toContain("Torka");
  });

  it("keeps what was done in a deleted task", async () => {
    const ids = await seedHomes();
    await done(ids.kok, "Diska", homeId, "anna", 0);
    await db.update(chore).set({ archivedAt: new Date() });
    expect(textOf(await call("anna", "visa_gjort"))).toContain("Diska");
  });

  it("says so when nothing was done, and keeps what was done in a removed room", async () => {
    const ids = await seedHomes();
    expect(textOf(await call("anna", "visa_gjort"))).toBe("Inget gjort under perioden.");
    await done(ids.kok, "Diska", homeId, "anna", 0);
    await db.update(room).set({ archivedAt: new Date() }).where(and(eq(room.id, ids.kok)));
    expect(textOf(await call("anna", "visa_gjort"))).toContain("Diska");
  });

  it("refuses another home's person and an invalid period in Swedish", async () => {
    await seedHomes();
    const other = await call("anna", "visa_gjort", { vem: "eve" });
    expect(other.result.isError).toBe(true);
    expect(textOf(other)).toBe("Personen finns inte i hemmet");
    const bad = await call("anna", "visa_gjort", { period: 5 });
    expect(bad.result.isError).toBe(true);
    expect(textOf(bad)).toBe("Ogiltig period");
    expect(textOf(await call("anna", "visa_gjort", { period: "30" }))).toBe("Inget gjort under perioden.");
  });
});

describe("empty filters", () => {
  it("are refused, not read as no filter", async () => {
    await seedHomes();
    for (const args of [{ rum: "" }, { vaning: "" }, { vem: "" }]) {
      expect((await call("anna", "lista_oppna_sysslor", args)).result.isError).toBe(true);
    }
  });
});

describe("every tool re-checks who is asking", () => {
  it.each(["lista_vaningar_och_rum", "lista_familjen", "lista_oppna_sysslor", "visa_gjort"])("%s refuses an address removed from the allowlist", async (tool) => {
    process.env.ALLOWED_EMAILS = "bo@example.com";
    const res = await call("anna", tool);
    process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com, eve@example.com";
    expect(res.result.isError).toBe(true);
    expect(textOf(res)).toContain("Ditt konto har inte längre tillgång till Hemmafix.");
  });

  it.each(["lista_vaningar_och_rum", "lista_familjen", "lista_oppna_sysslor", "visa_gjort"])("%s refuses a child", async (tool) => {
    const res = await call("bo", tool);
    expect(res.result.isError).toBe(true);
    expect(textOf(res)).toBe("Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.");
  });
});
