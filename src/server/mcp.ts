import "server-only";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { todayIso } from "@/lib/dates";
import { z } from "zod";
import { UserError } from "@/lib/errors";
import {
  ACCESS_REMOVED_TEXT,
  alreadyRoleText,
  ambiguousMemberText,
  CHILD_TEXT,
  findMemberByName,
  firstName,
  formatOpenTasks,
  noSuchMemberText,
  roleChangedText,
} from "@/lib/mcp-texts";
import type { Role } from "@/lib/permissions";
import { listMembers, listOpenInstances, notifyHouseholdChanged } from "./chores";
import { setMemberRole } from "./household";
import { resolveMcpMember } from "./mcp-access";

const text = (message: string, isError = false) => ({ content: [{ type: "text" as const, text: message }], isError });

const DENIED_TEXT = { removed: ACCESS_REMOVED_TEXT, child: CHILD_TEXT } as const;

/** The MCP server for one connected person; every tool re-checks who that is when it runs. */
export function createHemmafixMcpServer(userId: string): McpServer {
  const server = new McpServer({ name: "hemmafix", version: "1.0.0" });

  server.registerTool(
    "lista_oppna_sysslor",
    { title: "Vad är kvar att göra", description: "Visar vad som är kvar att göra i hemmet: de öppna sysslorna." },
    async () => {
      const access = await resolveMcpMember(userId);
      if ("denied" in access) return text(DENIED_TEXT[access.denied], true);
      const [open, members] = await Promise.all([
        listOpenInstances(access.actor, {}),
        listMembers(access.actor.householdId),
      ]);
      const names = new Map(members.map((m) => [m.id, m.name]));
      return text(
        formatOpenTasks(
          open.map((i) => ({
            title: i.title,
            roomName: i.roomName,
            assigneeName: i.assigneeId ? (names.get(i.assigneeId) ?? null) : null,
            dueDate: i.dueDate,
          })),
          todayIso(),
        ),
      );
    },
  );

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
