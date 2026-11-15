import "server-only";
import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import { todayIso } from "@/lib/dates";
import { ACCESS_REMOVED_TEXT, CHILD_TEXT, formatOpenTasks } from "@/lib/mcp-texts";
import { listMembers, listOpenInstances } from "./chores";
import { resolveMcpMember } from "./mcp-access";
import { registerTaskTools } from "./mcp-tasks";

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

  registerTaskTools(server, userId);

  return server;
}

/** Serves one MCP request for the person the (already verified) access token belongs to. */
export function handleMcpRequest(request: Request, userId: string): Promise<Response> {
  return createMcpHandler(() => createHemmafixMcpServer(userId)).fetch(request);
}
