import "server-only";
import type { McpServer } from "@modelcontextprotocol/server";
import { z } from "zod";
import { UserError } from "@/lib/errors";
import {
  formatRoutines,
  ROUTINE_TASK_REMOVED_TEXT,
  routineAddedToRoomText,
  routineCreatedText,
  routineRemovedText,
  routineRenamedText,
  routineTaskAddedText,
  routineTaskRenamedText,
} from "@/lib/mcp-texts";
import { RECURRENCE_UNITS } from "@/lib/recurrence";
import { ROUTINE_GONE } from "@/lib/routine-texts";
import { routineName, routineTaskTitle } from "@/lib/validation";
import { listRooms } from "./household";
import { runTool } from "./mcp-home";
import * as routines from "./routines";

// Loose schemas on purpose (as in the other tool files): ids and values are checked by
// src/server/routines.ts once the member is known, so mistakes are answered in Swedish.
const routineId = z.string().describe("Rutinens id från visa_rutiner");
const taskId = z.string().describe("Uppgiftens id från visa_rutiner");
const change = { readOnlyHint: false, destructiveHint: false, idempotentHint: false } as const;
const removal = { readOnlyHint: false, destructiveHint: true, idempotentHint: true } as const;

/** The tools for routines: named sets of tasks that are added to a room together. */
export function registerRoutineTools(server: McpServer, userId: string): void {
  server.registerTool(
    "visa_rutiner",
    {
      title: "Visa rutiner",
      description: "Visar hemmets rutiner (uppgifter som brukar göras tillsammans) med deras uppgifter och id. Bara för vuxna.",
      annotations: { readOnlyHint: true },
    },
    () =>
      runTool(userId, false, async (actor) => {
        // Task ids are needed to change or remove a task, so read each routine with them.
        const full = await Promise.all((await routines.listRoutines(actor)).map((r) => routines.getRoutine(actor, r.id)));
        return formatRoutines(full.filter((r) => r !== null));
      }),
  );

  server.registerTool(
    "skapa_rutin",
    {
      title: "Skapa rutin",
      description: "Skapar en tom rutin. Lägg sedan till uppgifter med lagg_till_uppgift_i_rutin.",
      inputSchema: z.object({ namn: z.string() }),
      annotations: change,
    },
    ({ namn }) =>
      runTool(userId, true, async (actor) => {
        const { id } = await routines.createRoutine(actor, namn);
        return routineCreatedText(routineName.parse(namn), id);
      }),
  );

  server.registerTool(
    "byt_namn_pa_rutin",
    {
      title: "Byt namn på rutin",
      description: "Byter namn på en rutin. Ta id från visa_rutiner.",
      inputSchema: z.object({ routineId, namn: z.string() }),
      annotations: change,
    },
    ({ routineId: id, namn }) =>
      runTool(userId, true, async (actor) => {
        await routines.renameRoutine(actor, id, namn);
        return routineRenamedText(routineName.parse(namn));
      }),
  );

  server.registerTool(
    "ta_bort_rutin",
    {
      title: "Ta bort rutin",
      description:
        "Tar bort en rutin och dess uppgifter. Uppgifter som redan lagts till i hemmet finns kvar. Ta id från visa_rutiner.",
      inputSchema: z.object({ routineId }),
      annotations: removal,
    },
    ({ routineId: id }) =>
      runTool(userId, true, async (actor) => {
        const found = await routines.getRoutine(actor, id);
        if (!found) throw new UserError(ROUTINE_GONE);
        await routines.deleteRoutine(actor, id);
        return routineRemovedText(found.name);
      }),
  );

  server.registerTool(
    "lagg_till_uppgift_i_rutin",
    {
      title: "Lägg till uppgift i rutin",
      description: "Lägger till en uppgift sist i en rutin. Ta id från visa_rutiner.",
      inputSchema: z.object({ routineId, titel: z.string() }),
      annotations: change,
    },
    ({ routineId: id, titel }) =>
      runTool(userId, true, async (actor) => {
        const created = await routines.addRoutineTask(actor, id, titel);
        return routineTaskAddedText(routineTaskTitle.parse(titel), created.id);
      }),
  );

  server.registerTool(
    "byt_namn_pa_uppgift_i_rutin",
    {
      title: "Ändra uppgift i rutin",
      description: "Byter text på en uppgift i en rutin. Ta id från visa_rutiner.",
      inputSchema: z.object({ routineId, taskId, titel: z.string() }),
      annotations: change,
    },
    ({ routineId: id, taskId: task, titel }) =>
      runTool(userId, true, async (actor) => {
        await routines.updateRoutineTask(actor, id, task, titel);
        return routineTaskRenamedText(routineTaskTitle.parse(titel));
      }),
  );

  server.registerTool(
    "ta_bort_uppgift_ur_rutin",
    {
      title: "Ta bort uppgift ur rutin",
      description: "Tar bort en uppgift ur en rutin. Ta id från visa_rutiner.",
      inputSchema: z.object({ routineId, taskId }),
      annotations: removal,
    },
    ({ routineId: id, taskId: task }) =>
      runTool(userId, true, async (actor) => {
        const found = await routines.getRoutine(actor, id);
        if (!found?.tasks.some((t) => t.id === task)) throw new UserError("Uppgiften finns inte längre.");
        await routines.removeRoutineTask(actor, id, task);
        return ROUTINE_TASK_REMOVED_TEXT;
      }),
  );

  server.registerTool(
    "lagg_till_rutin_i_hemmet",
    {
      title: "Lägg till rutin i hemmet",
      description: `Lägger till alla uppgifter i en rutin i ett rum, som vanliga uppgifter med samma hur-ofta, datum och person. Rutinen ändras inte. Ta rutinens id från visa_rutiner och rummets och personens id från lista_vaningar_och_rum och lista_familjen.`,
      inputSchema: z.object({
        routineId,
        roomId: z.string().describe("Rummets id"),
        kind: z.string().optional().describe("recurring (kommer tillbaka, standard) eller once (görs en gång)"),
        interval: z.number().optional().describe("Hur ofta, i antal enheter (bara för recurring)"),
        unit: z.string().optional().describe(`${RECURRENCE_UNITS.join(", ")} (bara för recurring)`),
        startDate: z.string().optional().describe("Första datum, ÅÅÅÅ-MM-DD (recurring; annars idag)"),
        dueDate: z.string().optional().describe("Förfallodatum, ÅÅÅÅ-MM-DD (once)"),
        assigneeId: z.string().optional().describe("Vem uppgifterna tilldelas (utelämna för ingen)"),
      }),
      annotations: change,
    },
    (args) =>
      runTool(userId, true, async (actor) => {
        if (!z.uuid().safeParse(args.roomId).success) {
          throw new UserError("Ogiltigt rum-id. Hämta id:n med lista_vaningar_och_rum.");
        }
        const found = await routines.getRoutine(actor, args.routineId);
        if (found && found.tasks.length === 0) throw new UserError("Rutinen har inga uppgifter ännu.");
        const { count } = await routines.addRoutineToHome(actor, args);
        const room = (await listRooms(actor.householdId)).find((r) => r.id === args.roomId);
        return routineAddedToRoomText(count, room?.name ?? "rummet");
      }),
  );
}
