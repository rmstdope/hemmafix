import { addDays } from "./dates";

/** The count stops here: a streak of 7 or more shows as "7+" and gives the same bonus. */
export const STREAK_CAP = 7;

/**
 * Days in a row with a tick-off. `run` ends today when `ticked`, else yesterday (a streak lives
 * through a day without a tick yet, and breaks after a full one); 0 once broken.
 */
export type Streak = { run: number; ticked: boolean };

/** `days` are the distinct Europe/Stockholm days (YYYY-MM-DD) with a tick, newest first. */
export function streakOf(days: string[], today: string): Streak {
  const ticked = days[0] === today;
  let expected = ticked ? today : addDays(today, -1);
  let run = 0;
  for (const day of days) {
    if (day !== expected) break;
    run++;
    expected = addDays(expected, -1);
  }
  return { run, ticked };
}

/** The day of the streak a tick made now falls on. */
export const tickDay = (s: Streak) => (s.ticked ? s.run : s.run + 1);

/** The extra a tick on this streak day gives: from day 4 +10 %, from day 7 +20 %. */
export function bonusPercent(day: number): 0 | 10 | 20 {
  return day >= 7 ? 20 : day >= 4 ? 10 : 0;
}

/** A task's own coins with the streak's extra, rounded up (integers, so 10 × 1.1 is 11). */
export const withStreakBonus = (coins: number, day: number) => Math.ceil((coins * (100 + bonusPercent(day))) / 100);

/** What the flame pill reads. */
export const streakPillText = (run: number) => `🔥${run >= STREAK_CAP ? `${STREAK_CAP}+` : run}`;

/** The pill's screen-reader name. */
export function streakLabel(run: number): string {
  if (run <= 0) return "Ingen svit just nu";
  if (run >= STREAK_CAP) return `${STREAK_CAP} dagar i rad eller fler`;
  return run === 1 ? "1 dag i rad" : `${run} dagar i rad`;
}

const COUNT = ["En dag", "Två dagar", "Tre dagar"];

/** The streak card on Framsteg: a title and a line under it. */
export function streakCard(run: number): { title: string; hint: string } {
  if (run <= 0) return { title: "Ingen svit just nu", hint: "Gör en uppgift idag för att starta en." };
  if (run >= STREAK_CAP) {
    return { title: `${STREAK_CAP}+ dagar i rad · +20 % mynt`, hint: "Gör en uppgift varje dag för att behålla det." };
  }
  const title = run === 1 ? "1 dag i rad" : `${run} dagar i rad`;
  if (run < 4) return { title, hint: `${COUNT[3 - run]} till så får du +10 % mynt.` };
  return { title: `${title} · +10 % mynt`, hint: `${COUNT[STREAK_CAP - run - 1]} till så blir det +20 %.` };
}
