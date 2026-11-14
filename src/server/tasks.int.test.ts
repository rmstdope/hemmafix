import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { household, membership, task } from "@/db/schema";
import { createUser } from "../../test/integration/factories";
import { listMembers, listOpenTasks, listRecentlyCompleted } from "./tasks";

let homeId: string;
let otherHomeId: string;
let annaId: string;
let boId: string;

beforeAll(async () => {
  const [anna, bo, eve] = [await createUser("Anna"), await createUser("Bo"), await createUser("Eve")];
  annaId = anna.id;
  boId = bo.id;
  const [home, other] = await db.insert(household).values([{ name: "Hemma" }, { name: "Grannar" }]).returning();
  homeId = home!.id;
  otherHomeId = other!.id;
  await db.insert(membership).values([
    { userId: anna.id, householdId: homeId, role: "adult" },
    { userId: bo.id, householdId: homeId },
    { userId: eve.id, householdId: otherHomeId },
  ]);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000);
  // Distinct creation times: undated tasks are ordered by when they were added.
  const created = (minute: number) => new Date(Date.UTC(2026, 0, 1, 12, minute));
  await db.insert(task).values([
    { householdId: homeId, title: "Annas", assigneeId: annaId, dueDate: "2026-01-02", createdAt: created(1) },
    { householdId: homeId, title: "Ingens", dueDate: "2026-01-01", createdAt: created(2) },
    { householdId: homeId, title: "Bos", assigneeId: boId, createdAt: created(4) },
    { householdId: homeId, title: "Utan datum", createdAt: created(3) },
    { householdId: homeId, title: "Nyss klar", completedAt: daysAgo(1), completedById: boId },
    { householdId: homeId, title: "Länge sen", completedAt: daysAgo(30), completedById: boId },
    { householdId: otherHomeId, title: "Grannens" },
  ]);
});

const titles = (rows: { title: string }[]) => rows.map((r) => r.title);

describe("listOpenTasks", () => {
  it("lists the household's open tasks, earliest due date first and undated last", async () => {
    expect(titles(await listOpenTasks(homeId, "all", annaId))).toEqual(["Ingens", "Annas", "Utan datum", "Bos"]);
  });

  it("filters on the current user and on unassigned", async () => {
    expect(titles(await listOpenTasks(homeId, "mine", annaId))).toEqual(["Annas"]);
    expect(titles(await listOpenTasks(homeId, "mine", boId))).toEqual(["Bos"]);
    expect(titles(await listOpenTasks(homeId, "unassigned", annaId))).toEqual(["Ingens", "Utan datum"]);
  });

  it("never shows another household's tasks", async () => {
    expect(titles(await listOpenTasks(otherHomeId, "all", annaId))).toEqual(["Grannens"]);
  });
});

describe("listRecentlyCompleted", () => {
  it("shows only tasks completed in the last week", async () => {
    expect(titles(await listRecentlyCompleted(homeId))).toEqual(["Nyss klar"]);
  });
});

describe("listMembers", () => {
  it("lists the household's members by name", async () => {
    expect((await listMembers(homeId)).map((m) => m.name)).toEqual(["Anna", "Bo"]);
  });
});
