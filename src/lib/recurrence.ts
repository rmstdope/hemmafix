/** How often a recurring task comes back, counted from the day it was last done. */
export const RECURRENCE_UNITS = ["day", "week", "month"] as const;
export type RecurrenceUnit = (typeof RECURRENCE_UNITS)[number];
export type Recurrence = { unit: RecurrenceUnit; interval: number };

export const MAX_INTERVAL = 365;

function parse(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return { y: y!, m: m!, d: d! };
}

const format = (date: Date) => date.toISOString().slice(0, 10);

/**
 * The next due date (YYYY-MM-DD) after a task was done on `doneOn`. Months keep the day
 * of month where they can and fall back to the month's last day: done on 31 January,
 * "every month" is next due on 28 (or 29) February.
 */
export function nextDueDate(doneOn: string, { unit, interval }: Recurrence): string {
  const { y, m, d } = parse(doneOn);
  if (unit === "month") {
    const target = new Date(Date.UTC(y, m - 1 + interval, 1));
    const lastDay = new Date(Date.UTC(target.getUTCFullYear(), target.getUTCMonth() + 1, 0)).getUTCDate();
    target.setUTCDate(Math.min(d, lastDay));
    return format(target);
  }
  const days = unit === "week" ? interval * 7 : interval;
  return format(new Date(Date.UTC(y, m - 1, d + days)));
}

const UNIT_WORDS: Record<RecurrenceUnit, string> = { day: "dag", week: "vecka", month: "månad" };

/** Swedish ordinal suffix: 1:a, 2:a, 3:e … 11:e, 12:e … 21:a, 22:a. */
function ordinal(n: number) {
  const last = n % 10;
  const lastTwo = n % 100;
  return `${n}:${(last === 1 || last === 2) && lastTwo !== 11 && lastTwo !== 12 ? "a" : "e"}`;
}

/** "Varje vecka", "Varannan dag", "Var 3:e månad". */
export function formatRecurrence({ unit, interval }: Recurrence): string {
  const word = UNIT_WORDS[unit];
  if (interval === 1) return `Varje ${word}`;
  if (interval === 2) return `Varannan ${word}`;
  return `Var ${ordinal(interval)} ${word}`;
}
