import "server-only";
import { and, eq, isNull } from "drizzle-orm";
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

// The schemas below are loose on purpose: the SDK checks them before the handler runs, so a
// strict one would answer in English and before the access check. src/lib/validation.ts
// (inside chores.ts) does the real checking, in Swedish, once the member is known.
const id = z.string().describe("Ett id från visa_sysslor_med_id");
const kind = z.string().optional().describe(`recurring (kommer tillbaka, standard) eller once (görs en gång). Saknar uppgiften en schemafras i visa_sysslor_med_id är den once; utelämnas kind blir den recurring`);
const coins = z.number().optional().describe("Hur många mynt uppgiften ger när den bockas av, heltal 0–100. Utelämnad: 10 för en ny uppgift, oförändrat för en ändrad");
const when = {
  interval: z.number().optional().describe("Hur ofta, i antal enheter (bara för recurring). Varje vecka = 1 week, Varannan vecka = 2 week, Var 3:e månad = 3 month"),
  unit: z.string().optional().describe(`${RECURRENCE_UNITS.join(", ")} (bara för recurring). Varannan vecka = 2 week, Varje månad = 1 month`),
};

function assertIds(...ids: string[]) {
  for (const value of ids) {
    if (!z.uuid().safeParse(value).success) throw new UserError("Ogiltigt id. Hämta id:n med visa_sysslor_med_id.");
  }
}

type Found = { title: string; completedAt: Date | null };

/** The task an id points to in the actor's home, or null (unknown, removed or another home's). */
async function find(actor: Actor, by: { instanceId: string } | { choreId: string }): Promise<Found | null> {
  const [row] =
    "instanceId" in by
      ? await db
          .select({ title: chore.title, completedAt: choreInstance.completedAt })
          .from(choreInstance)
          .innerJoin(chore, eq(chore.id, choreInstance.choreId))
          .where(and(eq(choreInstance.id, by.instanceId), eq(choreInstance.householdId, actor.householdId)))
      : await db
          .select({ title: chore.title, completedAt: chore.archivedAt })
          .from(chore)
          .where(and(eq(chore.id, by.choreId), eq(chore.householdId, actor.householdId), isNull(chore.archivedAt)));
  return row ?? null;
}

const GONE = "Uppgiften finns inte längre";
async function titleOf(actor: Actor, by: { instanceId: string } | { choreId: string }): Promise<string> {
  const found = await find(actor, by);
  if (!found) throw new UserError(GONE);
  return found.title;
}

const WRITES = { readOnlyHint: false, destructiveHint: false } as const;
const OVERWRITES = { readOnlyHint: false, destructiveHint: true } as const;

export function registerTaskTools(server: McpServer, userId: string): void {
  server.registerTool(
    "visa_sysslor_med_id",
    {
      title: "Visa uppgifter, rum och familj med id",
      description:
        "Visar öppna uppgifter, rum, familjemedlemmar och det som nyligen bockats av, med de id:n som behövs för att skapa, ändra, ta bort, tilldela, bocka av eller ångra en uppgift. Använd den först.",
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
              floorName: i.floorName,
              assigneeName: i.assigneeId ? (names.get(i.assigneeId) ?? null) : null,
              dueDate: i.dueDate,
              recurrence: i.recurrence,
              coins: i.coins ?? 10,
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
      title: "Skapa en uppgift",
      description: `Skapar en uppgift i ett rum, återkommande eller en gång. Fördefinierade uppgifter anges med templateKey (${CHORE_TEMPLATES.map((t) => t.key).join(", ")}); annars skriv egen titel.`,
      inputSchema: z.object({
        title: z.string().describe("Vad som ska göras"),
        templateKey: z.string().optional().describe("Nyckel för en fördefinierad uppgift"),
        roomId: id,
        kind: kind.describe("Utelämnad kind ger once (görs en gång, utan förfallodatum om inget anges); recurring kommer tillbaka och kräver interval och unit"),
        ...when,
        startDate: z.string().optional().describe("Första datum, ÅÅÅÅ-MM-DD (recurring; annars idag)"),
        dueDate: z.string().optional().describe("Förfallodatum, ÅÅÅÅ-MM-DD (once)"),
        assigneeId: z.string().optional().describe("Vem uppgiften tilldelas, varje gång (utelämna för ingen)"),
        mynt: coins,
      }),
      annotations: WRITES,
    },
    (args) =>
      runAsMember(userId, true, async (actor) => {
        assertIds(args.roomId);
        const { mynt, ...rest } = args;
        await chores.createChore(actor, { ...rest, assigneeId: rest.assigneeId ?? null, coins: mynt });
        const room = (await listRooms(actor.householdId)).find((r) => r.id === args.roomId);
        return taskCreatedText(args.title.trim(), room?.name ?? null);
      }),
  );

  server.registerTool(
    "andra_syssla",
    {
      title: "Ändra en uppgift",
      description: "Ändrar en uppgift (titel, rum, hur ofta, nästa datum) utifrån dess öppna tillfälle. Skriver över det som finns.",
      inputSchema: z.object({
        instanceId: id,
        title: z.string(),
        roomId: id,
        kind,
        ...when,
        dueDate: z.string().optional().describe("Nästa datum, ÅÅÅÅ-MM-DD"),
        mynt: coins,
      }),
      annotations: OVERWRITES,
    },
    ({ instanceId, mynt, ...rest }) =>
      runAsMember(userId, true, async (actor) => {
        assertIds(instanceId, rest.roomId);
        await chores.editChore(actor, instanceId, { ...rest, coins: mynt });
        return taskEditedText(rest.title.trim());
      }),
  );

  server.registerTool(
    "ta_bort_syssla",
    {
      title: "Ta bort en uppgift",
      description: "Tar bort en uppgift från listan. Det som redan är gjort finns kvar i historiken.",
      inputSchema: z.object({ choreId: id }),
      annotations: OVERWRITES,
    },
    ({ choreId }) =>
      runAsMember(userId, true, async (actor) => {
        assertIds(choreId);
        const title = await titleOf(actor, { choreId });
        await chores.deleteChore(actor, choreId);
        return taskRemovedText(title);
      }),
  );

  server.registerTool(
    "tilldela_syssla",
    {
      title: "Tilldela en uppgift",
      description:
        "Tilldelar en uppgift till en person, eller till ingen (utelämna assigneeId). scope denna_gang: id är ett tillfälle; varje_gang: id är uppgiften. Skriver över den som var tilldelad.",
      inputSchema: z.object({
        id,
        assigneeId: z.string().optional().describe("Vem uppgiften tilldelas; utelämna för ingen"),
        scope: z.string().describe("denna_gang (id är ett tillfälle) eller varje_gang (id är uppgiften)"),
      }),
      annotations: OVERWRITES,
    },
    (args) =>
      runAsMember(userId, true, async (actor) => {
        assertIds(args.id);
        if (args.scope !== "denna_gang" && args.scope !== "varje_gang") {
          throw new UserError("Välj denna_gang eller varje_gang");
        }
        const everyTime = args.scope === "varje_gang";
        const title = await titleOf(actor, everyTime ? { choreId: args.id } : { instanceId: args.id });
        const assigneeId = args.assigneeId ?? null;
        if (everyTime) await chores.assignChore(actor, args.id, assigneeId);
        else await chores.assignInstance(actor, args.id, assigneeId);
        const who = assigneeId
          ? ((await listMembersWithRoles(actor.householdId)).find((m) => m.id === assigneeId)?.name ?? null)
          : null;
        return taskAssignedText(title, who, everyTime);
      }),
  );

  server.registerTool(
    "bocka_av_syssla",
    {
      title: "Bocka av en uppgift",
      description: "Bockar av ett öppet tillfälle. En återkommande uppgift kommer tillbaka efter sitt intervall.",
      inputSchema: z.object({ instanceId: id }),
      annotations: WRITES,
    },
    ({ instanceId }) =>
      runAsMember(userId, true, async (actor) => {
        assertIds(instanceId);
        const title = await titleOf(actor, { instanceId });
        await chores.completeInstance(actor, instanceId);
        return taskTickedText(title);
      }),
  );

  server.registerTool(
    "angra_avbockning",
    {
      title: "Ångra en avbockning",
      description: "Ångrar den senaste avbockningen av en uppgift. Id:t är det avbockade tillfället.",
      inputSchema: z.object({ instanceId: id }),
      annotations: WRITES,
    },
    ({ instanceId }) =>
      runAsMember(userId, true, async (actor) => {
        assertIds(instanceId);
        const found = await find(actor, { instanceId });
        if (!found) throw new UserError(GONE);
        if (!found.completedAt) throw new UserError("Den är inte avbockad");
        const title = found.title;
        await chores.uncompleteInstance(actor, instanceId);
        return taskUntickedText(title);
      }),
  );
}
