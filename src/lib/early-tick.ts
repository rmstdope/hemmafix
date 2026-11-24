import { addDays } from "./dates";
import type { Recurrence } from "./recurrence";

/** A repeating chore whose day is still ahead: it pays no coins yet, and a child may not tick it. */
export function isNotYetDue(i: { dueDate: string | null; recurrence: Recurrence | null }, today: string): boolean {
  return i.recurrence !== null && i.dueDate !== null && i.dueDate > today;
}

const weekday = new Intl.DateTimeFormat("sv-SE", { weekday: "short", timeZone: "UTC" });
const month = new Intl.DateTimeFormat("sv-SE", { month: "short", timeZone: "UTC" });

/** The day it opens: "imorgon", else "ons 26 nov" (Intl's short torsdag is "tors", so three letters). */
export function earlyDay(dueDate: string, today: string): string {
  if (dueDate === addDays(today, 1)) return "imorgon";
  const [y, m, d] = dueDate.split("-").map(Number);
  const date = new Date(Date.UTC(y!, m! - 1, d!));
  return `${weekday.format(date).replace(".", "").slice(0, 3)} ${d} ${month.format(date).replace(".", "")}`;
}

export const lockedDetail = (dueDate: string, today: string) => `Kan bockas av ${earlyDay(dueDate, today)}`;
export const lockedMessage = (title: string, dueDate: string, today: string) =>
  `${title} kan bockas av ${earlyDay(dueDate, today)}.`;
export const lockedLabel = (title: string, dueDate: string, today: string) =>
  `${title}: kan bockas av ${earlyDay(dueDate, today)}`;
export const earlyDetail = (dueDate: string, today: string) => `Inga mynt förrän ${earlyDay(dueDate, today)}`;
export const earlyDoneMessage = (title: string, dueDate: string, today: string) =>
  `${title} är klar. Inga mynt, eftersom den inte är dags förrän ${earlyDay(dueDate, today)}.`;
