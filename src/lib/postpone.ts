import { addDays, formatShortDay, formatTabDay } from "./dates";
import { byOpenOrder, type Ordered } from "./open-order";

/** The first day a chore can be postponed to: today for a late one, else the day after its own. */
export const firstPostponeDay = (dueDate: string, today: string) => (dueDate < today ? today : addDays(dueDate, 1));

/** The three one-tap choices, today and tomorrow by name and later days like the day tabs. */
export function quickDays(dueDate: string, today: string): { day: string; label: string }[] {
  const first = firstPostponeDay(dueDate, today);
  return [0, 1, 2].map((n) => {
    const day = addDays(first, n);
    const label = day === today ? "Idag" : day === addDays(today, 1) ? "Imorgon" : formatTabDay(day);
    return { day, label };
  });
}

export const movedText = (title: string, day: string, today: string) =>
  `"${title}" flyttad till ${day === today ? "idag" : formatShortDay(day)}`;
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
