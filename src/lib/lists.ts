import type { z } from "zod";
import { firstName } from "./mcp-texts";
import type { listOrder, listSharing } from "./validation";

export type ListOrder = z.infer<typeof listOrder>;
export type ListSharing = z.infer<typeof listSharing>;

/** The orders of the Listor overview, in menu order; the first is where everyone starts. */
export const LIST_ORDERS = ["alfabetiskt", "andrad", "skapad"] as const satisfies readonly ListOrder[];

export const orderMenuLabel = (order: ListOrder) =>
  ({ alfabetiskt: "Alfabetiskt", andrad: "Senast ändrad", skapad: "Senast skapad" })[order];

type Sortable = { name: string; createdAt: Date; updatedAt: Date };

const collator = new Intl.Collator("sv", { sensitivity: "base" });

/** The lists in the person's order (a new array): A–Ö in Swedish, last changed first, or newest first. */
export function sortLists<T extends Sortable>(lists: readonly T[], order: ListOrder): T[] {
  const byName = (a: T, b: T) => collator.compare(a.name, b.name);
  const newestFirst = (key: "createdAt" | "updatedAt") => (a: T, b: T) =>
    b[key].getTime() - a[key].getTime() || byName(a, b);
  return [...lists].sort(
    order === "alfabetiskt" ? byName : order === "andrad" ? newestFirst("updatedAt") : newestFirst("createdAt"),
  );
}

type Named = { id: string; name: string };

/** The other members of the home, who a list may be shared with, A–Ö by first name. */
export function shareChoices<T extends Named>(members: readonly T[], viewerId: string): T[] {
  return members
    .filter((m) => m.id !== viewerId)
    .sort((a, b) => collator.compare(firstName(a.name), firstName(b.name)));
}

/** Who sees a private list, to one of them: the creator first, then "du", then the rest A–Ö. */
export function privacyLine(viewerId: string, creator: Named | null, shared: readonly Named[]): string {
  const others = shareChoices(shared, viewerId)
    .filter((m) => m.id !== creator?.id)
    .map((m) => firstName(m.name));
  const first = creator && creator.id !== viewerId ? [firstName(creator.name)] : [];
  const names = [...first, "du", ...others];
  if (names.length === 1) return "Privat · bara du";
  return `Privat · ${names.slice(0, -1).join(", ")} och ${names.at(-1)}`;
}

/** What a list row says about its items. */
export function countLabel(open: number, total: number): string {
  if (total === 0) return "Tom";
  return open === 0 ? "Allt klart" : `${open} kvar`;
}

/** The notice after Rensa. */
export function clearedNotice(count: number): string {
  return count === 1 ? "Rensade 1 sak" : `Rensade ${count} saker`;
}

export type ItemView = { id: string; text: string; rank: number; doneAt: Date | null };

export type ItemChange =
  | { type: "add"; id: string; text: string }
  | { type: "edit"; id: string; text: string }
  | { type: "done"; id: string; done: boolean }
  | { type: "remove"; id: string }
  | { type: "restore"; items: ItemView[] }
  | { type: "clear" };

const topRank = (items: ItemView[]) => items.reduce((max, i) => Math.max(max, i.rank), 0) + 1;

/** What the page shows while a change is on its way to the server (the same rules as src/server/lists.ts). */
export function applyItemChange(items: ItemView[], change: ItemChange): ItemView[] {
  switch (change.type) {
    case "add":
      return [...items, { id: change.id, text: change.text, rank: topRank(items), doneAt: null }];
    case "edit":
      return items.map((i) => (i.id === change.id ? { ...i, text: change.text } : i));
    case "done":
      return items.map((i) =>
        i.id !== change.id
          ? i
          : change.done
            ? { ...i, doneAt: new Date() }
            : { ...i, doneAt: null, rank: topRank(items) },
      );
    case "remove":
      return items.filter((i) => i.id !== change.id);
    case "restore":
      return [...items, ...change.items.filter((r) => !items.some((i) => i.id === r.id))];
    case "clear":
      return items.filter((i) => !i.doneAt);
  }
}
