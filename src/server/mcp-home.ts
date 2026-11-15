import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { UserError } from "@/lib/errors";
import {
  FLOOR_AT_BOTTOM_TEXT,
  FLOOR_AT_TOP_TEXT,
  FLOOR_MOVED_TEXT,
  FLOOR_REMOVED_TEXT,
  FLOOR_RENAMED_TEXT,
  floorAddedText,
  homeRenamedText,
  ROOM_REMOVED_TEXT,
  ROOM_RENAMED_TEXT,
  roomAddedText,
} from "@/lib/mcp-texts";
import { floorDirection, floorId, householdName, roomId } from "@/lib/validation";
import { notifyHouseholdChanged } from "./chores";
import * as home from "./household";
import { DENIED_TEXT, resolveMcpMember, text } from "./mcp-access";

/**
 * Runs one tool as the connected person: who they are is resolved on every call, the rules are
 * those of src/server/household.ts (the same functions the app uses), mistakes they can fix come
 * back as Swedish tool errors, and a successful write tells the household's open devices.
 */
type Outcome = string | { text: string; unchanged: true };

async function runTool(userId: string, write: boolean, fn: (actor: home.Actor) => Promise<Outcome>) {
  const access = await resolveMcpMember(userId);
  if ("denied" in access) return text(DENIED_TEXT[access.denied], true);
  try {
    const result = await fn(access.actor);
    if (typeof result !== "string") return text(result.text);
    if (write) await notifyHouseholdChanged(access.actor.householdId);
    return text(result);
  } catch (e) {
    if (e instanceof UserError) return text(e.message, true);
    if (e instanceof z.ZodError) return text(e.issues[0]?.message ?? "Ogiltiga uppgifter", true);
    throw e;
  }
}

// Ids and directions are checked here, not in the tool schemas, so a wrong one (a name instead of
// an id, "upp" instead of "up") is answered in Swedish instead of by the SDK's English message.
const FLOOR_MISSING = "Våningen finns inte i hemmet";
const ROOM_MISSING = "Rummet finns inte i hemmet";
const DIRECTION_TEXT = "Riktning ska vara up eller down";

function parseOr<T>(schema: { safeParse(v: unknown): { success: true; data: T } | { success: false } }, value: string, message: string): T {
  const parsed = schema.safeParse(value);
  if (!parsed.success) throw new UserError(message);
  return parsed.data;
}

const idsHint = " Ta id från lista_vaningar_och_rum.";
const change = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
const removal = { readOnlyHint: false, destructiveHint: true, idempotentHint: true } as const;

/** The tools for the home's name, floors and rooms. */
export function registerHomeTools(server: McpServer, userId: string): void {
  server.registerTool(
    "byt_namn_pa_hemmet",
    { title: "Byt namn på hemmet", description: "Byter hemmets namn.", inputSchema: z.object({ namn: z.string() }), annotations: change },
    ({ namn }) =>
      runTool(userId, true, async (actor) => {
        await home.renameHousehold(actor, namn);
        return homeRenamedText(householdName.parse(namn));
      }),
  );

  server.registerTool(
    "lagg_till_vaning",
    {
      title: "Lägg till våning",
      description: "Lägger till en våning överst i huset. Utan namn får den nästa lediga nummer.",
      inputSchema: z.object({ namn: z.string().optional() }),
      annotations: change,
    },
    ({ namn }) =>
      runTool(userId, true, async (actor) => floorAddedText((await home.addFloor(actor, namn)).name)),
  );

  server.registerTool(
    "byt_namn_pa_vaning",
    {
      title: "Byt namn på våning",
      description: `Byter namn på en våning.${idsHint}`,
      inputSchema: z.object({ vaning_id: z.string(), namn: z.string() }),
      annotations: change,
    },
    ({ vaning_id, namn }) =>
      runTool(userId, true, async (actor) => {
        await home.renameFloor(actor, parseOr(floorId, vaning_id, FLOOR_MISSING), namn);
        return FLOOR_RENAMED_TEXT;
      }),
  );

  server.registerTool(
    "flytta_vaning",
    {
      title: "Flytta våning",
      description: `Flyttar en våning ett steg uppåt (up) eller nedåt (down) i huset.${idsHint}`,
      inputSchema: z.object({ vaning_id: z.string(), riktning: z.string().describe("up eller down") }),
      annotations: change,
    },
    ({ vaning_id, riktning }) =>
      runTool(userId, true, async (actor) => {
        const target = parseOr(floorId, vaning_id, FLOOR_MISSING);
        const direction = parseOr(floorDirection, riktning, DIRECTION_TEXT);
        const before = (await home.listFloors(actor.householdId)).map((f) => f.id);
        const index = before.indexOf(target);
        if (index === 0 && direction === "up") return { text: FLOOR_AT_TOP_TEXT, unchanged: true };
        if (index === before.length - 1 && direction === "down") return { text: FLOOR_AT_BOTTOM_TEXT, unchanged: true };
        await home.moveFloor(actor, target, direction);
        return FLOOR_MOVED_TEXT;
      }),
  );

  server.registerTool(
    "ta_bort_vaning",
    {
      title: "Ta bort våning",
      description: `Tar bort en våning utan rum. Hemmet behåller alltid minst en våning.${idsHint}`,
      inputSchema: z.object({ vaning_id: z.string() }),
      annotations: removal,
    },
    ({ vaning_id }) =>
      runTool(userId, true, async (actor) => {
        await home.deleteFloor(actor, parseOr(floorId, vaning_id, FLOOR_MISSING));
        return FLOOR_REMOVED_TEXT;
      }),
  );

  server.registerTool(
    "lagg_till_rum",
    {
      title: "Lägg till rum",
      description: `Lägger till ett rum på en våning. Våning behövs när hemmet har flera.${idsHint}`,
      inputSchema: z.object({ namn: z.string(), vaning_id: z.string().optional() }),
      annotations: change,
    },
    ({ namn, vaning_id }) =>
      runTool(userId, true, async (actor) => {
        const created = await home.addRoom(actor, namn, vaning_id === undefined ? undefined : parseOr(floorId, vaning_id, FLOOR_MISSING));
        const floors = await home.listFloors(actor.householdId);
        return roomAddedText(created.name, floors.find((f) => f.id === created.floorId)!.name);
      }),
  );

  server.registerTool(
    "byt_namn_pa_rum",
    {
      title: "Byt namn på rum",
      description: `Byter namn på ett rum.${idsHint}`,
      inputSchema: z.object({ rum_id: z.string(), namn: z.string() }),
      annotations: change,
    },
    ({ rum_id, namn }) =>
      runTool(userId, true, async (actor) => {
        await home.renameRoom(actor, parseOr(roomId, rum_id, ROOM_MISSING), namn);
        return ROOM_RENAMED_TEXT;
      }),
  );

  server.registerTool(
    "ta_bort_rum",
    {
      title: "Ta bort rum",
      description: `Tar bort ett rum utan sysslor.${idsHint}`,
      inputSchema: z.object({ rum_id: z.string() }),
      annotations: removal,
    },
    ({ rum_id }) =>
      runTool(userId, true, async (actor) => {
        await home.deleteRoom(actor, parseOr(roomId, rum_id, ROOM_MISSING));
        return ROOM_REMOVED_TEXT;
      }),
  );
}
