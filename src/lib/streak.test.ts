import { describe, expect, it } from "vitest";
import {
  bonusPercent,
  streakCard,
  streakLabel,
  streakOf,
  streakPillText,
  tickDay,
  withStreakBonus,
} from "./streak";

const today = "2026-11-23";

describe("streakOf", () => {
  it("is 0 and not ticked without any day", () => {
    expect(streakOf([], today)).toEqual({ run: 0, ticked: false });
  });
  it("counts days in a row ending today", () => {
    expect(streakOf(["2026-11-23", "2026-11-22", "2026-11-21"], today)).toEqual({ run: 3, ticked: true });
  });
  it("keeps a streak alive through a day without a tick yet", () => {
    expect(streakOf(["2026-11-22", "2026-11-21"], today)).toEqual({ run: 2, ticked: false });
  });
  it("breaks after a full day without a tick", () => {
    expect(streakOf(["2026-11-21", "2026-11-20"], today)).toEqual({ run: 0, ticked: false });
  });
  it("stops at a gap", () => {
    expect(streakOf(["2026-11-23", "2026-11-21", "2026-11-20"], today)).toEqual({ run: 1, ticked: true });
  });
});

describe("tickDay", () => {
  it("is the next day of the run until today has a tick", () => {
    expect(tickDay({ run: 3, ticked: false })).toBe(4);
    expect(tickDay({ run: 3, ticked: true })).toBe(3);
    expect(tickDay({ run: 0, ticked: false })).toBe(1);
  });
});

describe("the bonus", () => {
  it("is none to day 3, 10 % on days 4 to 6 and 20 % from day 7", () => {
    expect([1, 3, 4, 6, 7, 30].map(bonusPercent)).toEqual([0, 0, 10, 10, 20, 20]);
  });
  it("rounds the extra up and leaves 0 alone", () => {
    expect(withStreakBonus(10, 4)).toBe(11);
    expect(withStreakBonus(10, 7)).toBe(12);
    expect(withStreakBonus(5, 4)).toBe(6);
    expect(withStreakBonus(5, 7)).toBe(6);
    expect(withStreakBonus(100, 7)).toBe(120);
    expect(withStreakBonus(10, 3)).toBe(10);
    expect(withStreakBonus(0, 7)).toBe(0);
  });
});

describe("the words", () => {
  it("writes the pill, capped at 7+", () => {
    expect([0, 5, 6, 7, 12].map(streakPillText)).toEqual(["🔥0", "🔥5", "🔥6", "🔥7+", "🔥7+"]);
  });
  it("names the pill for a screen reader", () => {
    expect(streakLabel(0)).toBe("Ingen svit just nu");
    expect(streakLabel(1)).toBe("1 dag i rad");
    expect(streakLabel(5)).toBe("5 dagar i rad");
    expect(streakLabel(9)).toBe("7 dagar i rad eller fler");
  });
  it("writes the card for each state", () => {
    expect(streakCard(0)).toEqual({ title: "Ingen svit just nu", hint: "Gör en uppgift idag för att starta en." });
    expect(streakCard(1)).toEqual({ title: "1 dag i rad", hint: "Tre dagar till så får du +10 % mynt." });
    expect(streakCard(2)).toEqual({ title: "2 dagar i rad", hint: "Två dagar till så får du +10 % mynt." });
    expect(streakCard(3).hint).toBe("En dag till så får du +10 % mynt.");
    expect(streakCard(4)).toEqual({ title: "4 dagar i rad · +10 % mynt", hint: "Tre dagar till så blir det +20 %." });
    expect(streakCard(5)).toEqual({ title: "5 dagar i rad · +10 % mynt", hint: "Två dagar till så blir det +20 %." });
    expect(streakCard(6).hint).toBe("En dag till så blir det +20 %.");
    expect(streakCard(7)).toEqual({
      title: "7+ dagar i rad · +20 % mynt",
      hint: "Gör en uppgift varje dag för att behålla det.",
    });
    expect(streakCard(40).title).toBe("7+ dagar i rad · +20 % mynt");
  });
});
