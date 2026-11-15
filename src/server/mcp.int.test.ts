import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, pg } from "@/db";
import { chore, choreInstance, floor, household, membership, room, user } from "@/db/schema";
import { todayIso } from "@/lib/dates";
import { TASKS_CHANNEL } from "./chores";

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
    expect(res.result.tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining(["lista_oppna_sysslor"]),
    );
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


// ---------------------------------------------------------------------------
// Changing tasks
// ---------------------------------------------------------------------------

const call = async (userId: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await rpc(userId, "tools/call", { name, arguments: args });
  return res.result as { isError?: boolean; content: { text: string }[] };
};
const said = (r: { content: { text: string }[] }) => r.content[0]!.text;

async function seedKitchen() {
  const [f] = await db.insert(floor).values({ householdId: homeId, name: "Plan 1", position: 1 }).returning({ id: floor.id });
  const [r] = await db.insert(room).values({ householdId: homeId, floorId: f!.id, name: "Kök" }).returning({ id: room.id });
  return r!.id;
}
const openOf = (choreId: string) =>
  db.select().from(choreInstance).where(and(eq(choreInstance.choreId, choreId), isNull(choreInstance.completedAt)));
async function createDiska(roomId: string) {
  const r = await call("anna", "skapa_syssla", { title: "Diska", roomId, kind: "recurring", interval: 1, unit: "day" });
  expect(r.isError).toBeFalsy();
  const [c] = await db.select().from(chore).where(eq(chore.title, "Diska"));
  const [i] = await openOf(c!.id);
  return { choreId: c!.id, instanceId: i!.id };
}

describe("the task tools", () => {
  const TASK_TOOLS = [
    "visa_sysslor_med_id",
    "skapa_syssla",
    "andra_syssla",
    "ta_bort_syssla",
    "tilldela_syssla",
    "bocka_av_syssla",
    "angra_avbockning",
  ];

  it("asks the client to confirm exactly what removes or overwrites", async () => {
    const res = await rpc("anna", "tools/list");
    const tools = res.result.tools as { name: string; annotations?: { destructiveHint?: boolean; readOnlyHint?: boolean } }[];
    expect(tools.map((t) => t.name)).toEqual(expect.arrayContaining(TASK_TOOLS));
    const destructive = tools.filter((t) => t.annotations?.destructiveHint === true).map((t) => t.name).sort();
    expect(destructive).toEqual(["andra_syssla", "ta_bort_syssla", "tilldela_syssla"]);
    expect(tools.find((t) => t.name === "visa_sysslor_med_id")?.annotations?.readOnlyHint).toBe(true);
  });

  it("shows the ids Claude needs", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    const text = said(await call("anna", "visa_sysslor_med_id"));
    expect(text).toContain(`(syssla ${choreId}, tillfälle ${instanceId}, kind recurring, interval 1, unit day, dueDate ${todayIso()})`);
    expect(text).toContain(`- Kök, Plan 1 (id ${roomId})`);
    expect(text).toContain("- Bo, barn (id bo)");
  });

  it("creates a recurring task from a predefined one, due today", async () => {
    const roomId = await seedKitchen();
    const r = await call("anna", "skapa_syssla", { title: "Diska", templateKey: "diska", roomId, kind: "recurring", interval: 1, unit: "day" });
    expect(said(r)).toBe("Sysslan Diska är skapad i Kök.");
    const [c] = await db.select().from(chore);
    expect(c).toMatchObject({ title: "Diska", templateKey: "diska", recurrenceUnit: "day", recurrenceInterval: 1 });
  });

  it("creates a one-off task with a due date and an assignee", async () => {
    const roomId = await seedKitchen();
    const r = await call("anna", "skapa_syssla", { title: "Byt glödlampa", roomId, kind: "once", dueDate: "2026-12-01", assigneeId: "bo" });
    expect(r.isError).toBeFalsy();
    const [i] = await db.select().from(choreInstance);
    expect(i).toMatchObject({ dueDate: "2026-12-01", assigneeId: "bo" });
  });

  it("answers in Swedish when the room is not in the home or the input is wrong", async () => {
    await seedKitchen();
    const other = await call("anna", "skapa_syssla", { title: "X", roomId: crypto.randomUUID(), kind: "once" });
    expect(other).toMatchObject({ isError: true });
    expect(said(other)).toBe("Rummet finns inte i hemmet");
    const empty = await call("anna", "skapa_syssla", { title: " ", roomId: crypto.randomUUID(), kind: "once" });
    expect(empty.isError).toBe(true);
    expect(said(empty)).toBe("Skriv vad som ska göras");
  });

  it("ticks off a task, which comes back one interval later, and undoes the tick", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    expect(said(await call("anna", "bocka_av_syssla", { instanceId }))).toBe("Klart: Diska är avbockad.");
    const [next] = await openOf(choreId);
    expect(next!.id).not.toBe(instanceId);
    expect(said(await call("anna", "angra_avbockning", { instanceId }))).toBe("Diska är inte längre avbockad.");
    const open = await openOf(choreId);
    expect(open.map((i) => i.id)).toEqual([instanceId]);
  });

  it("ticking off twice says so", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    await call("anna", "bocka_av_syssla", { instanceId });
    const again = await call("anna", "bocka_av_syssla", { instanceId });
    expect(again.isError).toBe(true);
    expect(said(again)).toBe("Någon har redan bockat av den");
  });

  it("assigns this time only, or every time", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    expect(said(await call("anna", "tilldela_syssla", { id: instanceId, assigneeId: "bo", scope: "denna_gang" }))).toBe(
      "Diska är tilldelad Bo den här gången.",
    );
    const [c1] = await db.select().from(chore).where(eq(chore.id, choreId));
    expect(c1!.assigneeId).toBeNull();
    expect((await openOf(choreId))[0]!.assigneeId).toBe("bo");

    expect(said(await call("anna", "tilldela_syssla", { id: choreId, assigneeId: "anna", scope: "varje_gang" }))).toBe(
      "Diska är tilldelad Anna varje gång.",
    );
    const [c2] = await db.select().from(chore).where(eq(chore.id, choreId));
    expect(c2!.assigneeId).toBe("anna");
    expect((await openOf(choreId))[0]!.assigneeId).toBe("anna");

    expect(said(await call("anna", "tilldela_syssla", { id: choreId, assigneeId: null, scope: "varje_gang" }))).toBe(
      "Diska är inte längre tilldelad någon varje gång.",
    );
  });

  it("edits a task and the history keeps the old title", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    await call("anna", "bocka_av_syssla", { instanceId });
    const [next] = await openOf(choreId);
    const r = await call("anna", "andra_syssla", { instanceId: next!.id, title: "Diska och torka", roomId, kind: "recurring", interval: 2, unit: "day" });
    expect(said(r)).toBe("Sysslan Diska och torka är ändrad.");
    const [c] = await db.select().from(chore).where(eq(chore.id, choreId));
    expect(c).toMatchObject({ title: "Diska och torka", recurrenceInterval: 2 });
    const [done] = await db.select().from(choreInstance).where(eq(choreInstance.id, instanceId));
    expect(done!.doneTitle).toBe("Diska");
  });

  it("removes a task but keeps what was done", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    await call("anna", "bocka_av_syssla", { instanceId });
    expect(said(await call("anna", "ta_bort_syssla", { choreId }))).toBe(
      "Sysslan Diska är borttagen. Det som redan är gjort finns kvar i historiken.",
    );
    expect(await openOf(choreId)).toEqual([]);
    const [done] = await db.select().from(choreInstance).where(eq(choreInstance.id, instanceId));
    expect(done!.completedAt).not.toBeNull();
  });

  it("does not touch another household's tasks", async () => {
    const [{ id: otherHome }] = (await db.insert(household).values({ name: "Annat" }).returning({ id: household.id })) as [{ id: string }];
    const [f] = await db.insert(floor).values({ householdId: otherHome, name: "1", position: 1 }).returning({ id: floor.id });
    const [r] = await db.insert(room).values({ householdId: otherHome, floorId: f!.id, name: "Kök" }).returning({ id: room.id });
    const [c] = await db.insert(chore).values({ householdId: otherHome, roomId: r!.id, title: "Främmande" }).returning({ id: chore.id });
    const [i] = await db.insert(choreInstance).values({ choreId: c!.id, householdId: otherHome }).returning({ id: choreInstance.id });
    const res = await call("anna", "bocka_av_syssla", { instanceId: i!.id });
    expect(res.isError).toBe(true);
    expect(await openOf(c!.id)).toHaveLength(1);
  });

  it("edits from what the lookup shows without changing anything else", async () => {
    const roomId = await seedKitchen();
    await call("anna", "skapa_syssla", { title: "Diska", roomId, kind: "recurring", interval: 2, unit: "week", startDate: "2027-03-01" });
    const lookup = said(await call("anna", "visa_sysslor_med_id"));
    const [, instanceId] = /tillfälle ([0-9a-f-]{36}), kind recurring, interval 2, unit week, dueDate 2027-03-01/.exec(lookup) ?? [];
    expect(instanceId).toBeDefined();
    const r = await call("anna", "andra_syssla", { instanceId, title: "Diska och torka", roomId, kind: "recurring", interval: 2, unit: "week", dueDate: "2027-03-01" });
    expect(r.isError).toBeFalsy();
    const [c] = await db.select().from(chore);
    expect(c).toMatchObject({ title: "Diska och torka", recurrenceUnit: "week", recurrenceInterval: 2 });
    expect((await openOf(c!.id))[0]!.dueDate).toBe("2027-03-01");
  });

  it("does not say a task was removed when nothing was", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    for (const wrong of [instanceId, crypto.randomUUID()]) {
      const r = await call("anna", "ta_bort_syssla", { choreId: wrong });
      expect(r.isError).toBe(true);
      expect(said(r)).toBe("Uppgiften finns inte längre");
    }
    expect(await openOf(choreId)).toHaveLength(1);
    await call("anna", "ta_bort_syssla", { choreId });
    const twice = await call("anna", "ta_bort_syssla", { choreId });
    expect(twice.isError).toBe(true);
  });

  it("does not remove, edit or assign another household's task", async () => {
    const [{ id: otherHome }] = (await db.insert(household).values({ name: "Annat" }).returning({ id: household.id })) as [{ id: string }];
    const [f] = await db.insert(floor).values({ householdId: otherHome, name: "1", position: 1 }).returning({ id: floor.id });
    const [r] = await db.insert(room).values({ householdId: otherHome, floorId: f!.id, name: "Kök" }).returning({ id: room.id });
    const [c] = await db.insert(chore).values({ householdId: otherHome, roomId: r!.id, title: "Främmande" }).returning({ id: chore.id });
    const [i] = await db.insert(choreInstance).values({ choreId: c!.id, householdId: otherHome }).returning({ id: choreInstance.id });
    const mine = await seedKitchen();
    const attempts: [string, Record<string, unknown>][] = [
      ["ta_bort_syssla", { choreId: c!.id }],
      ["andra_syssla", { instanceId: i!.id, title: "X", roomId: mine, kind: "once" }],
      ["tilldela_syssla", { id: c!.id, assigneeId: "anna", scope: "varje_gang" }],
      ["tilldela_syssla", { id: i!.id, assigneeId: "anna", scope: "denna_gang" }],
    ];
    for (const [name, args] of attempts) expect((await call("anna", name, args)).isError).toBe(true);
    const [after] = await db.select().from(chore).where(eq(chore.id, c!.id));
    expect(after).toMatchObject({ title: "Främmande", archivedAt: null, assigneeId: null });
  });

  it("refuses an unknown predefined task and someone outside the home", async () => {
    const roomId = await seedKitchen();
    const unknown = await call("anna", "skapa_syssla", { title: "X", templateKey: "finns-inte", roomId, kind: "once" });
    expect(said(unknown)).toBe("Okänd fördefinierad uppgift");
    const { instanceId } = await createDiska(roomId);
    const stranger = await call("anna", "tilldela_syssla", { id: instanceId, assigneeId: "nobody", scope: "denna_gang" });
    expect(stranger.isError).toBe(true);
    expect(said(stranger)).toBe("Personen finns inte i hemmet");
  });

  it("refuses an edit from an occurrence ticked off in the meantime", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    await call("anna", "bocka_av_syssla", { instanceId });
    const r = await call("anna", "andra_syssla", { instanceId, title: "Diska", roomId, kind: "recurring", interval: 1, unit: "day" });
    expect(r.isError).toBe(true);
    expect(said(r)).toContain("Någon har bockat av den under tiden");
  });

  it("says so when undoing an occurrence that is not ticked off", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    const r = await call("anna", "angra_avbockning", { instanceId });
    expect(r.isError).toBe(true);
    expect(said(r)).toBe("Den är inte avbockad");
  });

  it("answers in Swedish, and a child still gets the child text, when the input is malformed", async () => {
    const bad = await call("anna", "bocka_av_syssla", { instanceId: "inte-ett-id" });
    expect(bad.isError).toBe(true);
    expect(said(bad)).toBe("Ogiltigt id. Hämta id:n med visa_sysslor_med_id.");
    const child = await call("bo", "bocka_av_syssla", { instanceId: "inte-ett-id" });
    expect(said(child)).toBe("Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.");
  });

  it("answers a bad scope, kind or unit in Swedish", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    expect(said(await call("anna", "tilldela_syssla", { id: instanceId, assigneeId: null, scope: "alla" }))).toBe("Välj denna_gang eller varje_gang");
    expect(said(await call("anna", "skapa_syssla", { title: "X", roomId, kind: "weekly" }))).toBe("Välj återkommande eller en gång");
    expect(said(await call("anna", "skapa_syssla", { title: "X", roomId, kind: "recurring", interval: 1, unit: "weeks" }))).toBe("Välj dag, vecka eller månad");
  });

  it("tells every other household device that something changed", async () => {
    const roomId = await seedKitchen();
    let resolveHeard!: (payload: string) => void;
    const heard = new Promise<string>((resolve) => (resolveHeard = resolve));
    const listener = await pg.listen(TASKS_CHANNEL, (payload) => resolveHeard(payload));
    try {
      await call("anna", "skapa_syssla", { title: "Diska", roomId, kind: "once" });
      expect(await heard).toBe(homeId);
    } finally {
      await listener.unlisten();
    }
  });

  it.each([
    ["visa_sysslor_med_id", {}],
    ["skapa_syssla", { title: "X", roomId: "00000000-0000-4000-8000-000000000000", kind: "once" }],
    ["andra_syssla", { instanceId: "00000000-0000-4000-8000-000000000000", title: "X", roomId: "00000000-0000-4000-8000-000000000000", kind: "once" }],
    ["ta_bort_syssla", { choreId: "00000000-0000-4000-8000-000000000000" }],
    ["tilldela_syssla", { id: "00000000-0000-4000-8000-000000000000", assigneeId: null, scope: "denna_gang" }],
    ["bocka_av_syssla", { instanceId: "00000000-0000-4000-8000-000000000000" }],
    ["angra_avbockning", { instanceId: "00000000-0000-4000-8000-000000000000" }],
  ])("%s refuses a child and a removed address", async (name, args) => {
    const child = await call("bo", name, args);
    expect(child.isError).toBe(true);
    expect(said(child)).toBe("Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.");
    process.env.ALLOWED_EMAILS = "bo@example.com";
    const removed = await call("anna", name, args);
    process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
    expect(removed.isError).toBe(true);
    expect(said(removed)).toContain("Ditt konto har inte längre tillgång till Hemmafix.");
  });
});
