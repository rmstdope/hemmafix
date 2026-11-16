import { addDays, formatDay } from "./dates";

export type DueGroup<T> = {
  /** "overdue", "later", "undated", or the YYYY-MM-DD of a day; what a fold is remembered by. */
  key: string;
  label: string;
  overdue: boolean;
  /** Rows under a named day need no date; Försenade and Senare keep it. */
  showDate: boolean;
  items: T[];
};

/** How many days, today included, get a divider of their own. */
const DAYS = 5;

/**
 * Splits tasks into the board's groups: Försenade, one per day for today and the four days after it,
 * Senare, Utan datum. Empty groups are left out and the input order is kept inside each group.
 */
export function groupByDue<T extends { dueDate: string | null }>(items: T[], today: string): DueGroup<T>[] {
  const days = Array.from({ length: DAYS }, (_, i) => addDays(today, i));
  const lastDay = days[DAYS - 1]!;
  const groups: DueGroup<T>[] = [
    { key: "overdue", label: "Försenade", overdue: true, showDate: true, items: [] },
    ...days.map((day, i) => ({
      key: day,
      label: i === 1 ? "Imorgon" : formatDay(day, today),
      overdue: false,
      showDate: false,
      items: [] as T[],
    })),
    { key: "later", label: "Senare", overdue: false, showDate: true, items: [] },
    { key: "undated", label: "Utan datum", overdue: false, showDate: false, items: [] },
  ];
  const byKey = new Map(groups.map((g) => [g.key, g]));
  for (const item of items) {
    const d = item.dueDate;
    const key = d === null ? "undated" : d < today ? "overdue" : d > lastDay ? "later" : d;
    byKey.get(key)!.items.push(item);
  }
  return groups.filter((g) => g.items.length > 0);
}
