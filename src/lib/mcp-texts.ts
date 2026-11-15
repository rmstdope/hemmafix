import { formatDay, formatTime, HOME_TIME_ZONE, formatDue } from "./dates";
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

const dayInHomeZone = new Intl.DateTimeFormat("sv-SE", {
  timeZone: HOME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** What one person ticked off, newest first, grouped by day like the app's history page. */
export function formatDone(
  done: DoneTask[],
  opts: { today: string; who: string; period: string; truncated: boolean; showFloors: boolean },
): string {
  if (done.length === 0) return NOTHING_DONE_TEXT;
  const days: { day: string; lines: string[] }[] = [];
  for (const d of done) {
    const day = dayInHomeZone.format(d.completedAt);
    const room = d.roomName === null ? "" : ` – ${roomLabel(d.roomName, d.floorName, opts.showFloors)}`;
    const line = `- ${formatTime(d.completedAt)} ${d.title}${room}`;
    const last = days[days.length - 1];
    if (last?.day === day) last.lines.push(line);
    else days.push({ day, lines: [line] });
  }
  const body = days.map((g) => `${formatDay(g.day, opts.today)}\n${g.lines.join("\n")}`).join("\n\n");
  return `${opts.who} har gjort, ${opts.period}:\n\n${body}${opts.truncated ? `\n\nVisar de ${done.length} senaste.` : ""}`;
}
