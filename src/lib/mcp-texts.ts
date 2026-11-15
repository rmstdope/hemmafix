import { formatDue } from "./dates";

/** What Claude (and so a family member) reads back from Hemmafix, all in Swedish. */
export const NOTHING_OPEN_TEXT = "Inget är kvar att göra just nu.";
export const ACCESS_REMOVED_TEXT =
  "Ditt konto har inte längre tillgång till Hemmafix. Be den som administrerar appen att lägga till din adress igen.";
export const CHILD_TEXT = "Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.";

export type OpenTask = {
  title: string;
  roomName: string | null;
  assigneeName: string | null;
  dueDate: string | null;
};

/** One line per open task, in the order given; `today` is YYYY-MM-DD in the home's time zone. */
export function formatOpenTasks(tasks: OpenTask[], today: string): string {
  if (tasks.length === 0) return NOTHING_OPEN_TEXT;
  return tasks
    .map((t) => {
      const parts = [
        t.roomName,
        t.assigneeName ?? "ingen tilldelad",
        formatDue(t.dueDate, today)?.label ?? "inget datum",
      ].filter((part): part is string => part !== null);
      return `- ${t.title} – ${parts.join(", ")}`;
    })
    .join("\n");
}

const NONE = "(inga)";

export type LookupInput = {
  open: (OpenTask & { id: string; choreId: string; recurrence: { unit: string; interval: number } | null })[];
  rooms: { id: string; name: string; floorName: string | null }[];
  members: { id: string; name: string; role: "adult" | "child" }[];
  recentlyDone: { id: string; title: string; doneByName: string | null; isLatestTick: boolean }[];
};

/** The ids Claude needs to change things, next to what a person would call them. */
export function formatTaskLookup(input: LookupInput, today: string): string {
  const section = (heading: string, lines: string[]) => [heading, ...(lines.length ? lines : [NONE])];
  return [
    ...section(
      "Öppna sysslor:",
      input.open.map((t) => {
        // What andra_syssla needs to hand back unchanged: kind, interval, unit and the ISO due date.
        const shape = t.recurrence
          ? `kind recurring, interval ${t.recurrence.interval}, unit ${t.recurrence.unit}`
          : "kind once";
        return `${formatOpenTasks([t], today)} (syssla ${t.choreId}, tillfälle ${t.id}, ${shape}${t.dueDate ? `, dueDate ${t.dueDate}` : ""})`;
      }),
    ),
    ...section(
      "Rum:",
      input.rooms.map((r) => `- ${[r.name, r.floorName].filter(Boolean).join(", ")} (id ${r.id})`),
    ),
    ...section(
      "Familj:",
      input.members.map((m) => `- ${m.name}, ${m.role === "adult" ? "vuxen" : "barn"} (id ${m.id})`),
    ),
    ...section(
      "Nyligen avbockade:",
      input.recentlyDone.map(
        (d) =>
          `- ${d.title}${d.doneByName ? `, av ${d.doneByName}` : ""} (tillfälle ${d.id}${d.isLatestTick ? ", kan ångras" : ""})`,
      ),
    ),
  ].join("\n");
}

/** One short sentence per change, naming the task. */
export const taskCreatedText = (title: string, roomName: string | null) =>
  `Sysslan ${title} är skapad${roomName ? ` i ${roomName}` : ""}.`;
export const taskEditedText = (title: string) => `Sysslan ${title} är ändrad.`;
export const taskRemovedText = (title: string) =>
  `Sysslan ${title} är borttagen. Det som redan är gjort finns kvar i historiken.`;
export const taskAssignedText = (title: string, who: string | null, everyTime: boolean) =>
  `${title} är ${who ? `tilldelad ${who}` : "inte längre tilldelad någon"} ${everyTime ? "varje gång" : "den här gången"}.`;
export const taskTickedText = (title: string) => `Klart: ${title} är avbockad.`;
export const taskUntickedText = (title: string) => `${title} är inte längre avbockad.`;
