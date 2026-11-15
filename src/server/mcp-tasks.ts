import "server-only";
import { and, eq } from "drizzle-orm";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { db } from "@/db";
import { chore, choreInstance } from "@/db/schema";
import { CHORE_TEMPLATES } from "@/lib/chore-templates";
import { todayIso } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import {
  ACCESS_REMOVED_TEXT,
  CHILD_TEXT,
  formatTaskLookup,
  taskAssignedText,
  taskCreatedText,
  taskEditedText,
  taskRemovedText,
  taskTickedText,
  taskUntickedText,
} from "@/lib/mcp-texts";
import { RECURRENCE_UNITS } from "@/lib/recurrence";
import * as chores from "./chores";
import { listRooms, listFloors, listMembersWithRoles, type Actor } from "./household";
import { resolveMcpMember } from "./mcp-access";

const text = (message: string, isError = false) => ({ content: [{ type: "text" as const, text: message }], isError });
const DENIED_TEXT = { removed: ACCESS_REMOVED_TEXT, child: CHILD_TEXT } as const;

/**
 * Runs one tool as the person the token belongs to, checked afresh each time. Mistakes the
 * person can fix come back as a Swedish error; with `changes`, the household's open devices
 * are told afterwards, as the app's server actions do.
 */
async function runAsMember(userId: string, changes: boolean, fn: (actor: Actor) => Promise<string>) {
  const access = await resolveMcpMember(userId);
  if ("denied" in access) return text(DENIED_TEXT[access.denied], true);
  let answer: string;
  try {
    answer = await fn(access.actor);
  } catch (e) {
    if (e instanceof UserError) return text(e.message, true);
    if (e instanceof z.ZodError) return text(e.issues[0]?.message ?? "Ogiltiga uppgifter", true);
    throw e;
  }
  if (changes) await chores.notifyHouseholdChanged(access.actor.householdId);
  return text(answer);
}

const id = z.uuid({ error: "Ogiltigt id. Hämta id:n med visa_sysslor_med_id." });
const kind = z.enum(["recurring", "once"]).describe("recurring = kommer tillbaka, once = görs en gång");
const when = {
  interval: z.number().int().optional().describe("Hur ofta, i antal enheter (bara för recurring)"),
  unit: z.enum(RECURRENCE_UNITS).optional().describe("day, week eller month (bara för recurring)"),
};

/** The title a task has now, for the answer; "Sysslan" when it cannot be found (the call then fails itself). */
async function titleOf(actor: Actor, by: { instanceId: string } | { choreId: string }): Promise<string> {
  const [row] =
    "instanceId" in by
      ? await db
          .select({ title: chore.title })
          .from(choreInstance)
          .innerJoin(chore, eq(chore.id, choreInstance.choreId))
          .where(and(eq(choreInstance.id, by.instanceId), eq(choreInstance.householdId, actor.householdId)))
      : await db
          .select({ title: chore.title })
          .from(chore)
          .where(and(eq(chore.id, by.choreId), eq(chore.householdId, actor.householdId)));
  return row?.title ?? "Sysslan";
}

const WRITES = { readOnlyHint: false, destructiveHint: false } as const;
const OVERWRITES = { readOnlyHint: false, destructiveHint: true } as const;

export function registerTaskTools(server: McpServer, userId: string): void {
  server.registerTool(
    "visa_sysslor_med_id",
    {
      title: "Visa sysslor, rum och familj med id",
      description:
        "Visar öppna sysslor, rum, familjemedlemmar och det som nyligen bockats av, med de id:n som behövs för att skapa, ändra, ta bort, tilldela, bocka av eller ångra en syssla. Använd den först.",
      annotations: { readOnlyHint: true },
    },
    () =>
      runAsMember(userId, false, async (actor) => {
        const [open, rooms, floors, members, done] = await Promise.all([
          chores.listOpenInstances(actor, {}),
          listRooms(actor.householdId),
          listFloors(actor.householdId),
          listMembersWithRoles(actor.householdId),
          chores.listRecentlyCompleted(actor),
        ]);
        const names = new Map(members.map((m) => [m.id, m.name]));
        const floorNames = new Map(floors.map((f) => [f.id, f.name]));
        return formatTaskLookup(
          {
            open: open.map((i) => ({
              id: i.id,
              choreId: i.choreId,
              title: i.title,
              roomName: i.roomName,
              assigneeName: i.assigneeId ? (names.get(i.assigneeId) ?? null) : null,
              dueDate: i.dueDate,
            })),
            rooms: rooms.map((r) => ({ id: r.id, name: r.name, floorName: floorNames.get(r.floorId) ?? null })),
            members: members.map((m) => ({ id: m.id, name: m.name, role: m.role })),
            recentlyDone: done.map((d) => ({
              id: d.id,
              title: d.title,
              doneByName: d.completedByName,
              isLatestTick: d.isLatestTick,
            })),
          },
          todayIso(),
        );
      }),
  );

  server.registerTool(
    "skapa_syssla",
    {
      title: "Skapa en syssla",
      description: `Skapar en syssla i ett rum, återkommande eller en gång. Fördefinierade sysslor anges med templateKey (${CHORE_TEMPLATES.map((t) => t.key).join(", ")}); annars skriv egen titel.`,
      inputSchema: z.object({
        title: z.string().describe("Vad som ska göras"),
        templateKey: z.string().optional().describe("Nyckel för en fördefinierad syssla"),
        roomId: id,
        kind,
        ...when,
        startDate: z.string().optional().describe("Första datum, ÅÅÅÅ-MM-DD (recurring; annars idag)"),
        dueDate: z.string().optional().describe("Förfallodatum, ÅÅÅÅ-MM-DD (once)"),
        assigneeId: z.string().nullish().describe("Vem sysslan tilldelas, varje gång"),
      }),
      annotations: WRITES,
    },
    (args) =>
      runAsMember(userId, true, async (actor) => {
        await chores.createChore(actor, args);
        const room = (await listRooms(actor.householdId)).find((r) => r.id === args.roomId);
        return taskCreatedText(args.title.trim(), room?.name ?? null);
      }),
  );

  server.registerTool(
    "andra_syssla",
    {
      title: "Ändra en syssla",
      description: "Ändrar en syssla (titel, rum, hur ofta, nästa datum) utifrån dess öppna tillfälle. Skriver över det som finns.",
      inputSchema: z.object({
        instanceId: id,
        title: z.string(),
        roomId: id,
        kind,
        ...when,
        dueDate: z.string().optional().describe("Nästa datum, ÅÅÅÅ-MM-DD"),
      }),
      annotations: OVERWRITES,
    },
    ({ instanceId, ...rest }) =>
      runAsMember(userId, true, async (actor) => {
        await chores.editChore(actor, instanceId, rest);
        return taskEditedText(rest.title.trim());
      }),
  );

  server.registerTool(
    "ta_bort_syssla",
    {
      title: "Ta bort en syssla",
      description: "Tar bort en syssla från listan. Det som redan är gjort finns kvar i historiken.",
      inputSchema: z.object({ choreId: id }),
      annotations: OVERWRITES,
    },
    ({ choreId }) =>
      runAsMember(userId, true, async (actor) => {
        const title = await titleOf(actor, { choreId });
        await chores.deleteChore(actor, choreId);
        return taskRemovedText(title);
      }),
  );

  server.registerTool(
    "tilldela_syssla",
    {
      title: "Tilldela en syssla",
      description:
        "Tilldelar en syssla till en person, eller till ingen (assigneeId null). scope denna_gang: id är ett tillfälle; varje_gang: id är sysslan. Skriver över den som var tilldelad.",
      inputSchema: z.object({
        id,
        assigneeId: z.string().min(1).nullable(),
        scope: z.enum(["denna_gang", "varje_gang"]),
      }),
      annotations: OVERWRITES,
    },
    (args) =>
      runAsMember(userId, true, async (actor) => {
        const everyTime = args.scope === "varje_gang";
        const title = await titleOf(actor, everyTime ? { choreId: args.id } : { instanceId: args.id });
        if (everyTime) await chores.assignChore(actor, args.id, args.assigneeId);
        else await chores.assignInstance(actor, args.id, args.assigneeId);
        const who = args.assigneeId
          ? ((await listMembersWithRoles(actor.householdId)).find((m) => m.id === args.assigneeId)?.name ?? null)
          : null;
        return taskAssignedText(title, who, everyTime);
      }),
  );

  server.registerTool(
    "bocka_av_syssla",
    {
      title: "Bocka av en syssla",
      description: "Bockar av ett öppet tillfälle. En återkommande syssla kommer tillbaka efter sitt intervall.",
      inputSchema: z.object({ instanceId: id }),
      annotations: WRITES,
    },
    ({ instanceId }) =>
      runAsMember(userId, true, async (actor) => {
        const title = await titleOf(actor, { instanceId });
        await chores.completeInstance(actor, instanceId);
        return taskTickedText(title);
      }),
  );

  server.registerTool(
    "angra_avbockning",
    {
      title: "Ångra en avbockning",
      description: "Ångrar den senaste avbockningen av en syssla. Id:t är det avbockade tillfället.",
      inputSchema: z.object({ instanceId: id }),
      annotations: WRITES,
    },
    ({ instanceId }) =>
      runAsMember(userId, true, async (actor) => {
        const title = await titleOf(actor, { instanceId });
        await chores.uncompleteInstance(actor, instanceId);
        return taskUntickedText(title);
      }),
  );
}
