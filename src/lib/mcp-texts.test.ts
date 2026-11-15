import { describe, expect, it } from "vitest";
import {
  ACCESS_REMOVED_TEXT,
  alreadyRoleText,
  ambiguousMemberText,
  CHILD_TEXT,
  findMemberByName,
  formatOpenTasks,
  noSuchMemberText,
  NOTHING_OPEN_TEXT,
  roleChangedText,
} from "./mcp-texts";

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

describe("changing a role", () => {
  it("has the texts for each outcome", () => {
    expect(roleChangedText("Bo", "adult")).toBe("Bo är nu vuxen.");
    expect(roleChangedText("Bo", "child")).toBe("Bo är nu barn.");
    expect(alreadyRoleText("Bo", "adult")).toBe("Bo är redan vuxen.");
    expect(alreadyRoleText("Bo", "child")).toBe("Bo är redan barn.");
    expect(noSuchMemberText("Cecilia")).toBe("Ingen i hemmet heter Cecilia.");
    expect(ambiguousMemberText("Bo")).toBe("Flera i hemmet heter Bo. Ändra rollen i appen under Hemmet.");
  });

  it("finds a member by name regardless of case and spaces", () => {
    const members = [
      { id: "a", name: "Anna" },
      { id: "b", name: "Bo" },
    ];
    expect(findMemberByName(members, "  bo ")).toEqual({ member: members[1] });
    expect(findMemberByName(members, "Cecilia")).toEqual({ none: true });
  });

  it("finds a member by first name, preferring an exact full name", () => {
    const members = [
      { id: "a", name: "Anna Andersson" },
      { id: "b", name: "Bo Berg" },
      { id: "c", name: "Bo" },
    ];
    expect(findMemberByName(members, "anna")).toEqual({ member: members[0] });
    expect(findMemberByName(members, "Bo Berg")).toEqual({ member: members[1] });
    expect(findMemberByName(members, "Bo")).toEqual({ member: members[2] });
    expect(findMemberByName([members[1]!, { id: "d", name: "Bo Dahl" }], "Bo")).toEqual({ ambiguous: true });
  });

  it("refuses a name two members share", () => {
    const members = [
      { id: "a", name: "Bo" },
      { id: "b", name: "bo" },
    ];
    expect(findMemberByName(members, "Bo")).toEqual({ ambiguous: true });
  });
});
