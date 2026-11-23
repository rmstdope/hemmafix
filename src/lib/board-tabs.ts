import { addDays, formatTabDay, formatTabDayLong } from "./dates";

export type TabKey = "nu" | "imorgon" | "d2" | "d3" | "senare";
export const TAB_KEYS: TabKey[] = ["nu", "imorgon", "d2", "d3", "senare"];

/** The tab named by the `flik` URL parameter; Nu (the default) for anything else. */
export function parseTab(raw: string | null | undefined): TabKey {
  return TAB_KEYS.find((k) => k === raw) ?? "nu";
}

export type TabSplit<T> = { nu: T[]; d1: T[]; d2: T[]; d3: T[]; senare: T[] };

/**
 * Splits open tasks over the tabs: Nu (overdue and today), tomorrow and the two days after it,
 * and Senare (later, then undated). The input order is kept inside each tab.
 */
export function splitByTab<T extends { dueDate: string | null }>(items: T[], today: string): TabSplit<T> {
  const split: TabSplit<T> = { nu: [], d1: [], d2: [], d3: [], senare: [] };
  const days = [1, 2, 3].map((n) => addDays(today, n));
  for (const item of items) {
    const d = item.dueDate;
    if (d === null || d > days[2]!) split.senare.push(item);
    else if (d <= today) split.nu.push(item);
    else if (d === days[0]) split.d1.push(item);
    else if (d === days[1]) split.d2.push(item);
    else split.d3.push(item);
  }
  return split;
}

export type BoardTab = { key: TabKey; name: string; ariaLabel: string; count: number; overdue: boolean };

const tasks = (n: number) => (n === 0 ? "inga uppgifter" : n === 1 ? "1 uppgift" : `${n} uppgifter`);

/** The five tabs with their words, in order; `overdueInNu` turns the Nu count red. */
export function boardTabs(today: string, counts: Record<keyof TabSplit<unknown>, number>, overdueInNu: boolean): BoardTab[] {
  const d2 = addDays(today, 2);
  const d3 = addDays(today, 3);
  const rows: [TabKey, string, string, number][] = [
    ["nu", "Nu", "Nu", counts.nu],
    ["imorgon", "Imorgon", "Imorgon", counts.d1],
    ["d2", formatTabDay(d2), formatTabDayLong(d2), counts.d2],
    ["d3", formatTabDay(d3), formatTabDayLong(d3), counts.d3],
    ["senare", "Senare", "Senare", counts.senare],
  ];
  return rows.map(([key, name, spoken, count]) => ({
    key,
    name,
    ariaLabel: `${spoken}, ${tasks(count)}`,
    count,
    overdue: key === "nu" && overdueInNu,
  }));
}

export type FilterChoice = { place: string; vem: string };

/** The board's query string: `rum` / `plan` / `vem` for the filter and `flik` for any tab but Nu. */
export function boardQuery({ place, vem, tab }: FilterChoice & { tab: TabKey }): string {
  const params = new URLSearchParams();
  const [kind, id] = place.split(":");
  if (kind === "room" && id) params.set("rum", id);
  if (kind === "floor" && id) params.set("plan", id);
  if (vem) params.set("vem", vem);
  if (tab !== "nu") params.set("flik", tab);
  return params.toString();
}

/** One chip per filter that is on, worded as the panel words the choice. */
export function activeFilters(
  choice: FilterChoice,
  name: { place: (place: string) => string; vem: (vem: string) => string },
): { kind: "place" | "vem"; text: string }[] {
  const chips: { kind: "place" | "vem"; text: string }[] = [];
  if (choice.place) chips.push({ kind: "place", text: name.place(choice.place) });
  if (choice.vem) chips.push({ kind: "vem", text: name.vem(choice.vem) });
  return chips;
}
