import { describe, expect, it } from "vitest";
import { BADGES, BADGE_COINS, earnedKeys, progressLine, wonLine, type BadgeFacts } from "./badges";

const none: BadgeFacts = { ticks: 0, sameTaskBest: 0, run: 0, roomsDone: 0, rooms: 3, quietDays: 0, quietWeek: false, lifetime: 0, bought: false };
const with_ = (f: Partial<BadgeFacts>): BadgeFacts => ({ ...none, ...f });

describe("badges", () => {
  it("are eight, each worth 25 coins, with the agreed words", () => {
    expect(BADGES.map((b) => b.name)).toEqual([
      "Första uppgiften",
      "Tio av samma",
      "7 dagar i rad",
      "Varje rum",
      "En vecka utan sena",
      "100 uppgifter",
      "Nivå 5",
      "Första köpet",
    ]);
    expect(BADGE_COINS).toBe(25);
    expect(BADGES[3]!.description).toBe("Gör en uppgift i varje rum i hemmet.");
  });

  it("are earned at their boundaries", () => {
    expect(earnedKeys(none)).toEqual([]);
    expect(earnedKeys(with_({ ticks: 1 }))).toEqual(["first-task"]);
    expect(earnedKeys(with_({ sameTaskBest: 9 }))).toEqual([]);
    expect(earnedKeys(with_({ sameTaskBest: 10 }))).toEqual(["ten-same"]);
    expect(earnedKeys(with_({ run: 6 }))).toEqual([]);
    expect(earnedKeys(with_({ run: 7 }))).toEqual(["week-streak"]);
    expect(earnedKeys(with_({ roomsDone: 2 }))).toEqual([]);
    expect(earnedKeys(with_({ roomsDone: 3 }))).toEqual(["every-room"]);
    expect(earnedKeys(with_({ roomsDone: 0, rooms: 0 }))).toEqual([]);
    expect(earnedKeys(with_({ quietWeek: true }))).toEqual(["quiet-week"]);
    expect(earnedKeys(with_({ ticks: 99 }))).toEqual(["first-task"]);
    expect(earnedKeys(with_({ ticks: 100 }))).toEqual(["first-task", "hundred"]);
    expect(earnedKeys(with_({ lifetime: 999 }))).toEqual([]);
    expect(earnedKeys(with_({ lifetime: 1000 }))).toEqual(["level-5"]);
    expect(earnedKeys(with_({ bought: true }))).toEqual(["first-buy"]);
  });

  it("show progress where something can be counted", () => {
    expect(progressLine("ten-same", with_({ sameTaskBest: 6 }))).toEqual({ have: 6, need: 10, text: "6 av 10 gånger." });
    expect(progressLine("week-streak", with_({ run: 5 }))).toEqual({ have: 5, need: 7, text: "5 av 7 dagar." });
    expect(progressLine("every-room", with_({ roomsDone: 6, rooms: 10 }))).toEqual({ have: 6, need: 10, text: "6 av 10 rum klara." });
    expect(progressLine("quiet-week", with_({ quietDays: 3 }))).toEqual({ have: 3, need: 7, text: "3 av 7 dagar." });
    expect(progressLine("hundred", with_({ ticks: 42 }))).toEqual({ have: 42, need: 100, text: "42 av 100 uppgifter." });
    expect(progressLine("level-5", with_({ lifetime: 320 }))).toEqual({ have: 320, need: 1000, text: "320 av 1 000 mynt." });
    expect(progressLine("first-task", none)).toBeNull();
    expect(progressLine("first-buy", none)).toBeNull();
  });

  it("never show progress beyond the goal", () => {
    expect(progressLine("hundred", with_({ ticks: 130 }))?.have).toBe(100);
  });

  it("say when they were won, in Stockholm time", () => {
    expect(wonLine(new Date("2026-11-12T10:00:00Z"))).toBe("Vunnet 12 november.");
    expect(wonLine(new Date("2026-11-11T23:30:00Z"))).toBe("Vunnet 12 november.");
  });
});
