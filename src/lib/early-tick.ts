import { addDays, formatShortDay } from "./dates";
import type { Recurrence } from "./recurrence";

/** A repeating chore whose day is still ahead: it pays no coins yet, and a child may not tick it. */
export function isNotYetDue(i: { dueDate: string | null; recurrence: Recurrence | null }, today: string): boolean {
  return i.recurrence !== null && i.dueDate !== null && i.dueDate > today;
}

/** The day it opens: "imorgon", else "ons 25 nov". */
export function earlyDay(dueDate: string, today: string): string {
  return dueDate === addDays(today, 1) ? "imorgon" : formatShortDay(dueDate);
}

export const lockedDetail = (dueDate: string, today: string) => `Kan bockas av ${earlyDay(dueDate, today)}`;
export const lockedMessage = (title: string, dueDate: string, today: string) =>
  `${title} kan bockas av ${earlyDay(dueDate, today)}.`;
export const lockedLabel = (title: string, dueDate: string, today: string) =>
  `${title}: kan bockas av ${earlyDay(dueDate, today)}`;
export const earlyDetail = (dueDate: string, today: string) => `Inga mynt förrän ${earlyDay(dueDate, today)}`;
export const earlyDoneMessage = (title: string, dueDate: string, today: string) =>
  `${title} är klar. Inga mynt, eftersom den inte är dags förrän ${earlyDay(dueDate, today)}.`;
