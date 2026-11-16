import { routineAddedNotice } from "./routine-texts";
import { formatDay, formatDue, formatTime, todayIso } from "./dates";
import { formatRecurrence, type Recurrence } from "./recurrence";
import { floorLabel, roomLabel } from "./floors";
import { ROLE_LABELS, type Role } from "./permissions";

/** What Claude (and so a family member) reads back from Hemmafix, all in Swedish. */
export const NOTHING_OPEN_TEXT = "Inget är kvar att göra just nu.";
export const NO_FLOORS_TEXT = "Inga våningar eller rum ännu.";
export const NOTHING_DONE_TEXT = "Inget gjort under perioden.";
export const ACCESS_REMOVED_TEXT =
  "Ditt konto har inte längre tillgång till Hemmafix. Be den som administrerar appen att lägga till din adress igen.";
export const CHILD_TEXT = "Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.";

const ROLE_WORD: Record<Role, string> = { adult: "vuxen", child: "barn" };

export const roleChangedText = (name: string, role: Role) => `${name} är nu ${ROLE_WORD[role]}.`;
export const alreadyRoleText = (name: string, role: Role) => `${name} är redan ${ROLE_WORD[role]}.`;
export const noSuchMemberText = (name: string) => `Ingen i hemmet heter ${name}.`;
export const ambiguousMemberText = (name: string) =>
  `Flera i hemmet heter ${name}. Ändra rollen i appen under Hemmet.`;

const norm = (name: string) => name.trim().toLowerCase();

/** The name the app uses for a person: the first word of their Google name. */
export const firstName = (name: string) => name.trim().split(/\s+/)[0] ?? "";

/**
 * Picks the one member called this: an exact full name first (case and surrounding spaces
 * ignored), else a first name no one else shares.
 */
export function findMemberByName<M extends { name: string }>(
  members: M[],
  name: string,
): { member: M } | { none: true } | { ambiguous: true } {
  const wanted = norm(name);
  for (const found of [
    members.filter((m) => norm(m.name) === wanted),
    members.filter((m) => norm(firstName(m.name)) === wanted),
  ]) {
    if (found.length === 1) return { member: found[0]! };
    if (found.length > 1) return { ambiguous: true };
  }
  return { none: true };
}

export type OpenTask = {
  title: string;
  roomName: string | null;
  floorName?: string | null;
  assigneeName: string | null;
  dueDate: string | null;
};

/**
 * One line per open task, in the order given; `today` is YYYY-MM-DD in the home's time zone.
 * With `showFloors` (the home has several floors) the room carries its floor, as in the app.
 */
export function formatOpenTasks(tasks: OpenTask[], today: string, showFloors = false): string {
  if (tasks.length === 0) return NOTHING_OPEN_TEXT;
  return tasks
    .map((t) => {
      const parts = [
        t.roomName === null ? null : roomLabel(t.roomName, t.floorName ?? null, showFloors),
        t.assigneeName ?? "ingen tilldelad",
        formatDue(t.dueDate, today)?.label ?? "inget datum",
      ].filter((part): part is string => part !== null);
      return `- ${t.title} – ${parts.join(", ")}`;
    })
    .join("\n");
}

const NONE = "(inga)";

export type LookupInput = {
  open: (OpenTask & { id: string; choreId: string; recurrence: Recurrence | null })[];
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
        // The room with its floor and the schedule read as in the app; the ISO date is what
        // andra_syssla needs handed back unchanged.
        const line = formatOpenTasks([t], today, true) + (t.recurrence ? `, ${formatRecurrence(t.recurrence)}` : "");
        return `${line} (syssla ${t.choreId}, tillfälle ${t.id}${t.dueDate ? `, nästa datum ${t.dueDate}` : ""})`;
      }),
    ),
    ...section(
      "Rum:",
      input.rooms.map((r) => `- ${[r.name, r.floorName ? floorLabel(r.floorName) : r.floorName].filter(Boolean).join(", ")} (id ${r.id})`),
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

export type FloorWithRooms = { id: string; name: string; rooms: { id: string; name: string }[] };

/** Floors as the app shows them (top first), each with its rooms; ids let Claude filter on them. */
export function formatFloorsAndRooms(floors: FloorWithRooms[]): string {
  if (floors.length === 0) return NO_FLOORS_TEXT;
  return floors
    .map((f) =>
      [
        `${floorLabel(f.name)} [${f.id}]`,
        ...(f.rooms.length === 0 ? ["(inga rum)"] : f.rooms.map((r) => `- ${r.name} [${r.id}]`)),
      ].join("\n"),
    )
    .join("\n\n");
}

export function formatFamily(members: { id: string; name: string; role: Role }[]): string {
  return members.map((m) => `- ${m.name} – ${ROLE_LABELS[m.role]} [${m.id}]`).join("\n");
}

export type DoneTask = { title: string; roomName: string | null; floorName: string | null; completedAt: Date };

/** What one person ticked off, newest first, grouped by day like the app's history page. */
export function formatDone(
  done: DoneTask[],
  opts: { today: string; who: string; period: string; truncated: boolean; showFloors: boolean },
): string {
  if (done.length === 0) return NOTHING_DONE_TEXT;
  const days: { day: string; lines: string[] }[] = [];
  for (const d of done) {
    const day = todayIso(d.completedAt);
    const room = d.roomName === null ? "" : ` – ${roomLabel(d.roomName, d.floorName, opts.showFloors)}`;
    const line = `- ${formatTime(d.completedAt)} ${d.title}${room}`;
    const last = days[days.length - 1];
    if (last?.day === day) last.lines.push(line);
    else days.push({ day, lines: [line] });
  }
  const body = days.map((g) => `${formatDay(g.day, opts.today)}\n${g.lines.join("\n")}`).join("\n\n");
  return `${opts.who} har gjort, ${opts.period}:\n\n${body}${opts.truncated ? `\n\nVisar de ${done.length} senaste.` : ""}`;
}

export const ROOM_RENAMED_TEXT = "Rummet har bytt namn.";
export const ROOM_REMOVED_TEXT = "Rummet togs bort.";
export const FLOOR_RENAMED_TEXT = "Våningen har bytt namn.";
export const FLOOR_MOVED_TEXT = "Våningen flyttades.";
export const FLOOR_REMOVED_TEXT = "Våningen togs bort.";
export const FLOOR_AT_TOP_TEXT = "Våningen är redan överst.";
export const FLOOR_AT_BOTTOM_TEXT = "Våningen är redan nederst.";

export const homeRenamedText = (name: string) => `Hemmet heter nu ${name}.`;
export const roomAddedText = (room: string, floorName: string) =>
  `Rummet ${room} lades till på ${floorLabel(floorName)}.`;
export const floorAddedText = (floorName: string) => `${floorLabel(floorName)} lades till.`;

export const NO_ROUTINES_TEXT = "Inga rutiner ännu.";
export type RoutineListing = { id: string; name: string; tasks: { id: string; title: string }[] };

/** Routines in the order the app shows them, each with its tasks; the ids let Claude change or add them. */
export function formatRoutines(routines: RoutineListing[]): string {
  if (routines.length === 0) return NO_ROUTINES_TEXT;
  return routines
    .map((r) =>
      [`${r.name} [${r.id}]`, ...(r.tasks.length === 0 ? ["(inga uppgifter)"] : r.tasks.map((t) => `- ${t.title} [${t.id}]`))].join("\n"),
    )
    .join("\n\n");
}

export const routineCreatedText = (name: string, id: string) => `Rutinen ${name} är skapad (id ${id}).`;
export const routineRenamedText = (name: string) => `Rutinen heter nu ${name}.`;
export const routineRemovedText = (name: string) =>
  `Rutinen ${name} togs bort. Uppgifter som redan lagts till i hemmet finns kvar.`;
export const routineTaskAddedText = (title: string, id: string) => `Uppgiften ${title} lades till i rutinen (id ${id}).`;
export const routineTaskRenamedText = (title: string) => `Uppgiften heter nu ${title}.`;
export const ROUTINE_TASK_REMOVED_TEXT = "Uppgiften togs bort ur rutinen.";
export const routineAddedToRoomText = (count: number, roomName: string) => `${routineAddedNotice(count)} i ${roomName}.`;
