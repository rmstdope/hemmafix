import { addDays } from "./dates";

/** What a person did in one week, Monday to Sunday. */
export type WeekCounts = { tasks: number; coins: number; badges: number };

/** The Monday on or before a YYYY-MM-DD date. */
export function weekStart(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const day = new Date(Date.UTC(y!, m! - 1, d!)).getUTCDay(); // 0 = Sunday
  return addDays(iso, -((day + 6) % 7));
}

/** The comparison line under the week table; it cheers and never scolds. */
export function comparisonLine(now: WeekCounts, before: WeekCounts, beforeWord: "förra veckan" | "veckan före"): string {
  const more = now.tasks - before.tasks;
  if (more > 0) return `${more} fler ${more === 1 ? "uppgift" : "uppgifter"} än ${beforeWord}!`;
  if (more === 0 && now.tasks > 0) return `Lika många uppgifter som ${beforeWord}.`;
  return "Ny vecka – nu kör vi!";
}

const dayMonth = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", timeZone: "UTC" });
const dayOnly = new Intl.DateTimeFormat("sv-SE", { day: "numeric", timeZone: "UTC" });
const at = (iso: string) => new Date(`${iso}T00:00:00Z`);

/** "16–22 november", or "26 oktober – 1 november" across a month, for the week starting on `start`. */
export function formatWeekRange(start: string): string {
  const end = addDays(start, 6);
  return start.slice(0, 7) === end.slice(0, 7)
    ? `${dayOnly.format(at(start))}–${dayMonth.format(at(end))}`
    : `${dayMonth.format(at(start))} – ${dayMonth.format(at(end))}`;
}
