import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db, pg } from "@/db";
import { chore, floor, household, membership, room, user } from "@/db/schema";

process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
process.env.BETTER_AUTH_SECRET = "integration-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { handleMcpRequest } = await import("./mcp");
const { listFloors, listRooms } = await import("./household");

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
  await db.insert(user).values([
    { id: "anna", name: "Anna", email: "anna@example.com", emailVerified: true },
    { id: "bo", name: "Bo", email: "bo@example.com", emailVerified: true },
  ]);
  await db.insert(membership).values([
    { userId: "anna", householdId: homeId, role: "adult" },
    { userId: "bo", householdId: homeId, role: "child" },
  ]);
  await db.insert(floor).values({ householdId: homeId, name: "1", position: 1 });
});
const settle = () => new Promise((r) => setTimeout(r, 200));

describe("renaming the home", () => {
  it("renames it and tells the open devices", async () => {
    const res = await call("anna", "byt_namn_pa_hemmet", { namn: "Villa Solgläntan" });
    expect(res.isError).toBeFalsy();
    expect(textOf(res)).toBe("Hemmet heter nu Villa Solgläntan.");
    const [h] = await db.select().from(household);
    expect(h!.name).toBe("Villa Solgläntan");
    await settle();
    expect(notified).toEqual([homeId]);
  });

  it("refuses a child and an address removed from the allowlist, changing nothing", async () => {
    const child = await call("bo", "byt_namn_pa_hemmet", { namn: "X" });
    expect(child.isError).toBe(true);
    expect(textOf(child)).toContain("Bara vuxna");
    process.env.ALLOWED_EMAILS = "bo@example.com";
    const removed = await call("anna", "byt_namn_pa_hemmet", { namn: "X" });
    process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
    expect(removed.isError).toBe(true);
    expect(textOf(removed)).toContain("inte längre tillgång");
    const [h] = await db.select().from(household);
    expect(h!.name).toBe("Hemma");
    await settle();
    expect(notified).toEqual([]);
  });

  it("answers an empty name with the app's Swedish message and tells nobody", async () => {
    const res = await call("anna", "byt_namn_pa_hemmet", { namn: "  " });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe("Hemmet behöver ett namn");
    await settle();
    expect(notified).toEqual([]);
  });
});

describe("floors", () => {
  it("are added, renamed, moved, listed and removed like in the app", async () => {
    expect(textOf(await call("anna", "lagg_till_vaning"))).toBe("Plan 2 lades till.");
    expect(textOf(await call("anna", "lagg_till_vaning", { namn: "Suterräng" }))).toBe("Suterräng lades till.");
    let floors = await listFloors(homeId);
    expect(floors.map((f) => f.name)).toEqual(["Suterräng", "2", "1"]);
    const sub = floors[0]!;

    expect(textOf(await call("anna", "byt_namn_pa_vaning", { vaning_id: sub.id, namn: "Källare" }))).toBe("Våningen har bytt namn.");
    expect(textOf(await call("anna", "flytta_vaning", { vaning_id: sub.id, riktning: "down" }))).toBe("Våningen flyttades.");
    floors = await listFloors(homeId);
    expect(floors.map((f) => f.name)).toEqual(["2", "Källare", "1"]);

    const listing = textOf(await call("anna", "lista_vaningar_och_rum"));
    expect(listing).toBe(`Plan 2 [${floors[0]!.id}]\n(inga rum)\n\nKällare [${floors[1]!.id}]\n(inga rum)\n\nPlan 1 [${floors[2]!.id}]\n(inga rum)`);

    expect(textOf(await call("anna", "ta_bort_vaning", { vaning_id: floors[1]!.id }))).toBe("Våningen togs bort.");
    expect((await listFloors(homeId)).map((f) => f.name)).toEqual(["2", "1"]);
  });

  it("refuse duplicates, the last floor and a floor with rooms, with the app's errors", async () => {
    const [only] = await listFloors(homeId);
    const last = await call("anna", "ta_bort_vaning", { vaning_id: only!.id });
    expect(last.isError).toBe(true);
    expect(textOf(last)).toBe("Hemmet måste ha minst en våning");

    await call("anna", "lagg_till_vaning");
    const dup = await call("anna", "lagg_till_vaning", { namn: "Plan 2" });
    expect(textOf(dup)).toBe("Det finns redan en våning med det namnet");

    await call("anna", "lagg_till_rum", { namn: "Kök", vaning_id: only!.id });
    const full = await call("anna", "ta_bort_vaning", { vaning_id: only!.id });
    expect(textOf(full)).toBe("Våningen har rum. Ta bort dem först.");
    expect(await listFloors(homeId)).toHaveLength(2);
  });

  it("tell the open devices after each change", async () => {
    await call("anna", "lagg_till_vaning");
    await settle();
    expect(notified).toEqual([homeId]);
  });
});

describe("rooms", () => {
  it("are added with or without a floor, renamed and removed", async () => {
    const [f1] = await listFloors(homeId);
    expect(textOf(await call("anna", "lagg_till_rum", { namn: "Kök" }))).toBe("Rummet Kök lades till på Plan 1.");
    const [kok] = await listRooms(homeId);
    expect(textOf(await call("anna", "byt_namn_pa_rum", { rum_id: kok!.id, namn: "Köket" }))).toBe("Rummet har bytt namn.");
    expect((await listRooms(homeId)).map((r) => r.name)).toEqual(["Köket"]);
    const listing = textOf(await call("anna", "lista_vaningar_och_rum"));
    expect(listing).toBe(`Plan 1 [${f1!.id}]\n- Köket [${kok!.id}]`);
    expect(textOf(await call("anna", "ta_bort_rum", { rum_id: kok!.id }))).toBe("Rummet togs bort.");
    expect(await listRooms(homeId)).toEqual([]);
  });

  it("need a floor once there are several, and stay unique on a floor", async () => {
    const [f1] = await listFloors(homeId);
    await call("anna", "lagg_till_vaning");
    const noFloor = await call("anna", "lagg_till_rum", { namn: "Kök" });
    expect(noFloor.isError).toBe(true);
    expect(textOf(noFloor)).toBe("Välj en våning");
    await call("anna", "lagg_till_rum", { namn: "Kök", vaning_id: f1!.id });
    const dup = await call("anna", "lagg_till_rum", { namn: "kök", vaning_id: f1!.id });
    expect(textOf(dup)).toBe("Det rummet finns redan på våningen");
  });

  it("cannot be removed while they have tasks", async () => {
    const [f1] = await listFloors(homeId);
    await call("anna", "lagg_till_rum", { namn: "Kök" });
    const [kok] = await listRooms(homeId);
    await db.insert(chore).values({ householdId: homeId, roomId: kok!.id, title: "Diska" });
    const res = await call("anna", "ta_bort_rum", { rum_id: kok!.id });
    expect(res.isError).toBe(true);
    expect(textOf(res)).toBe("Rummet har uppgifter. Ta bort dem först.");
    expect((await listRooms(homeId)).map((r) => r.name)).toEqual(["Kök"]);
    expect(f1).toBeDefined();
  });

  it("refuse a child and another home's ids", async () => {
    const [other] = (await db.insert(household).values({ name: "Annat" }).returning({ id: household.id })) as [{ id: string }];
    const [of] = await db.insert(floor).values({ householdId: other.id, name: "1", position: 1 }).returning({ id: floor.id });
    const [or] = await db.insert(room).values({ householdId: other.id, floorId: of!.id, name: "Kök" }).returning({ id: room.id });
    expect((await call("bo", "lagg_till_rum", { namn: "Kök" })).isError).toBe(true);
    const foreign = await call("anna", "byt_namn_pa_rum", { rum_id: or!.id, namn: "X" });
    expect(foreign.isError).toBe(true);
    expect(textOf(foreign)).toBe("Rummet finns inte i hemmet");
    expect((await listRooms(other.id)).map((r) => r.name)).toEqual(["Kök"]);
  });
});

describe("mistakes Claude can make", () => {
  it("get Swedish answers for ids and directions that do not exist", async () => {
    const [f1] = await listFloors(homeId);
    for (const [tool, args, expected] of [
      ["ta_bort_vaning", { vaning_id: "f2" }, "Våningen finns inte i hemmet"],
      ["byt_namn_pa_vaning", { vaning_id: "Plan 1", namn: "X" }, "Våningen finns inte i hemmet"],
      ["byt_namn_pa_rum", { rum_id: "Kök", namn: "X" }, "Rummet finns inte i hemmet"],
      ["ta_bort_rum", { rum_id: "Kök" }, "Rummet finns inte i hemmet"],
      ["lagg_till_rum", { namn: "Kök", vaning_id: "Plan 1" }, "Våningen finns inte i hemmet"],
      ["flytta_vaning", { vaning_id: f1!.id, riktning: "upp" }, "Riktning ska vara up eller down"],
    ] as const) {
      const res = await call("anna", tool, args);
      expect(res.isError, tool).toBe(true);
      expect(textOf(res), tool).toBe(expected);
    }
    await settle();
    expect(notified).toEqual([]);
  });

  it("are told when a floor cannot move further, and nobody is notified", async () => {
    await call("anna", "lagg_till_vaning");
    const [top, bottom] = await listFloors(homeId);
    notified.length = 0;
    expect(textOf(await call("anna", "flytta_vaning", { vaning_id: top!.id, riktning: "up" }))).toBe("Våningen är redan överst.");
    expect(textOf(await call("anna", "flytta_vaning", { vaning_id: bottom!.id, riktning: "down" }))).toBe("Våningen är redan nederst.");
    expect((await listFloors(homeId)).map((f) => f.id)).toEqual([top!.id, bottom!.id]);
    await settle();
    expect(notified).toEqual([]);
  });
});

describe("live updates", () => {
  it("follow every write tool, and only successful ones", async () => {
    await call("anna", "lagg_till_vaning");
    const [top, bottom] = await listFloors(homeId);
    await call("anna", "lagg_till_rum", { namn: "Kök", vaning_id: bottom!.id });
    const [kok] = await listRooms(homeId);
    await settle();
    notified.length = 0;
    const writes: [string, Record<string, unknown>][] = [
      ["byt_namn_pa_hemmet", { namn: "Nytt" }],
      ["lagg_till_vaning", {}],
      ["byt_namn_pa_vaning", { vaning_id: top!.id, namn: "Övre" }],
      ["flytta_vaning", { vaning_id: top!.id, riktning: "down" }],
      ["lagg_till_rum", { namn: "Hall", vaning_id: top!.id }],
      ["byt_namn_pa_rum", { rum_id: kok!.id, namn: "Köket" }],
      ["ta_bort_rum", { rum_id: kok!.id }],
      ["ta_bort_vaning", { vaning_id: bottom!.id }],
    ];
    for (const [tool, args] of writes) {
      notified.length = 0;
      const res = await call("anna", tool, args);
      expect(res.isError, `${tool}: ${textOf(res)}`).toBeFalsy();
      await settle();
      expect(notified, tool).toEqual([homeId]);
    }
    notified.length = 0;
    await call("anna", "lista_vaningar_och_rum");
    await settle();
    expect(notified).toEqual([]);
  });
});

describe("tool annotations", () => {
  it("mark exactly the removals (and the role change) as destructive, so the client asks first", async () => {
    const res = await rpc("anna", "tools/list");
    const tools = res.result.tools as { name: string; annotations?: Record<string, boolean> }[];
    expect(tools.map((t) => t.name).sort()).toEqual(
      [
        "andra_roll",
        "byt_namn_pa_hemmet",
        "byt_namn_pa_rum",
        "byt_namn_pa_vaning",
        "flytta_vaning",
        "lagg_till_rum",
        "lagg_till_vaning",
        "lista_familjen",
        "lista_oppna_sysslor",
        "lista_vaningar_och_rum",
        "visa_gjort",
        "ta_bort_rum",
        "ta_bort_vaning",
      ].sort(),
    );
    const destructive = tools.filter((t) => t.annotations?.destructiveHint === true).map((t) => t.name).sort();
    expect(destructive).toEqual(["andra_roll", "ta_bort_rum", "ta_bort_vaning"]);
    expect(tools.find((t) => t.name === "lagg_till_rum")!.annotations?.destructiveHint).toBe(false);
  });
});
