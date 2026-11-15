import { createResourceServerChallenge } from "@better-auth/oauth-provider";
import { requireMcpAuth } from "@better-auth/mcp";
import { APIError } from "better-auth/api";
import { auth, MCP_RESOURCE } from "@/server/auth";
import { recordUse, resolveConnection } from "@/server/connections";
import { handleMcpRequest } from "@/server/mcp";

/**
 * A 401 for a token that verified but is no longer honoured, shaped like requireMcpAuth's own:
 * the `WWW-Authenticate` challenge names the resource metadata, so the app can send the person
 * back through login and approval.
 */
function invalidToken(request: Request, description: string): Response {
  const error = new APIError("UNAUTHORIZED", { error: "invalid_token", error_description: description });
  const challenge = createResourceServerChallenge(error, MCP_RESOURCE, { request });
  if (!challenge) throw error;
  const headers = new Headers(challenge.headers);
  headers.set("Content-Type", "application/json");
  return new Response(JSON.stringify({ jsonrpc: "2.0", error: { code: -32000, message: challenge.message }, id: null }), {
    status: challenge.statusCode,
    headers,
  });
}

// POST only: the access token (checked here for signature, issuer, audience and expiry) names
// the person; what that person may do is decided per call in src/server/mcp.ts.
export const POST = requireMcpAuth(
  auth,
  async (request, claims) => {
    if (!claims.sub || typeof claims.jti !== "string") return invalidToken(request, "token lacks a subject or id");
    // A token is only as good as its connection: disconnecting an app refuses its tokens at once.
    const connectionId = await resolveConnection(claims.sub, claims.jti);
    if (!connectionId) return invalidToken(request, "the app was disconnected");
    await recordUse(claims.sub, connectionId, new Date());
    return handleMcpRequest(request, claims.sub);
  },
  { resource: MCP_RESOURCE },
);
