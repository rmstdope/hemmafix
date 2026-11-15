import { describe, expect, it } from "vitest";
import { ACCESS_REMOVED_TEXT, CHILD_TEXT, formatOpenTasks, NOTHING_OPEN_TEXT } from "./mcp-texts";

describe("what Claude is told", () => {
  it("has the agreed fixed texts", () => {
    expect(NOTHING_OPEN_TEXT).toBe("Inget är kvar att göra just nu.");
    expect(ACCESS_REMOVED_TEXT).toBe(
      "Ditt konto har inte längre tillgång till Hemmafix. Be den som administrerar appen att lägga till din adress igen.",
    );
    expect(CHILD_TEXT).toBe("Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.");
  });

  it("says nothing is left when no task is open", () => {
    expect(formatOpenTasks([], "2026-11-15")).toBe(NOTHING_OPEN_TEXT);
  });

  it("lists one line per open task with room, assignee and due date", () => {
    const text = formatOpenTasks(
      [
        { title: "Dammsug", roomName: "Vardagsrum", assigneeName: "Anna", dueDate: "2026-11-15" },
        { title: "Byt glödlampa", roomName: null, assigneeName: null, dueDate: null },
      ],
      "2026-11-15",
    );
    expect(text).toBe("- Dammsug – Vardagsrum, Anna, Idag\n- Byt glödlampa – ingen tilldelad, inget datum");
  });
});
