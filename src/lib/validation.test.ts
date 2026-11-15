import { describe, expect, it } from "vitest";
import { boardFilter, createChoreInput, routineName, routineTaskTitle } from "./validation";

const ROOM = "6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70";
const parse = (fields: Record<string, string>) => createChoreInput.safeParse(fields);

describe("createChoreInput", () => {
  it("is recurring by default and trims the title", () => {
    const parsed = createChoreInput.parse({ title: "  Dammsuga ", roomId: ROOM, interval: "1", unit: "week" });
    expect(parsed).toEqual({
      title: "Dammsuga",
      templateKey: null,
      roomId: ROOM,
      recurrence: { unit: "week", interval: 1 },
      firstDueDate: null,
      assigneeId: null,
    });
  });

  it("uses the start date for a recurring task and the due date for a one-off", () => {
    const recurring = createChoreInput.parse({
      title: "Diska",
      roomId: ROOM,
      kind: "recurring",
      interval: "2",
      unit: "day",
      startDate: "2026-12-01",
    });
    expect(recurring).toMatchObject({ recurrence: { unit: "day", interval: 2 }, firstDueDate: "2026-12-01" });

    const once = createChoreInput.parse({ title: "Putsa fönster", roomId: ROOM, kind: "once", dueDate: "2026-12-24" });
    expect(once).toMatchObject({ recurrence: null, firstDueDate: "2026-12-24" });
    expect(createChoreInput.parse({ title: "Laga lampan", roomId: ROOM, kind: "once", dueDate: "" })).toMatchObject({
      firstDueDate: null,
    });
  });

  it("ignores how often for a one-off task", () => {
    const once = createChoreInput.parse({ title: "x", roomId: ROOM, kind: "once", interval: "3", unit: "day" });
    expect(once.recurrence).toBeNull();
  });

  it("keeps a known template and refuses an unknown one", () => {
    expect(createChoreInput.parse({ title: "Diska", templateKey: "diska", roomId: ROOM, interval: "1", unit: "day" }))
      .toMatchObject({ templateKey: "diska" });
    expect(parse({ title: "x", templateKey: "nope", roomId: ROOM, interval: "1", unit: "day" }).success).toBe(false);
  });

  it("requires a title, a room and a sensible interval for a recurring task", () => {
    expect(parse({ title: "  ", roomId: ROOM, interval: "1", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: "", interval: "1", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, interval: "0", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, interval: "1.5", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, interval: "366", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, interval: "1", unit: "year" }).success).toBe(false);
  });

  it("rejects dates that do not exist", () => {
    expect(parse({ title: "x", roomId: ROOM, kind: "once", dueDate: "2026-02-30" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, kind: "once", dueDate: "24/12" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, kind: "once", dueDate: "2028-02-29" }).success).toBe(true);
  });
});

describe("boardFilter", () => {
  it("keeps usable filters and drops the rest", () => {
    expect(boardFilter.parse({ roomId: ROOM, who: "mine" })).toEqual({ roomId: ROOM, who: "mine" });
    expect(boardFilter.parse({ roomId: "kitchen", who: "" })).toEqual({ roomId: undefined, who: undefined });
    expect(boardFilter.parse({})).toEqual({});
  });
});

describe("Swedish errors for kind and unit", () => {
  const base = { title: "Diska", roomId: "00000000-0000-4000-8000-000000000000" };
  it("explains a bad kind or unit in Swedish when creating and editing", async () => {
    const { createChoreInput, editChoreInput } = await import("./validation");
    for (const schema of [createChoreInput, editChoreInput]) {
      const kind = schema.safeParse({ ...base, kind: "weekly" });
      expect(kind.error?.issues[0]?.message).toBe("Välj återkommande eller en gång");
      const unit = schema.safeParse({ ...base, kind: "recurring", interval: 1, unit: "weeks" });
      expect(unit.error?.issues[0]?.message).toBe("Välj dag, vecka eller månad");
    }
  });
});

describe("routineName", () => {
  it("trims, and refuses empty and over 40 characters", () => {
    expect(routineName.parse("  Städa badrum ")).toBe("Städa badrum");
    expect(routineName.safeParse("   ").error?.issues[0]?.message).toBe("Skriv rutinens namn");
    expect(routineName.safeParse("x".repeat(40)).success).toBe(true);
    expect(routineName.safeParse("x".repeat(41)).error?.issues[0]?.message).toBe("Max 40 tecken");
  });
});

describe("routineTaskTitle", () => {
  it("trims, and refuses empty and over 200 characters", () => {
    expect(routineTaskTitle.parse(" Diska ")).toBe("Diska");
    expect(routineTaskTitle.safeParse("").error?.issues[0]?.message).toBe("Skriv vad som ska göras");
    expect(routineTaskTitle.safeParse("x".repeat(200)).success).toBe(true);
    expect(routineTaskTitle.safeParse("x".repeat(201)).error?.issues[0]?.message).toBe("Max 200 tecken");
  });
});
