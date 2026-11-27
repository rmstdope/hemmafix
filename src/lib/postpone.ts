import { addDays, formatShortDay, formatTabDay } from "./dates";
import { byOpenOrder, type Ordered } from "./open-order";

/** The last day a chore cannot be postponed to: the later of today and its own day. */
export const laterThan = (dueDate: string, today: string) => (dueDate > today ? dueDate : today);

/** The three one-tap choices, named like the day tabs. */
export function quickDays(dueDate: string, today: string): { day: string; label: string }[] {
  const from = laterThan(dueDate, today);
  return [1, 2, 3].map((n) => {
    const day = addDays(from, n);
    return { day, label: day === addDays(today, 1) ? "Imorgon" : formatTabDay(day) };
  });
}

export const movedText = (title: string, day: string) => `"${title}" flyttad till ${formatShortDay(day)}`;
export const restoredText = (title: string, day: string) => `"${title}" är tillbaka på ${formatShortDay(day)}`;

/** The open list as it will be once the task has its new day. */
export function moveTask<T extends Ordered>(items: T[], id: string, day: string): T[] {
  return items.map((t) => (t.id === id ? { ...t, dueDate: day } : t)).sort(byOpenOrder);
}

/**
 * Whose ⌄ gets focus after a move on a tab listing `ids`: the moved task's when it stays on the
 * tab, else the one that takes its place, else the one above. Null: the tab is empty.
 */
export function focusAfterMove(ids: string[], moved: string, stays: boolean): string | null {
  if (stays) return moved;
  const at = ids.indexOf(moved);
  return ids[at + 1] ?? ids[at - 1] ?? null;
}
