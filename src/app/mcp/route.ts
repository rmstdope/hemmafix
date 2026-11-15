import { requireMcpAuth } from "@better-auth/mcp";
import { auth, MCP_RESOURCE } from "@/server/auth";
import { recordUse, resolveConnection } from "@/server/connections";
import { handleMcpRequest } from "@/server/mcp";

// POST only: the access token (checked here for signature, issuer, audience and expiry) names
// the person; what that person may do is decided per call in src/server/mcp.ts.
export const POST = requireMcpAuth(
  auth,
  async (request, claims) => {
    if (!claims.sub || typeof claims.jti !== "string") return Response.json({ error: "invalid_token" }, { status: 401 });
    // A token is only as good as its connection: disconnecting an app refuses its tokens at once.
    const connectionId = await resolveConnection(claims.sub, claims.jti);
    if (!connectionId) return Response.json({ error: "invalid_token" }, { status: 401 });
    await recordUse(claims.sub, connectionId, new Date());
    return handleMcpRequest(request, claims.sub);
  },
  { resource: MCP_RESOURCE },
);
