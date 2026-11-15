import { requireMcpAuth } from "@better-auth/mcp";
import { auth, MCP_RESOURCE } from "@/server/auth";
import { handleMcpRequest } from "@/server/mcp";

// POST only: the access token (checked here for signature, issuer, audience and expiry) names
// the person; what that person may do is decided per call in src/server/mcp.ts.
export const POST = requireMcpAuth(
  auth,
  (request, claims) => {
    if (!claims.sub) return Response.json({ error: "invalid_token" }, { status: 401 });
    return handleMcpRequest(request, claims.sub);
  },
  { resource: MCP_RESOURCE },
);
