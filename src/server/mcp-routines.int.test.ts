import { and, eq } from "drizzle-orm";
import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pg } from "@/db";
import { chore, choreInstance, floor, household, membership, room, routine, routineTask, user } from "@/db/schema";

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
  const json = body.includes("data: ") ? body.split("data: ").pop()! : body;
  return JSON.parse(json.trim());
};
const call = async (userId: string, name: string, args: Record<string, unknown> = {}) => {
  const res = await rpc(userId, "tools/call", { name, arguments: args });
  return res.result as { isError?: boolean; content: { text: string }[] };
};
const textOf = (r: { content: { text: string }[] }) => r.content[0]!.text;

let homeId: string;
let roomId: string;
let otherHomeRoutine: string;
const notified: string[] = [];
beforeAll(async () => {
  await pg.listen("hemmafix_tasks", (payload) => {
    notified.push(payload);
  });
});
beforeEach(async () => {
  await db.delete(user);
  await db.delete(household);
  notified.length = 0;
  [{ id: homeId }] = (await db.insert(household).values({ name: "Hemma" }).returning({ id: household.id })) as [{ id: string }];
  const [other] = await db.insert(household).values({ name: "Grannen" }).returning({ id: household.id });
  await db.insert(user).values([
    { id: "anna", name: "Anna", email: "anna@example.com", emailVerified: true },
    { id: "bo", name: "Bo", email: "bo@example.com", emailVerified: true },
  ]);
  await db.insert(membership).values([
    { userId: "anna", householdId: homeId, role: "adult" },
    { userId: "bo", householdId: homeId, role: "child" },
  ]);
  const [f] = await db.insert(floor).values({ householdId: homeId, name: "1", position: 1 }).returning({ id: floor.id });
  [{ id: roomId }] = (await db.insert(room).values({ householdId: homeId, floorId: f!.id, name: "Kök" }).returning({ id: room.id })) as [{ id: string }];
  const [r] = await db.insert(routine).values({ householdId: other!.id, name: "Grannens" }).returning({ id: routine.id });
  otherHomeRoutine = r!.id;
  // The home already holds its ready-made routines once seeded; start every test from a known set.
  await db.update(household).set({ routinesSeededAt: new Date() }).where(eq(household.id, homeId));
});
const settle = () => new Promise((r) => setTimeout(r, 200));
const idIn = (s: string) => /id ([0-9a-f-]{36})/.exec(s)![1]!;

const makeRoutine = async (name = "Städa", tasks = ["Dammsug", "Torka"]) => {
  const created = await call("anna", "skapa_rutin", { namn: name });
  const id = idIn(textOf(created));
  for (const titel of tasks) await call("anna", "lagg_till_uppgift_i_rutin", { routineId: id, titel });
  return id;
};

describe("listing routines", () => {
  it("shows routines, their tasks and ids; read-only, so nothing is announced", async () => {
    const id = await makeRoutine();
    await settle();
    notified.length = 0;
    const res = await call("anna", "visa_rutiner");
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toMatch(new RegExp(`^Städa \\[${id}\\]\\n- Dammsug \\[[0-9a-f-]{36}\\]\\n- Torka \\[[0-9a-f-]{36}\\]$`));
    await settle();
    expect(notified).toEqual([]);
  });

  it("says so when the home has none", async () => {
    expect(textOf(await call("anna", "visa_rutiner"))).toBe("Inga rutiner ännu.");
  });
});

describe("managing routines", () => {
  it("creates, renames and removes, announcing each change", async () => {
    const created = await call("anna", "skapa_rutin", { namn: "Städa" });
    expect(textOf(created)).toMatch(/^Rutinen Städa är skapad \(id [0-9a-f-]{36}\)\.$/);
    const id = idIn(textOf(created));
    expect(textOf(await call("anna", "byt_namn_pa_rutin", { routineId: id, namn: "Storstäda" }))).toBe("Rutinen heter nu Storstäda.");
    expect((await db.select().from(routine).where(eq(routine.id, id)))[0]!.name).toBe("Storstäda");
    expect(textOf(await call("anna", "ta_bort_rutin", { routineId: id }))).toBe(
      "Rutinen Storstäda togs bort. Uppgifter som redan lagts till i hemmet finns kvar.",
    );
    expect(await db.select().from(routine).where(eq(routine.id, id))).toHaveLength(0);
    await settle();
    expect(notified.length).toBeGreaterThan(0);
    expect(new Set(notified)).toEqual(new Set([homeId]));
  });

  it("answers the app's errors in Swedish and changes nothing", async () => {
    await call("anna", "skapa_rutin", { namn: "Städa" });
    const dup = await call("anna", "skapa_rutin", { namn: "städa" });
    expect(dup.isError).toBe(true);
    expect(textOf(dup)).toBe("Det finns redan en rutin som heter Städa");
    const gone = await call("anna", "ta_bort_rutin", { routineId: otherHomeRoutine });
    expect(gone.isError).toBe(true);
    expect(textOf(gone)).toBe("Rutinen finns inte längre");
    expect(await db.select().from(routine).where(eq(routine.id, otherHomeRoutine))).toHaveLength(1);
    const badId = await call("anna", "byt_namn_pa_rutin", { routineId: "nope", namn: "X" });
    expect(badId.isError).toBe(true);
    expect(textOf(badId)).toBe("Den här rutinen finns inte längre.");
    expect(textOf(await call("anna", "skapa_rutin", { namn: " " }))).toBe("Skriv rutinens namn");
  });
});

describe("tasks in a routine", () => {
  it("are added, renamed and removed", async () => {
    const id = await makeRoutine("Städa", []);
    const added = await call("anna", "lagg_till_uppgift_i_rutin", { routineId: id, titel: "Dammsug" });
    expect(textOf(added)).toMatch(/^Uppgiften Dammsug lades till i rutinen \(id [0-9a-f-]{36}\)\.$/);
    const taskId = idIn(textOf(added));
    expect(textOf(await call("anna", "byt_namn_pa_uppgift_i_rutin", { routineId: id, taskId, titel: "Dammsuga" }))).toBe("Uppgiften heter nu Dammsuga.");
    expect((await db.select().from(routineTask).where(eq(routineTask.id, taskId)))[0]!.title).toBe("Dammsuga");
    expect(textOf(await call("anna", "ta_bort_uppgift_ur_rutin", { routineId: id, taskId }))).toBe("Uppgiften togs bort ur rutinen.");
    expect(await db.select().from(routineTask).where(eq(routineTask.id, taskId))).toHaveLength(0);
  });

  it("refuse a duplicate and an unknown task, in Swedish", async () => {
    const id = await makeRoutine("Städa", ["Dammsug"]);
    const dup = await call("anna", "lagg_till_uppgift_i_rutin", { routineId: id, titel: "dammsug" });
    expect(dup.isError).toBe(true);
    expect(textOf(dup)).toBe("dammsug finns redan i rutinen");
    const missing = await call("anna", "ta_bort_uppgift_ur_rutin", { routineId: id, taskId: "x" });
    expect(missing.isError).toBe(true);
    expect(textOf(missing)).toBe("Uppgiften finns inte längre.");
  });
});

describe("adding a routine to a room", () => {
  it("creates the same separate recurring tasks as the app, in the routine's order", async () => {
    const id = await makeRoutine();
    const res = await call("anna", "lagg_till_rutin_i_hemmet", {
      routineId: id,
      roomId,
      kind: "recurring",
      interval: 2,
      unit: "week",
      startDate: "2026-12-01",
      assigneeId: "bo",
    });
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toBe("2 uppgifter är tillagda i Kök.");
    const chores = await db.select().from(chore).where(eq(chore.householdId, homeId));
    expect(chores.map((c) => c.title).sort()).toEqual(["Dammsug", "Torka"]);
    expect(chores.every((c) => c.roomId === roomId && c.assigneeId === "bo")).toBe(true);
    const instances = await db.select().from(choreInstance).where(eq(choreInstance.householdId, homeId));
    expect(instances.map((i) => i.dueDate)).toEqual(["2026-12-01", "2026-12-01"]);
    // The routine is a template: still there, untouched.
    expect(await db.select().from(routineTask).where(eq(routineTask.routineId, id))).toHaveLength(2);
    await settle();
    expect(notified.length).toBeGreaterThan(0);
  });

  it("adds one-off tasks with a due date and no person", async () => {
    const id = await makeRoutine("Flytt", ["Packa"]);
    const res = await call("anna", "lagg_till_rutin_i_hemmet", { routineId: id, roomId, kind: "once", dueDate: "2026-12-24" });
    expect(textOf(res)).toBe("1 uppgift är tillagd i Kök.");
    const [c] = await db.select().from(chore).where(and(eq(chore.householdId, homeId), eq(chore.title, "Packa")));
    expect(c!.assigneeId).toBeNull();
    const [i] = await db.select().from(choreInstance).where(eq(choreInstance.choreId, c!.id));
    expect(i!.dueDate).toBe("2026-12-24");
  });

  it("refuses a bad cadence, another home's routine, room or person, adding nothing", async () => {
    const id = await makeRoutine();
    const bad = await call("anna", "lagg_till_rutin_i_hemmet", { routineId: id, roomId, kind: "recurring" });
    expect(bad.isError).toBe(true);
    expect(textOf(bad)).toBe("Ange hur ofta");
    const foreign = await call("anna", "lagg_till_rutin_i_hemmet", { routineId: otherHomeRoutine, roomId, kind: "once" });
    expect(textOf(foreign)).toBe("Rutinen finns inte längre");
    const noRoom = await call("anna", "lagg_till_rutin_i_hemmet", { routineId: id, roomId: "nope", kind: "once" });
    expect(noRoom.isError).toBe(true);
    const stranger = await call("anna", "lagg_till_rutin_i_hemmet", { routineId: id, roomId, kind: "once", assigneeId: "nobody" });
    expect(stranger.isError).toBe(true);
    expect(await db.select().from(chore)).toHaveLength(0);
    await settle();
    // Only the setup writes were announced; none of the refusals.
    const before = notified.length;
    await call("anna", "lagg_till_rutin_i_hemmet", { routineId: id, roomId, kind: "once", assigneeId: "nobody" });
    await settle();
    expect(notified.length).toBe(before);
  });
});

describe("who may", () => {
  const tools: [string, Record<string, unknown>][] = [
    ["visa_rutiner", {}],
    ["skapa_rutin", { namn: "X" }],
    ["byt_namn_pa_rutin", { routineId: "x", namn: "X" }],
    ["ta_bort_rutin", { routineId: "x" }],
    ["lagg_till_uppgift_i_rutin", { routineId: "x", titel: "X" }],
    ["byt_namn_pa_uppgift_i_rutin", { routineId: "x", taskId: "x", titel: "X" }],
    ["ta_bort_uppgift_ur_rutin", { routineId: "x", taskId: "x" }],
    ["lagg_till_rutin_i_hemmet", { routineId: "x", roomId: "x", kind: "once" }],
  ];

  it("refuse a child on every tool, changing nothing", async () => {
    const id = await makeRoutine();
    await settle();
    notified.length = 0;
    for (const [name, args] of tools) {
      const res = await call("bo", name, { ...args, ...(name.includes("rutin") && "routineId" in args ? { routineId: id } : {}) });
      expect(res.isError, name).toBe(true);
      expect(textOf(res), name).toContain("Bara vuxna");
    }
    expect(await db.select().from(chore)).toHaveLength(0);
    expect((await db.select().from(routine).where(eq(routine.id, id)))[0]!.name).toBe("Städa");
    await settle();
    expect(notified).toEqual([]);
  });

  it("refuse an address removed from the allowlist", async () => {
    process.env.ALLOWED_EMAILS = "bo@example.com";
    const res = await call("anna", "visa_rutiner");
    process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
    expect(res.isError).toBe(true);
    expect(textOf(res)).toContain("inte längre tillgång");
  });
});

describe("tool annotations", () => {
  it("ask the client to confirm exactly the removals", async () => {
    const res = await rpc("anna", "tools/list");
    const tools = res.result.tools as { name: string; annotations?: Record<string, boolean> }[];
    const mine = tools.filter((t) => ["visa_rutiner", "skapa_rutin", "byt_namn_pa_rutin", "ta_bort_rutin", "lagg_till_uppgift_i_rutin", "byt_namn_pa_uppgift_i_rutin", "ta_bort_uppgift_ur_rutin", "lagg_till_rutin_i_hemmet"].includes(t.name));
    expect(mine).toHaveLength(8);
    expect(mine.filter((t) => t.annotations?.destructiveHint === true).map((t) => t.name).sort()).toEqual(["ta_bort_rutin", "ta_bort_uppgift_ur_rutin"]);
    expect(mine.find((t) => t.name === "visa_rutiner")!.annotations?.readOnlyHint).toBe(true);
  });
});
