// Every 401 from /mcp tells the client where to log in again (RFC 9728 `resource_metadata`), so
// an app whose connection was disconnected can take the person back through approval.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { household, user } from "@/db/schema";

process.env.ALLOWED_EMAILS = "anna@example.com";
process.env.BETTER_AUTH_SECRET = "integration-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { auth, MCP_RESOURCE } = await import("@/server/auth");
const { POST } = await import("./route");

const METADATA = `resource_metadata="http://localhost:3000/.well-known/oauth-protected-resource/mcp"`;

/** A correctly signed access token for the MCP resource, as the provider issues one. */
async function accessToken(claims: Record<string, unknown>) {
  const now = Math.floor(Date.now() / 1000);
  const { token } = await auth.api.signJWT({
    body: {
      payload: { iss: "http://localhost:3000/api/auth", aud: MCP_RESOURCE, azp: "claude", iat: now, exp: now + 3600, ...claims },
    },
  });
  return token;
}

const call = (token: string) =>
  POST(
    new Request(MCP_RESOURCE, {
      method: "POST",
      headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json, text/event-stream" },
      body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/list" }),
    }),
  );

beforeAll(async () => {
  await db.delete(household);
  await db.delete(user);
  await db.insert(user).values({ id: "anna", name: "Anna", email: "anna@example.com", emailVerified: true });
});

describe("a refused token", () => {
  it("answers a garbage token with a challenge naming the resource metadata", async () => {
    const res = await call("not-a-token");
    expect(res.status).toBe(401);
    expect(res.headers.get("www-authenticate")).toContain(METADATA);
  });

  it("answers a disconnected app's valid token with an invalid_token challenge naming the resource metadata", async () => {
    // No app_token row for this jti: exactly what a disconnect leaves behind.
    const res = await call(await accessToken({ sub: "anna", jti: "disconnected" }));
    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate");
    expect(challenge).toContain(`error="invalid_token"`);
    expect(challenge).toContain(METADATA);
    expect(await res.json()).toEqual({ jsonrpc: "2.0", error: { code: -32000, message: "the app was disconnected" }, id: null });
  });

  it("answers a valid token without a jti the same way", async () => {
    const res = await call(await accessToken({ sub: "anna" }));
    expect(res.status).toBe(401);
    const challenge = res.headers.get("www-authenticate");
    expect(challenge).toContain(`error="invalid_token"`);
    expect(challenge).toContain(METADATA);
  });
});
