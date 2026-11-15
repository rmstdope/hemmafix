import { beforeAll, beforeEach, describe, expect, it } from "vitest";
import { db } from "@/db";
import { appConnectionUse, appToken, household, membership, oauthClient, oauthRefreshToken, user } from "@/db/schema";

process.env.ALLOWED_EMAILS = "anna@example.com, bo@example.com";
process.env.BETTER_AUTH_SECRET = "integration-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";

const { listConnections, revokeConnection, resolveConnection, recordUse, onTokenIssued, hashToken } = await import("./connections");

const adult = (userId: string) => ({ userId, householdId: "h", role: "adult" as const });
const at = (iso: string) => new Date(iso);
const future = new Date(Date.now() + 86_400_000);

let n = 0;
async function client(name: string | null, icon: string | null = null) {
  const clientId = `c${++n}`;
  await db.insert(oauthClient).values({ id: clientId, clientId, name, icon, redirectUris: ["https://x.test/cb"] });
  return clientId;
}
/** One refresh token row of a family (a rotation inserts another row, the old one revoked). */
async function refresh(o: { userId: string; clientId: string; family: string; createdAt: string; revoked?: boolean; expiresAt?: Date }) {
  await db.insert(oauthRefreshToken).values({
    id: `r${++n}`,
    token: hashToken(`t${n}`),
    clientId: o.clientId,
    userId: o.userId,
    authorizationCodeId: o.family,
    scopes: ["openid"],
    createdAt: at(o.createdAt),
    revoked: o.revoked ? at(o.createdAt) : null,
    expiresAt: o.expiresAt ?? future,
  });
}

beforeAll(async () => {
  await db.delete(household);
});
beforeEach(async () => {
  await db.delete(user);
  await db.delete(appToken);
  await db.delete(oauthClient);
  await db.delete(household);
  const [h] = await db.insert(household).values({ name: "Hemma" }).returning({ id: household.id });
  await db.insert(user).values([
    { id: "anna", name: "Anna", email: "anna@example.com", emailVerified: true },
    { id: "bo", name: "Bo", email: "bo@example.com", emailVerified: true },
  ]);
  await db.insert(membership).values([
    { userId: "anna", householdId: h!.id, role: "adult" },
    { userId: "bo", householdId: h!.id, role: "child" },
  ]);
});

describe("listing connections", () => {
  it("lists only my live connections, newest first, the same app twice as two rows", async () => {
    const claude = await client("Claude", "https://claude.ai/icon.png");
    const other = await client("Annan app");
    await refresh({ userId: "anna", clientId: claude, family: "old", createdAt: "2026-10-01T10:00:00Z" });
    await refresh({ userId: "anna", clientId: claude, family: "new", createdAt: "2026-11-12T10:00:00Z" });
    await refresh({ userId: "bo", clientId: other, family: "bos", createdAt: "2026-11-13T10:00:00Z" });

    const list = await listConnections("anna");

    expect(list.map((c) => [c.id, c.appName, c.icon])).toEqual([
      ["new", "Claude", "https://claude.ai/icon.png"],
      ["old", "Claude", "https://claude.ai/icon.png"],
    ]);
    expect(await listConnections("bo")).toHaveLength(1);
  });

  it("dates a connection from its first token, not from the latest rotation", async () => {
    const c = await client("Claude");
    await refresh({ userId: "anna", clientId: c, family: "f", createdAt: "2026-10-01T10:00:00Z", revoked: true });
    await refresh({ userId: "anna", clientId: c, family: "f", createdAt: "2026-11-10T10:00:00Z" });

    const [conn] = await listConnections("anna");

    expect(conn!.connectedAt).toEqual(at("2026-10-01T10:00:00Z"));
  });

  it("leaves out expired and fully revoked connections", async () => {
    const c = await client("Claude");
    await refresh({ userId: "anna", clientId: c, family: "expired", createdAt: "2026-01-01T10:00:00Z", expiresAt: at("2026-02-01T00:00:00Z") });
    await refresh({ userId: "anna", clientId: c, family: "revoked", createdAt: "2026-01-01T10:00:00Z", revoked: true });
    expect(await listConnections("anna")).toEqual([]);
  });

  it("names an app without a name Okänd app, and reports when it was last used", async () => {
    const c = await client(null);
    await refresh({ userId: "anna", clientId: c, family: "f", createdAt: "2026-11-12T10:00:00Z" });
    await db.insert(appConnectionUse).values({ connectionId: "f", userId: "anna", lastUsedAt: at("2026-11-14T08:14:00Z") });

    const [conn] = await listConnections("anna");

    expect(conn!.appName).toBe("Okänd app");
    expect(conn!.lastUsedAt).toEqual(at("2026-11-14T08:14:00Z"));
  });
});

describe("revoking a connection", () => {
  it("removes the family, its tokens and its last use, and only that connection", async () => {
    const c = await client("Claude");
    await refresh({ userId: "anna", clientId: c, family: "f", createdAt: "2026-10-01T10:00:00Z", revoked: true });
    await refresh({ userId: "anna", clientId: c, family: "f", createdAt: "2026-11-10T10:00:00Z" });
    await refresh({ userId: "anna", clientId: c, family: "keep", createdAt: "2026-11-11T10:00:00Z" });
    await db.insert(appToken).values({ jti: "j1", connectionId: "f", expiresAt: future });
    await db.insert(appConnectionUse).values({ connectionId: "f", userId: "anna", lastUsedAt: new Date() });

    await revokeConnection(adult("anna"), "f");

    expect((await listConnections("anna")).map((x) => x.id)).toEqual(["keep"]);
    expect(await resolveConnection("anna", "j1")).toBeNull();
    expect(await db.select().from(appToken)).toEqual([]);
    expect(await db.select().from(appConnectionUse)).toEqual([]);
  });

  it("never touches somebody else's connection, and a gone one counts as done", async () => {
    const c = await client("Claude");
    await refresh({ userId: "bo", clientId: c, family: "bos", createdAt: "2026-11-10T10:00:00Z" });
    await revokeConnection(adult("anna"), "bos");
    await revokeConnection(adult("anna"), "nope");
    expect(await listConnections("bo")).toHaveLength(1);
  });

  it("rejects an id that is not a string", async () => {
    await expect(revokeConnection(adult("anna"), 42 as unknown as string)).rejects.toThrow();
  });

  it("is refused for a child", async () => {
    await expect(revokeConnection({ userId: "bo", householdId: "h", role: "child" }, "x")).rejects.toThrow("Det här får bara vuxna göra.");
  });
});

describe("telling whether a token still belongs to a live connection", () => {
  it("accepts a recorded token of a live connection and refuses unknown and revoked ones", async () => {
    const c = await client("Claude");
    await refresh({ userId: "anna", clientId: c, family: "f", createdAt: "2026-11-10T10:00:00Z" });
    await db.insert(appToken).values({ jti: "j1", connectionId: "f", expiresAt: future });

    expect(await resolveConnection("anna", "j1")).toBe("f");
    expect(await resolveConnection("anna", "unknown")).toBeNull();
    expect(await resolveConnection("bo", "j1")).toBeNull();
  });

  it("records the last use at most once a minute", async () => {
    await recordUse("anna", "f", at("2026-11-14T08:00:00Z"));
    await recordUse("anna", "f", at("2026-11-14T08:00:30Z"));
    expect((await db.select().from(appConnectionUse))[0]!.lastUsedAt).toEqual(at("2026-11-14T08:00:00Z"));
    await recordUse("anna", "f", at("2026-11-14T08:01:30Z"));
    expect((await db.select().from(appConnectionUse))[0]!.lastUsedAt).toEqual(at("2026-11-14T08:01:30Z"));
  });
});

describe("when the token endpoint issues tokens", () => {
  const jwt = (payload: object) => `h.${Buffer.from(JSON.stringify(payload)).toString("base64url")}.s`;

  it("records the access token against the connection of the refresh token it came with", async () => {
    const c = await client("Claude");
    await refresh({ userId: "anna", clientId: c, family: "f", createdAt: "2026-11-10T10:00:00Z" });
    const exp = Math.floor(Date.now() / 1000) + 3600;

    await onTokenIssued({ access_token: jwt({ jti: "j9", exp }), refresh_token: `t${n}` });
    // The provider stores a hash of the refresh token it hands out.

    expect(await resolveConnection("anna", "j9")).toBe("f");
  });

  it("ignores anything that is not a token response", async () => {
    await onTokenIssued({ error: "invalid_grant" });
    await onTokenIssued(null);
    await onTokenIssued({ access_token: "not-a-jwt", refresh_token: "t" });
    expect(await db.select().from(appToken)).toEqual([]);
  });
});
