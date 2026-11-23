import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { and, eq, isNull } from "drizzle-orm";
import { db, pg } from "@/db";
import { badgeAward, chore, choreInstance, floor, household, lookPurchase, membership, room, user } from "@/db/schema";
import { BADGE_KEYS } from "@/lib/badges";
import { todayIso } from "@/lib/dates";
import { completeInstance, getCoinTotal, TASKS_CHANNEL } from "./chores";

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
    expect(res.result.tools.map((t: { name: string }) => t.name)).toEqual(
      expect.arrayContaining([
        "byt_namn_pa_hemmet",
        "byt_namn_pa_rum",
        "byt_namn_pa_vaning",
        "flytta_vaning",
        "lagg_till_rum",
        "lagg_till_vaning",
        "ta_bort_rum",
        "ta_bort_vaning",
        "andra_roll",
        "lista_familjen",
        "lista_oppna_sysslor",
        "lista_vaningar_och_rum",
        "visa_gjort",
      ]),
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
    process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com, eve@example.com";
    expect(res.result.isError).toBe(true);
    expect(res.result.content[0].text).toContain("Ditt konto har inte längre tillgång till Hemmafix.");
  });
});


// ---------------------------------------------------------------------------
// Changing tasks
// ---------------------------------------------------------------------------

const taskCall = async (userId: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await rpc(userId, "tools/call", { name, arguments: args });
  return res.result as { isError?: boolean; content: { text: string }[] };
};
const said = (r: { content: { text: string }[] }) => r.content[0]!.text;

async function seedKitchen(floorName = "Plan 1") {
  const [f] = await db.insert(floor).values({ householdId: homeId, name: floorName, position: 1 }).returning({ id: floor.id });
  const [r] = await db.insert(room).values({ householdId: homeId, floorId: f!.id, name: "Kök" }).returning({ id: room.id });
  return r!.id;
}
const openOf = (choreId: string) =>
  db.select().from(choreInstance).where(and(eq(choreInstance.choreId, choreId), isNull(choreInstance.completedAt)));
async function createDiska(roomId: string) {
  const r = await taskCall("anna", "skapa_syssla", { title: "Diska", roomId, kind: "recurring", interval: 1, unit: "day" });
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
    expect(destructive).toEqual([
      "andra_roll",
      "andra_syssla",
      "ta_bort_rum",
      "ta_bort_rutin",
      "ta_bort_syssla",
      "ta_bort_uppgift_ur_rutin",
      "ta_bort_vaning",
      "tilldela_syssla",
    ]);
    expect(tools.find((t) => t.name === "visa_sysslor_med_id")?.annotations?.readOnlyHint).toBe(true);
  });

  it("describes no input with a type array, which some clients refuse", async () => {
    const res = await rpc("anna", "tools/list");
    const arrays = (node: unknown, path: string): string[] =>
      Array.isArray(node)
        ? node.flatMap((n, i) => arrays(n, `${path}[${i}]`))
        : node && typeof node === "object"
          ? Object.entries(node).flatMap(([k, v]) =>
              k === "type" && Array.isArray(v) ? [path] : arrays(v, `${path}.${k}`),
            )
          : [];
    const tools = res.result.tools as { name: string; inputSchema: unknown }[];
    expect(tools.flatMap((t) => arrays(t.inputSchema, t.name))).toEqual([]);
  });

  it("tells andra_syssla how a Swedish schedule phrase maps to interval and unit", async () => {
    const res = await rpc("anna", "tools/list");
    const tools = res.result.tools as {
      name: string;
      inputSchema: { properties: Record<string, { description?: string }> };
    }[];
    const props = tools.find((t) => t.name === "andra_syssla")!.inputSchema.properties;
    expect(props.interval.description).toContain("Varannan vecka = 2 week");
    expect(props.unit.description).toContain("Varannan vecka = 2 week");
    expect(props.kind.description).toContain("Saknar uppgiften en schemafras i visa_sysslor_med_id är den once");
  });

  it("says uppgift, never the old word, in every tool title, description and schema hint", async () => {
    const res = await rpc("anna", "tools/list");
    const tools = res.result.tools as { name: string }[];
    const names = tools.map((t) => t.name);
    // Tool identifiers keep their names; only the words a person may read count.
    const words = (value: unknown): string[] => {
      if (typeof value === "string") return [value];
      if (Array.isArray(value)) return value.flatMap(words);
      if (value && typeof value === "object") return Object.values(value).flatMap(words);
      return [];
    };
    const text = tools
      .flatMap((t) => words({ ...t, name: undefined }))
      .map((s) => names.reduce((acc, n) => acc.split(n).join(""), s))
      .join("\n");
    expect(text).not.toMatch(/syssl/i);
  });

  it("marks every tool that only reads as read-only", async () => {
    const res = await rpc("anna", "tools/list");
    const tools = res.result.tools as { name: string; annotations?: { readOnlyHint?: boolean } }[];
    const readOnly = tools.filter((t) => t.annotations?.readOnlyHint === true).map((t) => t.name).sort();
    expect(readOnly).toEqual([
      "lista_familjen",
      "lista_oppna_sysslor",
      "lista_vaningar_och_rum",
      "visa_gjort",
      "visa_rutiner",
      "visa_sysslor_med_id",
    ]);
  });

  it("shows the ids Claude needs", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    const text = said(await taskCall("anna", "visa_sysslor_med_id"));
    expect(text).toContain(`(uppgift ${choreId}, tillfälle ${instanceId}, nästa datum ${todayIso()})`);
    expect(text).toContain("- Diska – Kök · Plan 1, ingen tilldelad, Idag, Varje dag, 10 mynt (");
    expect(text).not.toMatch(/kind |interval |unit |dueDate/);
    expect(text).toContain(`- Kök, Plan 1 (id ${roomId})`);
    expect(text).toContain("- Bo, barn (id bo)");
  });

  it("names a numbered floor in the lookup as the app does", async () => {
    const roomId = await seedKitchen("1");
    expect(said(await taskCall("anna", "visa_sysslor_med_id"))).toContain(`- Kök, Plan 1 (id ${roomId})`);
  });

  it("creates a recurring task from a predefined one, due today", async () => {
    const roomId = await seedKitchen();
    const r = await taskCall("anna", "skapa_syssla", { title: "Diska", templateKey: "diska", roomId, kind: "recurring", interval: 1, unit: "day" });
    expect(said(r)).toBe("Uppgiften Diska är skapad i Kök.");
    const [c] = await db.select().from(chore);
    expect(c).toMatchObject({ title: "Diska", templateKey: "diska", recurrenceUnit: "day", recurrenceInterval: 1 });
  });

  it("creates a one-off task with a due date and an assignee", async () => {
    const roomId = await seedKitchen();
    const r = await taskCall("anna", "skapa_syssla", { title: "Byt glödlampa", roomId, kind: "once", dueDate: "2026-12-01", assigneeId: "bo" });
    expect(r.isError).toBeFalsy();
    const [i] = await db.select().from(choreInstance);
    expect(i).toMatchObject({ dueDate: "2026-12-01", assigneeId: "bo" });
  });

  it("gives the amount of coins when creating and changing a task, 10 when left out, unchanged when left out on a change", async () => {
    const roomId = await seedKitchen();
    await taskCall("anna", "skapa_syssla", { title: "Putsa", roomId, kind: "once", mynt: 35 });
    await taskCall("anna", "skapa_syssla", { title: "Damma", roomId, kind: "once" });
    const coinsOf = async (title: string) => (await db.select().from(chore).where(eq(chore.title, title)))[0]!.coins;
    expect(await coinsOf("Putsa")).toBe(35);
    expect(await coinsOf("Damma")).toBe(10);

    const [c] = await db.select().from(chore).where(eq(chore.title, "Putsa"));
    const [i] = await openOf(c!.id);
    await taskCall("anna", "andra_syssla", { instanceId: i!.id, title: "Putsa fönster", roomId, kind: "once" });
    expect(await coinsOf("Putsa fönster")).toBe(35);
    await taskCall("anna", "andra_syssla", { instanceId: i!.id, title: "Putsa fönster", roomId, kind: "once", mynt: 60 });
    expect(await coinsOf("Putsa fönster")).toBe(60);

    const bad = await taskCall("anna", "skapa_syssla", { title: "Dyr", roomId, kind: "once", mynt: 500 });
    expect(bad).toMatchObject({ isError: true });
    expect(said(bad)).toBe("Mynt måste vara ett heltal mellan 0 och 100");
    expect(said(await taskCall("anna", "visa_sysslor_med_id"))).toContain("60 mynt");
  });

  it("creates a one-off with no deadline when the kind is left out, and says so in the tool description", async () => {
    const roomId = await seedKitchen();
    const r = await taskCall("anna", "skapa_syssla", { title: "Laga cykeln", roomId });
    expect(r.isError).toBeFalsy();
    const [c] = await db.select().from(chore).where(eq(chore.title, "Laga cykeln"));
    expect(c).toMatchObject({ recurrenceUnit: null, recurrenceInterval: null });
    const [i] = await openOf(c!.id);
    expect(i).toMatchObject({ dueDate: null });

    const tools = (await rpc("anna", "tools/list")).result.tools as { name: string; inputSchema: { properties: { kind: { description: string } } } }[];
    const create = tools.find((t) => t.name === "skapa_syssla")!;
    expect(create.inputSchema.properties.kind.description).toContain("Utelämnad kind ger once");
  });

  it("answers in Swedish when the room is not in the home or the input is wrong", async () => {
    await seedKitchen();
    const other = await taskCall("anna", "skapa_syssla", { title: "X", roomId: crypto.randomUUID(), kind: "once" });
    expect(other).toMatchObject({ isError: true });
    expect(said(other)).toBe("Rummet finns inte i hemmet");
    const empty = await taskCall("anna", "skapa_syssla", { title: " ", roomId: crypto.randomUUID(), kind: "once" });
    expect(empty.isError).toBe(true);
    expect(said(empty)).toBe("Skriv vad som ska göras");
  });

  it("ticks off a task, which comes back one interval later, and undoes the tick", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    expect(said(await taskCall("anna", "bocka_av_syssla", { instanceId }))).toBe("Klart: Diska är avbockad.");
    const [next] = await openOf(choreId);
    expect(next!.id).not.toBe(instanceId);
    expect(said(await taskCall("anna", "angra_avbockning", { instanceId }))).toBe("Diska är inte längre avbockad.");
    const open = await openOf(choreId);
    expect(open.map((i) => i.id)).toEqual([instanceId]);
  });

  it("earns coins for a tick and takes them back with the undo", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    const anna = { userId: "anna", householdId: homeId, role: "adult" as const, name: "Anna", image: null };
    // The coins of a tick alone: Anna has won every badge already, so this tick wins none.
    await db.insert(badgeAward).values(BADGE_KEYS.map((key) => ({ householdId: homeId, userId: "anna", key, coins: 0 })));
    expect(await getCoinTotal(anna)).toBe(0);
    await taskCall("anna", "bocka_av_syssla", { instanceId });
    expect(await getCoinTotal(anna)).toBe(10);
    await taskCall("anna", "angra_avbockning", { instanceId });
    expect(await getCoinTotal(anna)).toBe(0);
  });

  it("names the minus when an undo takes back coins that were already spent", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    await taskCall("anna", "bocka_av_syssla", { instanceId });
    await db.insert(lookPurchase).values({ householdId: homeId, userId: "anna", kind: "coin", key: "silver", price: 10 });
    expect(said(await taskCall("anna", "angra_avbockning", { instanceId }))).toBe(
      "Diska är inte avbockad längre. Mynten var redan använda, så du har nu −10 mynt.",
    );
  });

  it("names the person when an adult undoes someone else's spent tick", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    await completeInstance({ userId: "bo", householdId: homeId, role: "child" }, instanceId);
    await db.insert(lookPurchase).values({ householdId: homeId, userId: "bo", kind: "coin", key: "silver", price: 10 });
    expect(said(await taskCall("anna", "angra_avbockning", { instanceId }))).toBe(
      "Diska är inte avbockad längre. Mynten var redan använda, så Bo har nu −10 mynt.",
    );
  });

  it("ticking off twice says so", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    await taskCall("anna", "bocka_av_syssla", { instanceId });
    const again = await taskCall("anna", "bocka_av_syssla", { instanceId });
    expect(again.isError).toBe(true);
    expect(said(again)).toBe("Någon har redan bockat av den");
  });

  it("assigns this time only, or every time", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    expect(said(await taskCall("anna", "tilldela_syssla", { id: instanceId, assigneeId: "bo", scope: "denna_gang" }))).toBe(
      "Diska är tilldelad Bo den här gången.",
    );
    const [c1] = await db.select().from(chore).where(eq(chore.id, choreId));
    expect(c1!.assigneeId).toBeNull();
    expect((await openOf(choreId))[0]!.assigneeId).toBe("bo");

    expect(said(await taskCall("anna", "tilldela_syssla", { id: choreId, assigneeId: "anna", scope: "varje_gang" }))).toBe(
      "Diska är tilldelad Anna varje gång.",
    );
    const [c2] = await db.select().from(chore).where(eq(chore.id, choreId));
    expect(c2!.assigneeId).toBe("anna");
    expect((await openOf(choreId))[0]!.assigneeId).toBe("anna");

    expect(said(await taskCall("anna", "tilldela_syssla", { id: choreId, scope: "varje_gang" }))).toBe(
      "Diska är inte längre tilldelad någon varje gång.",
    );
  });

  it("edits a task and the history keeps the old title", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    await taskCall("anna", "bocka_av_syssla", { instanceId });
    const [next] = await openOf(choreId);
    const r = await taskCall("anna", "andra_syssla", { instanceId: next!.id, title: "Diska och torka", roomId, kind: "recurring", interval: 2, unit: "day" });
    expect(said(r)).toBe("Uppgiften Diska och torka är ändrad.");
    const [c] = await db.select().from(chore).where(eq(chore.id, choreId));
    expect(c).toMatchObject({ title: "Diska och torka", recurrenceInterval: 2 });
    const [done] = await db.select().from(choreInstance).where(eq(choreInstance.id, instanceId));
    expect(done!.doneTitle).toBe("Diska");
  });

  it("removes a task but keeps what was done", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    await taskCall("anna", "bocka_av_syssla", { instanceId });
    expect(said(await taskCall("anna", "ta_bort_syssla", { choreId }))).toBe(
      "Uppgiften Diska är borttagen. Det som redan är gjort finns kvar i historiken.",
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
    const res = await taskCall("anna", "bocka_av_syssla", { instanceId: i!.id });
    expect(res.isError).toBe(true);
    expect(await openOf(c!.id)).toHaveLength(1);
  });

  it("edits from what the lookup shows without changing anything else", async () => {
    const roomId = await seedKitchen();
    await taskCall("anna", "skapa_syssla", { title: "Diska", roomId, kind: "recurring", interval: 2, unit: "week", startDate: "2027-03-01" });
    const lookup = said(await taskCall("anna", "visa_sysslor_med_id"));
    const [, instanceId] = /Varannan vecka, 10 mynt \(uppgift [0-9a-f-]{36}, tillfälle ([0-9a-f-]{36}), nästa datum 2027-03-01\)/.exec(lookup) ?? [];
    expect(instanceId).toBeDefined();
    const r = await taskCall("anna", "andra_syssla", { instanceId, title: "Diska och torka", roomId, kind: "recurring", interval: 2, unit: "week", dueDate: "2027-03-01" });
    expect(r.isError).toBeFalsy();
    const [c] = await db.select().from(chore);
    expect(c).toMatchObject({ title: "Diska och torka", recurrenceUnit: "week", recurrenceInterval: 2 });
    expect((await openOf(c!.id))[0]!.dueDate).toBe("2027-03-01");
  });

  it("does not say a task was removed when nothing was", async () => {
    const roomId = await seedKitchen();
    const { choreId, instanceId } = await createDiska(roomId);
    for (const wrong of [instanceId, crypto.randomUUID()]) {
      const r = await taskCall("anna", "ta_bort_syssla", { choreId: wrong });
      expect(r.isError).toBe(true);
      expect(said(r)).toBe("Uppgiften finns inte längre");
    }
    expect(await openOf(choreId)).toHaveLength(1);
    await taskCall("anna", "ta_bort_syssla", { choreId });
    const twice = await taskCall("anna", "ta_bort_syssla", { choreId });
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
    for (const [name, args] of attempts) expect((await taskCall("anna", name, args)).isError).toBe(true);
    const [after] = await db.select().from(chore).where(eq(chore.id, c!.id));
    expect(after).toMatchObject({ title: "Främmande", archivedAt: null, assigneeId: null });
  });

  it("refuses an unknown predefined task and someone outside the home", async () => {
    const roomId = await seedKitchen();
    const unknown = await taskCall("anna", "skapa_syssla", { title: "X", templateKey: "finns-inte", roomId, kind: "once" });
    expect(said(unknown)).toBe("Okänd fördefinierad uppgift");
    const { instanceId } = await createDiska(roomId);
    const stranger = await taskCall("anna", "tilldela_syssla", { id: instanceId, assigneeId: "nobody", scope: "denna_gang" });
    expect(stranger.isError).toBe(true);
    expect(said(stranger)).toBe("Personen finns inte i hemmet");
  });

  it("refuses an edit from an occurrence ticked off in the meantime", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    await taskCall("anna", "bocka_av_syssla", { instanceId });
    const r = await taskCall("anna", "andra_syssla", { instanceId, title: "Diska", roomId, kind: "recurring", interval: 1, unit: "day" });
    expect(r.isError).toBe(true);
    expect(said(r)).toContain("Någon har bockat av den under tiden");
  });

  it("says so when undoing an occurrence that is not ticked off", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    const r = await taskCall("anna", "angra_avbockning", { instanceId });
    expect(r.isError).toBe(true);
    expect(said(r)).toBe("Den är inte avbockad");
  });

  it("answers in Swedish, and a child still gets the child text, when the input is malformed", async () => {
    const bad = await taskCall("anna", "bocka_av_syssla", { instanceId: "inte-ett-id" });
    expect(bad.isError).toBe(true);
    expect(said(bad)).toBe("Ogiltigt id. Hämta id:n med visa_sysslor_med_id.");
    const child = await taskCall("bo", "bocka_av_syssla", { instanceId: "inte-ett-id" });
    expect(said(child)).toBe("Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.");
  });

  it("answers a bad scope, kind or unit in Swedish", async () => {
    const roomId = await seedKitchen();
    const { instanceId } = await createDiska(roomId);
    expect(said(await taskCall("anna", "tilldela_syssla", { id: instanceId, scope: "alla" }))).toBe("Välj denna_gang eller varje_gang");
    expect(said(await taskCall("anna", "skapa_syssla", { title: "X", roomId, kind: "weekly" }))).toBe("Välj återkommande eller en gång");
    expect(said(await taskCall("anna", "skapa_syssla", { title: "X", roomId, kind: "recurring", interval: 1, unit: "weeks" }))).toBe("Välj dag, vecka eller månad");
  });

  it("tells every other household device that something changed", async () => {
    const roomId = await seedKitchen();
    let resolveHeard!: (payload: string) => void;
    const heard = new Promise<string>((resolve) => (resolveHeard = resolve));
    const listener = await pg.listen(TASKS_CHANNEL, (payload) => resolveHeard(payload));
    try {
      await taskCall("anna", "skapa_syssla", { title: "Diska", roomId, kind: "once" });
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
    ["tilldela_syssla", { id: "00000000-0000-4000-8000-000000000000", scope: "denna_gang" }],
    ["bocka_av_syssla", { instanceId: "00000000-0000-4000-8000-000000000000" }],
    ["angra_avbockning", { instanceId: "00000000-0000-4000-8000-000000000000" }],
  ])("%s refuses a child and a removed address", async (name, args) => {
    const child = await taskCall("bo", name, args);
    expect(child.isError).toBe(true);
    expect(said(child)).toBe("Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.");
    process.env.ALLOWED_EMAILS = "bo@example.com";
    const removed = await taskCall("anna", name, args);
    process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
    expect(removed.isError).toBe(true);
    expect(said(removed)).toContain("Ditt konto har inte längre tillgång till Hemmafix.");
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
