// Claude connects over OAuth 2.1: discovery documents, dynamic client registration and the
// authorization endpoint, run through the same Better Auth instance the app serves.
import { beforeAll, describe, expect, it } from "vitest";
import { db } from "@/db";
import { household } from "@/db/schema";

process.env.ALLOWED_EMAILS = "anna@example.com";
process.env.BETTER_AUTH_SECRET = "integration-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { auth } = await import("./auth");
const get = (path: string) => auth.handler(new Request(`http://localhost:3000${path}`));

beforeAll(async () => {
  await db.delete(household);
});

describe("discovery", () => {
  it("publishes the authorization server metadata", async () => {
    const res = await get("/.well-known/oauth-authorization-server/api/auth");
    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.issuer).toBe("http://localhost:3000/api/auth");
    expect(meta.authorization_endpoint).toBe("http://localhost:3000/api/auth/oauth2/authorize");
    expect(meta.registration_endpoint).toBe("http://localhost:3000/api/auth/oauth2/register");
    expect(meta.code_challenge_methods_supported).toContain("S256");
  });

  it("publishes the protected resource metadata of the MCP server", async () => {
    const res = await get("/.well-known/oauth-protected-resource/mcp");
    expect(res.status).toBe(200);
    const meta = await res.json();
    expect(meta.resource).toBe("http://localhost:3000/mcp");
    expect(meta.authorization_servers).toEqual(["http://localhost:3000/api/auth"]);
  });
});

describe("registering a client", () => {
  it("lets Claude register itself without logging in", async () => {
    const res = await auth.handler(
      new Request("http://localhost:3000/api/auth/oauth2/register", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          client_name: "Claude",
          redirect_uris: ["https://claude.ai/api/mcp/auth_callback"],
          token_endpoint_auth_method: "none",
          grant_types: ["authorization_code", "refresh_token"],
          response_types: ["code"],
        }),
      }),
    );
    expect(res.status).toBe(201);
    const client = await res.json();
    expect(client.client_name).toBe("Claude");
    expect(client.client_id).toBeTruthy();
  });
});
