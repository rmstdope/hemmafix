// Giving the calendar access, through Better Auth's own link and callback routes: what is asked of
// Google, what is kept, and what a later login leaves of it. Google is stubbed at `fetch`.
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { account, user } from "@/db/schema";
import { CALENDAR_LINK_REQUEST, CALENDAR_SCOPE } from "@/lib/calendar";

const SECRET = "integration-secret-not-for-production-0123456789";
process.env.ALLOWED_EMAILS = "anna@example.com";
process.env.BETTER_AUTH_SECRET = SECRET;
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID = "client";
process.env.GOOGLE_CLIENT_SECRET = "secret";

const { auth } = await import("./auth");
const { calendarNeedsAccess } = await import("./calendar");

const BASE = "http://localhost:3000/api/auth";
const anna = { userId: "anna", role: "adult" as const };
let cookie: string;

const part = (value: object) => Buffer.from(JSON.stringify(value)).toString("base64url");
const idToken = `${part({ alg: "RS256" })}.${part({ sub: "google-anna", email: "anna@example.com", email_verified: true, name: "Anna" })}.sig`;

beforeAll(async () => {
  await db.insert(user).values({ id: "anna", name: "Anna", email: "anna@example.com", emailVerified: true });
  // The account a first login leaves behind.
  await db
    .insert(account)
    .values({ id: "a", accountId: "google-anna", providerId: "google", userId: "anna", scope: "email,profile,openid" });
  const session = await (await auth.$context).internalAdapter.createSession("anna");
  const signature = createHmac("sha256", SECRET).update(session.token).digest("base64");
  cookie = `better-auth.session_token=${encodeURIComponent(`${session.token}.${signature}`)}`;
});

afterEach(() => vi.unstubAllGlobals());

const post = (path: string, body: object) =>
  auth.handler(
    new Request(`${BASE}${path}`, {
      method: "POST",
      headers: { cookie, origin: "http://localhost:3000", "content-type": "application/json" },
      body: JSON.stringify(body),
    }),
  );

/** Presses the button, and comes back from Google having granted `scope`. */
async function giveAccess(scope: string) {
  const started = await post("/link-social", CALENDAR_LINK_REQUEST);
  const { url } = (await started.json()) as { url: string };
  const google = new URL(url);
  vi.stubGlobal(
    "fetch",
    async () =>
      new Response(
        JSON.stringify({ access_token: "access", refresh_token: "the-refresh-token", expires_in: 3600, scope, id_token: idToken }),
        { headers: { "content-type": "application/json" } },
      ),
  );
  const jar = [cookie, ...started.headers.getSetCookie().map((c) => c.split(";")[0])].join("; ");
  const back = await auth.handler(
    new Request(`${BASE}/callback/google?code=code&state=${google.searchParams.get("state")}`, { headers: { cookie: jar } }),
  );
  return { google, back };
}
const stored = async () => (await db.select().from(account).where(eq(account.userId, "anna")))[0]!;

describe("giving access to the calendar", () => {
  it("asks Google for read access that lasts", async () => {
    const { google } = await giveAccess("openid");

    expect(google.origin + google.pathname).toBe("https://accounts.google.com/o/oauth2/v2/auth");
    expect(google.searchParams.get("scope")!.split(" ")).toContain(CALENDAR_SCOPE);
    expect(google.searchParams.get("access_type")).toBe("offline");
    expect(google.searchParams.get("prompt")).toBe("consent");
    expect(google.searchParams.get("include_granted_scopes")).toBe("true");
  });

  it("asks again when Google comes back without the calendar", async () => {
    const { back } = await giveAccess("openid");

    expect(back.headers.get("location")).toBe("/kalender");
    expect(await calendarNeedsAccess(anna)).toBe(true);
  });

  it("keeps the grant, with the refresh token encrypted", async () => {
    const { back } = await giveAccess(`openid ${CALENDAR_SCOPE}`);

    expect(back.headers.get("location")).toBe("/kalender");
    const row = await stored();
    expect(row.scope).toContain(CALENDAR_SCOPE);
    expect(row.refreshToken).toBeTruthy();
    expect(row.refreshToken).not.toContain("the-refresh-token");

    // And it is that token Google is asked with.
    let sent: string | null = null;
    vi.stubGlobal("fetch", async (_: unknown, init: RequestInit) => {
      sent = new URLSearchParams(String(init.body)).get("refresh_token");
      return new Response(JSON.stringify({ access_token: "b", expires_in: 3600 }));
    });
    expect(await calendarNeedsAccess(anna)).toBe(false);
    expect(sent).toBe("the-refresh-token");
  });
});

describe("the stored Google tokens", () => {
  it.each(["/get-access-token", "/refresh-token"])("are not handed to the browser by %s", async (path) => {
    const response = await post(path, { accountId: "a" });
    expect(response.status).toBe(404);
  });
});
