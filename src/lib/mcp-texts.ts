import { formatDue } from "./dates";
import type { Role } from "./permissions";

/** What Claude (and so a family member) reads back from Hemmafix, all in Swedish. */
export const NOTHING_OPEN_TEXT = "Inget är kvar att göra just nu.";
export const ACCESS_REMOVED_TEXT =
  "Ditt konto har inte längre tillgång till Hemmafix. Be den som administrerar appen att lägga till din adress igen.";
export const CHILD_TEXT = "Bara vuxna kan använda Hemmafix via Claude. Be en vuxen i familjen om hjälp.";

const ROLE_WORD: Record<Role, string> = { adult: "vuxen", child: "barn" };

export const roleChangedText = (name: string, role: Role) => `${name} är nu ${ROLE_WORD[role]}.`;
export const alreadyRoleText = (name: string, role: Role) => `${name} är redan ${ROLE_WORD[role]}.`;
export const noSuchMemberText = (name: string) => `Ingen i hemmet heter ${name}.`;
export const ambiguousMemberText = (name: string) =>
  `Flera i hemmet heter ${name}. Ändra rollen i appen under Hemmet.`;

/** Picks the one member with this name (case and surrounding spaces ignored). */
export function findMemberByName<M extends { name: string }>(
  members: M[],
  name: string,
): { member: M } | { none: true } | { ambiguous: true } {
  const wanted = name.trim().toLowerCase();
  const found = members.filter((m) => m.name.trim().toLowerCase() === wanted);
  if (found.length === 0) return { none: true };
  if (found.length > 1) return { ambiguous: true };
  return { member: found[0]! };
}

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
