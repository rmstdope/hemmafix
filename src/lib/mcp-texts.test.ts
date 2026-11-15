import { describe, expect, it } from "vitest";
import {
  ACCESS_REMOVED_TEXT,
  alreadyRoleText,
  ambiguousMemberText,
  CHILD_TEXT,
  findMemberByName,
  FLOOR_MOVED_TEXT,
  FLOOR_REMOVED_TEXT,
  FLOOR_RENAMED_TEXT,
  floorAddedText,
  formatDone,
  formatFamily,
  formatFloorsAndRooms,
  formatOpenTasks,
  formatTaskLookup,
  homeRenamedText,
  NO_FLOORS_TEXT,
  noSuchMemberText,
  NOTHING_DONE_TEXT,
  NOTHING_OPEN_TEXT,
  roleChangedText,
  ROOM_REMOVED_TEXT,
  ROOM_RENAMED_TEXT,
  roomAddedText,
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

describe("the lookup of ids", () => {
  it("shows ids for open tasks, rooms, family and recent ticks, marking the latest tick", () => {
    const text = formatTaskLookup(
      {
        open: [
          { id: "i1", choreId: "c1", title: "Diska", roomName: "Kök", assigneeName: "Anna", dueDate: "2026-11-15", recurrence: { unit: "week", interval: 2 } },
          { id: "i4", choreId: "c4", title: "Byt lampa", roomName: null, assigneeName: null, dueDate: null, recurrence: null },
        ],
        rooms: [{ id: "r1", name: "Kök", floorName: "Plan 1" }],
        members: [{ id: "anna", name: "Anna", role: "adult" }],
        recentlyDone: [
          { id: "i2", title: "Dammsuga", doneByName: "Bo", isLatestTick: true },
          { id: "i3", title: "Tvätta", doneByName: null, isLatestTick: false },
        ],
      },
      "2026-11-15",
    );
    expect(text).toBe(
      [
        "Öppna sysslor:",
        "- Diska – Kök, Anna, Idag (syssla c1, tillfälle i1, kind recurring, interval 2, unit week, dueDate 2026-11-15)",
        "- Byt lampa – ingen tilldelad, inget datum (syssla c4, tillfälle i4, kind once)",
        "Rum:",
        "- Kök, Plan 1 (id r1)",
        "Familj:",
        "- Anna, vuxen (id anna)",
        "Nyligen avbockade:",
        "- Dammsuga, av Bo (tillfälle i2, kan ångras)",
        "- Tvätta (tillfälle i3)",
      ].join("\n"),
    );
  });

  it("says so for sections with nothing in them", () => {
    const text = formatTaskLookup({ open: [], rooms: [], members: [], recentlyDone: [] }, "2026-11-15");
    expect(text).toBe(
      ["Öppna sysslor:", "(inga)", "Rum:", "(inga)", "Familj:", "(inga)", "Nyligen avbockade:", "(inga)"].join("\n"),
    );
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

describe("floors and rooms", () => {
  it("lists floors as the app shows them, with their rooms and ids", () => {
    expect(
      formatFloorsAndRooms([
        { id: "f2", name: "2", rooms: [{ id: "r1", name: "Badrum" }] },
        { id: "f1", name: "Suterräng", rooms: [] },
      ]),
    ).toBe("Plan 2 [f2]\n- Badrum [r1]\n\nSuterräng [f1]\n(inga rum)");
  });

  it("says so when the home has no floors", () => {
    expect(formatFloorsAndRooms([])).toBe(NO_FLOORS_TEXT);
    expect(NO_FLOORS_TEXT).toBe("Inga våningar eller rum ännu.");
  });
});

describe("the family", () => {
  it("lists members with the app's role labels and ids", () => {
    expect(
      formatFamily([
        { id: "a", name: "Anna Andersson", role: "adult" },
        { id: "b", name: "Bo", role: "child" },
      ]),
    ).toBe("- Anna Andersson – Vuxen [a]\n- Bo – Barn [b]");
  });
});

describe("open tasks with several floors", () => {
  it("puts the floor after the room, as the app does", () => {
    expect(
      formatOpenTasks(
        [{ title: "Torka", roomName: "Badrum", floorName: "2", assigneeName: "Anna", dueDate: null }],
        "2026-11-15",
        true,
      ),
    ).toBe("- Torka – Badrum · Plan 2, Anna, inget datum");
  });
});

describe("what someone has done", () => {
  const at = (iso: string) => new Date(iso);
  it("groups by day, newest first, with the time in Swedish time", () => {
    expect(
      formatDone(
        [
          { title: "Diska", roomName: "Kök", floorName: "1", completedAt: at("2026-11-15T08:45:00Z") },
          { title: "Dammsug", roomName: null, floorName: null, completedAt: at("2026-11-14T10:00:00Z") },
        ],
        { today: "2026-11-15", who: "Anna", period: "senaste månaden", truncated: false, showFloors: false },
      ),
    ).toBe("Anna har gjort, senaste månaden:\n\nIdag\n- 09:45 Diska – Kök\n\nIgår\n- 11:00 Dammsug");
  });

  it("says when nothing was done", () => {
    expect(
      formatDone([], { today: "2026-11-15", who: "Anna", period: "senaste veckan", truncated: false, showFloors: false }),
    ).toBe(NOTHING_DONE_TEXT);
    expect(NOTHING_DONE_TEXT).toBe("Inget gjort under perioden.");
  });

  it("says when the list was cut", () => {
    const text = formatDone(
      Array.from({ length: 500 }, () => ({
        title: "Diska",
        roomName: "Kök",
        floorName: "1",
        completedAt: at("2026-11-15T08:45:00Z"),
      })),
      { today: "2026-11-15", who: "Anna", period: "senaste året", truncated: true, showFloors: false },
    );
    expect(text.endsWith("Visar de 500 senaste.")).toBe(true);
  });
});

describe("what Claude is told about the home", () => {
  it("confirms each change in Swedish", () => {
    expect(homeRenamedText("Villa Solgläntan")).toBe("Hemmet heter nu Villa Solgläntan.");
    expect(roomAddedText("Kök", "2")).toBe("Rummet Kök lades till på Plan 2.");
    expect(roomAddedText("Kök", "Suterräng")).toBe("Rummet Kök lades till på Suterräng.");
    expect(ROOM_RENAMED_TEXT).toBe("Rummet har bytt namn.");
    expect(ROOM_REMOVED_TEXT).toBe("Rummet togs bort.");
    expect(floorAddedText("3")).toBe("Plan 3 lades till.");
    expect(FLOOR_RENAMED_TEXT).toBe("Våningen har bytt namn.");
    expect(FLOOR_MOVED_TEXT).toBe("Våningen flyttades.");
    expect(FLOOR_REMOVED_TEXT).toBe("Våningen togs bort.");
  });
});
