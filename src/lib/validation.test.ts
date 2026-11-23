import { describe, expect, it } from "vitest";
import { addRoutineInput, boardFilter, createChoreInput, editChoreInput, coinsInput, listItemText, listName, listOrder, restoredItems, routineName, routineTaskTitle } from "./validation";

const ROOM = "6f1c3b0e-5f8a-4c7e-9d2a-1b3c4d5e6f70";
const parse = (fields: Record<string, string>) => createChoreInput.safeParse(fields);

describe("createChoreInput", () => {
  it("is a one-off by default", () => {
    expect(createChoreInput.parse({ title: "Laga cykeln", roomId: ROOM })).toMatchObject({
      recurrence: null,
      firstDueDate: null,
    });
  });

  it("trims the title and keeps a recurring task's interval", () => {
    const parsed = createChoreInput.parse({ title: "  Dammsuga ", roomId: ROOM, kind: "recurring", interval: "1", unit: "week" });
    expect(parsed).toEqual({
      title: "Dammsuga",
      templateKey: null,
      roomId: ROOM,
      recurrence: { unit: "week", interval: 1 },
      firstDueDate: null,
      coins: 10,
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
    expect(createChoreInput.parse({ title: "Diska", templateKey: "diska", roomId: ROOM, kind: "recurring", interval: "1", unit: "day" }))
      .toMatchObject({ templateKey: "diska" });
    expect(parse({ title: "x", templateKey: "nope", roomId: ROOM, interval: "1", unit: "day" }).success).toBe(false);
  });

  it("requires a title, a room and a sensible interval for a recurring task", () => {
    expect(parse({ title: "  ", roomId: ROOM, kind: "recurring", interval: "1", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: "", kind: "recurring", interval: "1", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, kind: "recurring", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, kind: "recurring", interval: "0", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, kind: "recurring", interval: "1.5", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, kind: "recurring", interval: "366", unit: "day" }).success).toBe(false);
    expect(parse({ title: "x", roomId: ROOM, kind: "recurring", interval: "1", unit: "year" }).success).toBe(false);
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

describe("addRoutineInput", () => {
  const ROUTINE = "7a2d4c1e-1f8a-4c7e-9d2a-1b3c4d5e6f71";

  it("takes a recurring cadence with its start date and person", () => {
    expect(
      addRoutineInput.parse({
        routineId: ROUTINE,
        roomId: ROOM,
        kind: "recurring",
        interval: "2",
        unit: "week",
        startDate: "2026-12-01",
        assigneeId: "u1",
        title: "ignored",
      }),
    ).toEqual({
      routineId: ROUTINE,
      roomId: ROOM,
      recurrence: { unit: "week", interval: 2 },
      firstDueDate: "2026-12-01",
      assigneeId: "u1",
    });
  });

  it("takes a one-off with a due date, or none, and no person as null", () => {
    const once = { routineId: ROUTINE, roomId: ROOM, kind: "once", assigneeId: "" };
    expect(addRoutineInput.parse({ ...once, dueDate: "2026-12-24" })).toMatchObject({
      recurrence: null,
      firstDueDate: "2026-12-24",
      assigneeId: null,
    });
    expect(addRoutineInput.parse({ ...once, dueDate: "" }).firstDueDate).toBeNull();
  });

  it("explains a missing routine, room or cadence in Swedish", () => {
    const msg = (fields: Record<string, string>) => addRoutineInput.safeParse(fields).error?.issues[0]?.message;
    expect(msg({ routineId: "", roomId: ROOM, kind: "once" })).toBe("Rutinen finns inte längre");
    expect(msg({ routineId: ROUTINE, roomId: "", kind: "once" })).toBe("Välj ett rum");
    expect(msg({ routineId: ROUTINE, roomId: ROOM, kind: "recurring" })).toBe("Ange hur ofta");
  });
});

describe("lists", () => {
  it("trims names and items and takes at most 200 characters", () => {
    expect(listName.parse("  Inköp ")).toBe("Inköp");
    expect(listItemText.parse(" Mjölk ")).toBe("Mjölk");
    expect(listName.safeParse("   ").success).toBe(false);
    expect(listItemText.safeParse("").success).toBe(false);
    expect(listName.safeParse("x".repeat(200)).success).toBe(true);
    expect(listItemText.safeParse("x".repeat(201)).error?.issues[0]?.message).toBe("Max 200 tecken");
  });
  it("knows the three orders", () => {
    expect(listOrder.safeParse("andrad").success).toBe(true);
    expect(listOrder.safeParse("slump").success).toBe(false);
  });
  it("restores at most 1000 items, each with an id, text and rank", () => {
    const one = { id: ROOM, text: "Ost", rank: 3, doneAt: null };
    expect(restoredItems.safeParse([one]).success).toBe(true);
    expect(restoredItems.safeParse([{ ...one, id: "x" }]).success).toBe(false);
    expect(restoredItems.safeParse([{ ...one, rank: 3_000_000_000 }]).success).toBe(false);
    expect(restoredItems.safeParse(Array.from({ length: 1001 }, () => one)).success).toBe(false);
  });
});

describe("coins on a task", () => {
  it("starts a new task at 10 when none is given", () => {
    expect(createChoreInput.parse({ title: "x", roomId: ROOM })).toMatchObject({ coins: 10 });
    expect(createChoreInput.parse({ title: "x", roomId: ROOM, coins: "" })).toMatchObject({ coins: 10 });
  });

  it("takes a whole amount from 0 to 100, as text from the form or a number from Claude", () => {
    expect(createChoreInput.parse({ title: "x", roomId: ROOM, coins: "0" })).toMatchObject({ coins: 0 });
    expect(createChoreInput.parse({ title: "x", roomId: ROOM, coins: "100" })).toMatchObject({ coins: 100 });
    expect(createChoreInput.parse({ title: "x", roomId: ROOM, coins: 35 })).toMatchObject({ coins: 35 });
  });

  it.each(["101", "-1", "1.5", "abc"])("refuses %s in Swedish", (coins) => {
    const r = createChoreInput.safeParse({ title: "x", roomId: ROOM, coins });
    expect(r.success ? "" : r.error.issues[0]?.message).toBe("Mynt måste vara ett heltal mellan 0 och 100");
  });

  it("leaves a task's amount unchanged on edit when none is given", () => {
    const edit = (coins?: string | number) => editChoreInput.parse({ title: "x", roomId: ROOM, kind: "once", coins });
    expect(edit()).toMatchObject({ coins: undefined });
    expect(edit("")).toMatchObject({ coins: undefined });
    expect(edit("40")).toMatchObject({ coins: 40 });
  });

  it("checks a routine task's amount the same way", () => {
    expect(coinsInput.parse(60)).toBe(60);
    expect(coinsInput.safeParse(101).success).toBe(false);
  });
});
