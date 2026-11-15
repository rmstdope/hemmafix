import "server-only";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { todayIso } from "@/lib/dates";
import { UserError } from "@/lib/errors";
import {
  ACCESS_REMOVED_TEXT,
  alreadyRoleText,
  ambiguousMemberText,
  CHILD_TEXT,
  findMemberByName,
  firstName,
  formatDone,
  formatFamily,
  formatFloorsAndRooms,
  formatOpenTasks,
  noSuchMemberText,
  roleChangedText,
} from "@/lib/mcp-texts";
import type { Role } from "@/lib/permissions";
import {
  HISTORY_LIMIT,
  HISTORY_PERIODS,
  listCompletedBy,
  listFamily,
  listMembers,
  listOpenInstances,
  notifyHouseholdChanged,
  type HistoryPeriod,
} from "./chores";
import { listFloors, listRooms, setMemberRole, type Actor } from "./household";
import { resolveMcpMember } from "./mcp-access";
import { registerTaskTools } from "./mcp-tasks";

const text = (message: string, isError = false) => ({ content: [{ type: "text" as const, text: message }], isError });

const DENIED_TEXT = { removed: ACCESS_REMOVED_TEXT, child: CHILD_TEXT } as const;

const isHistoryPeriod = (n: number): n is HistoryPeriod => (HISTORY_PERIODS as readonly number[]).includes(n);

const PERIOD_LABELS: Record<HistoryPeriod, string> = { 7: "senaste veckan", 30: "senaste månaden", 365: "senaste året" };

/**
 * Runs a tool for the person behind the token as they are right now: removed or demoted people
 * get the agreed text, and a refusal from the app's own rules is read back as it is worded there.
 */
async function asActor(userId: string, run: (actor: Actor) => Promise<string>) {
  const access = await resolveMcpMember(userId);
  if ("denied" in access) return text(DENIED_TEXT[access.denied], true);
  try {
    return text(await run(access.actor));
  } catch (err) {
    if (err instanceof UserError) return text(err.message, true);
    throw err;
  }
}

/** The MCP server for one connected person; every tool re-checks who that is when it runs. */
export function createHemmafixMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: "hemmafix", version: "1.0.0" });

  server.registerTool(
    "lista_vaningar_och_rum",
    {
      title: "Våningar och rum",
      description: "Visar hemmets våningar (översta först) och rummen på dem, med id som kan användas som filter.",
    },
    () =>
      asActor(userId, async ({ householdId }) => {
        const [floors, rooms] = await Promise.all([listFloors(householdId), listRooms(householdId)]);
        return formatFloorsAndRooms(
          floors.map((f) => ({ ...f, rooms: rooms.filter((r) => r.floorId === f.id).map(({ id, name }) => ({ id, name })) })),
        );
      }),
  );

  server.registerTool(
    "lista_familjen",
    { title: "Familjen", description: "Visar vilka som finns i hemmet och om de är vuxna eller barn, med id." },
    () => asActor(userId, async ({ householdId }) => formatFamily(await listFamily(householdId))),
  );

  server.registerTool(
    "lista_oppna_sysslor",
    {
      title: "Vad är kvar att göra",
      description:
        "Visar vad som är kvar att göra i hemmet: de öppna sysslorna. Kan begränsas till ett rum (rum), en hel våning (vaning) eller en person (vem: ett id, 'jag' eller 'ingen' för ej tilldelade).",
      inputSchema: z.object({
        rum: z.string().optional().describe("Rummets id"),
        vaning: z.string().optional().describe("Våningens id"),
        vem: z.string().optional().describe("Personens id, 'jag' eller 'ingen'"),
      }),
    },
    ({ rum, vaning, vem }) =>
      asActor(userId, async (actor) => {
        const [floors, rooms, members] = await Promise.all([
          listFloors(actor.householdId),
          listRooms(actor.householdId),
          listMembers(actor.householdId),
        ]);
        if (rum !== undefined && !rooms.some((r) => r.id === rum)) throw new UserError("Rummet finns inte i hemmet");
        if (vaning !== undefined && !floors.some((f) => f.id === vaning)) throw new UserError("Våningen finns inte i hemmet");
        const who = vem === "jag" ? "mine" : vem === "ingen" ? "none" : vem;
        if (who !== undefined && who !== "mine" && who !== "none" && !members.some((m) => m.id === who)) {
          throw new UserError("Personen finns inte i hemmet");
        }
        const open = await listOpenInstances(actor, { roomId: rum, floorId: vaning, who });
        const names = new Map(members.map((m) => [m.id, m.name]));
        return formatOpenTasks(
          open.map((i) => ({
            title: i.title,
            roomName: i.roomName,
            floorName: i.floorName,
            assigneeName: i.assigneeId ? (names.get(i.assigneeId) ?? null) : null,
            dueDate: i.dueDate,
          })),
          todayIso(),
          floors.length > 1,
        );
      }),
  );

  server.registerTool(
    "visa_gjort",
    {
      title: "Vad någon har gjort",
      description:
        "Visar vad en person har bockat av under en period (7, 30 eller 365 dagar; 30 om inget anges), nyaste först.",
      inputSchema: z.object({
        vem: z.string().optional().describe("Personens id eller 'jag' (standard)"),
        // Checked in the tool, not here, so a wrong period is answered in Swedish.
        period: z.coerce.number().optional().describe("Antal dagar: 7, 30 eller 365"),
      }),
    },
    ({ vem, period }) =>
      asActor(userId, async (actor) => {
        const days = period ?? 30;
        if (!isHistoryPeriod(days)) throw new UserError("Ogiltig period");
        const personId = !vem || vem === "jag" ? actor.userId : vem;
        const [members, floors] = await Promise.all([listMembers(actor.householdId), listFloors(actor.householdId)]);
        const person = members.find((m) => m.id === personId);
        if (!person) throw new UserError("Personen finns inte i hemmet");
        const done = await listCompletedBy(actor, personId, days);
        return formatDone(done, {
          today: todayIso(),
          who: person.name.split(" ")[0] ?? person.name,
          period: PERIOD_LABELS[days],
          truncated: done.length >= HISTORY_LIMIT,
          showFloors: floors.length > 1,
        });
      }),
  );

  registerTaskTools(server, userId);

  server.registerTool(
    "andra_roll",
    {
      title: "Ändra roll",
      description: "Gör en familjemedlem till vuxen eller barn. Hemmet behåller alltid minst en vuxen.",
      inputSchema: z.object({
        namn: z.string().describe("Personens namn i hemmet"),
        roll: z.string().describe('Antingen "vuxen" eller "barn"'),
      }),
      // Not read-only and destructive: clients ask the person to confirm before it runs.
      annotations: { readOnlyHint: false, destructiveHint: true, idempotentHint: true },
    },
    async ({ namn, roll }) => {
      // Checked here, not by the schema, so the answer is in Swedish and not the SDK's English.
      if (!namn.trim()) return text("Ange namnet på personen.", true);
      if (roll !== "vuxen" && roll !== "barn") return text("Rollen måste vara vuxen eller barn.", true);
      const access = await resolveMcpMember(userId);
      if ("denied" in access) return text(DENIED_TEXT[access.denied], true);
      const found = findMemberByName(await listMembers(access.actor.householdId), namn);
      if ("none" in found) return text(noSuchMemberText(namn.trim()), true);
      if ("ambiguous" in found) return text(ambiguousMemberText(namn.trim()), true);
      const next: Role = roll === "vuxen" ? "adult" : "child";
      const { member } = found;
      try {
        const changed = await setMemberRole(access.actor, member.id, next);
        // Open screens in the home refresh, as after a change made in the app.
        if (changed) await notifyHouseholdChanged(access.actor.householdId);
        const who = firstName(member.name);
        return text(changed ? roleChangedText(who, next) : alreadyRoleText(who, next));
      } catch (err) {
        if (err instanceof UserError) return text(err.message, true);
        throw err;
      }
    },
  );

  return server;
}

/** Serves one MCP request for the person the (already verified) access token belongs to. */
export function handleMcpRequest(request: Request, userId: string): Promise<Response> {
  return createMcpHandler(() => createHemmafixMcpServer(userId)).fetch(request);
}
