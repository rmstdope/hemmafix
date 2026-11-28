// Reading the family calendar: the grant kept on the person's Google account, and Google's answers.
// Google itself is stubbed at `fetch`.
import { eq } from "drizzle-orm";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { db } from "@/db";
import { account, user } from "@/db/schema";
import { CALENDAR_SCOPE } from "@/lib/calendar";

process.env.BETTER_AUTH_SECRET = "integration-secret-not-for-production-0123456789";
process.env.BETTER_AUTH_URL = "http://localhost:3000";
process.env.GOOGLE_CLIENT_ID = "client";
process.env.GOOGLE_CLIENT_SECRET = "secret";

const { calendarNeedsAccess, readCalendar } = await import("./calendar");

const FAMILY = "family0123@group.calendar.google.com";
const NOW = new Date("2026-11-28T11:00:00Z");
const anna = { userId: "anna", role: "adult" as const };
const bo = { userId: "bo", role: "child" as const };

type Answer = { status?: number; body: unknown };
type Request = { url: URL; token: string | null; form: URLSearchParams | null };

/** The stub Google: each test changes the part it is about. */
let google: {
  token: (r: Request) => Answer;
  calendars: (r: Request) => Answer;
  events: (r: Request) => Answer;
};
let requests: Request[];
const asked = (part: string) => requests.filter((r) => r.url.pathname.endsWith(part));

const event = (summary: string) => ({
  id: summary,
  summary,
  start: { dateTime: "2026-11-28T15:00:00+01:00" },
  end: { dateTime: "2026-11-28T16:00:00+01:00" },
});
const titles = (view: Awaited<ReturnType<typeof readCalendar>>) =>
  view.state === "ok" ? view.days.flatMap((d) => d.events.map((e) => e.title)) : view.state;

let grants = 0;
/** Gives the person a grant of their own, as linking the calendar does. */
async function grant(userId: string, scope = `openid,${CALENDAR_SCOPE}`) {
  const refreshToken = `refresh-${userId}-${++grants}`;
  await db.delete(account).where(eq(account.userId, userId));
  await db
    .insert(account)
    .values({ id: `account-${userId}`, accountId: `google-${userId}`, providerId: "google", userId, refreshToken, scope });
  return refreshToken;
}
const storedScope = async (userId: string) =>
  (await db.select({ scope: account.scope }).from(account).where(eq(account.userId, userId)))[0]?.scope;

beforeAll(async () => {
  await db.insert(user).values(
    ["anna", "bo"].map((id) => ({ id, name: id, email: `${id}@example.com`, emailVerified: true })),
  );
});

beforeEach(async () => {
  await db.delete(account);
  requests = [];
  google = {
    token: (r) => ({ body: { access_token: `access:${r.form!.get("refresh_token")}`, expires_in: 3600, scope: CALENDAR_SCOPE } }),
    calendars: () => ({ body: { items: [{ id: "anna@example.com" }, { id: FAMILY }] } }),
    events: () => ({ body: { items: [event("Kalas")] } }),
  };
  vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
    const url = new URL(input);
    const request: Request = {
      url,
      token: new Headers(init?.headers).get("authorization")?.replace("Bearer ", "") ?? null,
      form: init?.body ? new URLSearchParams(String(init.body)) : null,
    };
    requests.push(request);
    const route = url.pathname.endsWith("/token") ? "token" : url.pathname.endsWith("/events") ? "events" : "calendars";
    const { status = 200, body } = google[route](request);
    return new Response(JSON.stringify(body), { status, headers: { "content-type": "application/json" } });
  });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("without access", () => {
  it("asks for it, and never calls Google", async () => {
    expect(await readCalendar(anna, NOW)).toEqual({ state: "needs-access" });
    expect(await calendarNeedsAccess(anna)).toBe(true);
    expect(requests).toEqual([]);
  });

  it("asks for it when the Google account was only used to log in", async () => {
    await grant("anna", "openid,email");
    expect(await readCalendar(anna, NOW)).toEqual({ state: "needs-access" });
    expect(await calendarNeedsAccess(anna)).toBe(true);
  });

  it("is each person's own", async () => {
    await grant("anna");
    expect(await calendarNeedsAccess(anna)).toBe(false);
    expect(await readCalendar(bo, NOW)).toEqual({ state: "needs-access" });
  });
});

describe("reading", () => {
  it("lists the family calendar's events and no other calendar's, with the person's own token", async () => {
    const mine = await grant("bo");
    await grant("anna");

    expect(titles(await readCalendar(bo, NOW))).toEqual(["Kalas"]);

    const [events] = asked("/events");
    expect(decodeURIComponent(events!.url.pathname)).toContain(FAMILY);
    expect(asked("/events")).toHaveLength(1);
    expect(events!.token).toBe(`access:${mine}`);
    expect(Object.fromEntries(events!.url.searchParams)).toMatchObject({ singleEvents: "true" });
    expect(Date.parse(events!.url.searchParams.get("timeMin")!)).toBeLessThan(Date.parse("2026-11-27T23:00:00Z"));
    expect(Date.parse(events!.url.searchParams.get("timeMax")!)).toBeGreaterThanOrEqual(Date.parse("2026-12-12T23:00:00Z"));
    expect(asked("/token")[0]!.form!.get("client_id")).toBe("client");
  });

  it("finds a hidden family calendar, on a later page too", async () => {
    await grant("anna");
    google.calendars = (r) =>
      r.url.searchParams.get("pageToken") === "2"
        ? { body: { items: [{ id: FAMILY }] } }
        : { body: { items: [{ id: "anna@example.com" }], nextPageToken: "2" } };

    expect(titles(await readCalendar(anna, NOW))).toEqual(["Kalas"]);
    expect(asked("/calendarList")[0]!.url.searchParams.get("showHidden")).toBe("true");
  });

  it("reads every page of events, and skips cancelled ones", async () => {
    await grant("anna");
    google.events = (r) =>
      r.url.searchParams.get("pageToken") === "2"
        ? { body: { items: [event("Andra")] } }
        : { body: { items: [event("Första"), { id: "borta", status: "cancelled" }], nextPageToken: "2" } };

    expect(titles(await readCalendar(anna, NOW))).toEqual(["Andra", "Första"]);
  });

  it("says so when the account has no family calendar", async () => {
    await grant("anna");
    google.calendars = () => ({ body: { items: [{ id: "anna@example.com" }] } });

    expect(await readCalendar(anna, NOW)).toEqual({ state: "no-calendar" });
    expect(await calendarNeedsAccess(anna)).toBe(false);
  });
});

describe("when Google cannot be read", () => {
  const unreachable = async () => {
    expect(await readCalendar(anna, NOW)).toEqual({ state: "unreachable" });
    expect(await storedScope("anna")).toContain(CALENDAR_SCOPE);
  };

  it("keeps the access over a network failure", async () => {
    await grant("anna");
    vi.stubGlobal("fetch", async () => {
      throw new TypeError("fetch failed");
    });
    await unreachable();
    expect(await calendarNeedsAccess(anna)).toBe(false);
  });

  it.each([
    ["the token endpoint is down", "token", { status: 503, body: {} }],
    ["the app's credentials are refused", "token", { status: 401, body: { error: "invalid_client" } }],
    ["the calendar API fails", "events", { status: 500, body: {} }],
    ["the calendar API is not enabled", "calendars", { status: 403, body: { error: { errors: [{ reason: "accessNotConfigured" }] } } }],
    ["the answer makes no sense", "events", { body: { items: "?" } }],
  ] as const)("keeps the access when %s", async (_, part, answer) => {
    await grant("anna");
    google[part] = () => answer;
    await unreachable();
  });
});

describe("when the access is withdrawn in Google", () => {
  const withdrawn = async () => {
    expect(await readCalendar(anna, NOW)).toEqual({ state: "needs-access" });
    expect(await storedScope("anna")).toBe("openid");
    expect(await calendarNeedsAccess(anna)).toBe(true);
  };

  it("asks again once the refresh token is refused", async () => {
    await grant("anna");
    google.token = () => ({ status: 400, body: { error: "invalid_grant" } });
    await withdrawn();
  });

  it("asks again when a new token comes without the calendar", async () => {
    await grant("anna");
    google.token = () => ({ body: { access_token: "a", expires_in: 3600, scope: "openid" } });
    await withdrawn();
  });

  it.each([
    { error: { errors: [{ reason: "insufficientPermissions" }] } },
    { error: { details: [{ reason: "ACCESS_TOKEN_SCOPE_INSUFFICIENT" }] } },
  ])("asks again when the calendar refuses the token's scope", async (body) => {
    await grant("anna");
    google.calendars = () => ({ status: 403, body });
    await withdrawn();
  });

  it("notices it from the access check alone", async () => {
    await grant("anna");
    google.token = () => ({ status: 400, body: { error: "invalid_grant" } });
    expect(await calendarNeedsAccess(anna)).toBe(true);
    expect(await storedScope("anna")).toBe("openid");
  });

  it("does not undo an access given while the old one was being refused", async () => {
    await grant("anna");
    let renewed = false;
    google.token = () => ({ status: 400, body: { error: "invalid_grant" } });
    const answer = globalThis.fetch;
    vi.stubGlobal("fetch", async (input: string | URL, init?: RequestInit) => {
      if (!renewed) {
        renewed = true;
        await grant("anna");
      }
      return answer(input, init);
    });

    await readCalendar(anna, NOW);

    expect(await storedScope("anna")).toContain(CALENDAR_SCOPE);
  });
});

describe("access tokens", () => {
  it("are reused for five minutes and then asked for again", async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
    await grant("anna");

    await readCalendar(anna, NOW);
    vi.setSystemTime(new Date(NOW.getTime() + 4 * 60_000));
    await readCalendar(anna, NOW);
    expect(asked("/token")).toHaveLength(1);

    vi.setSystemTime(new Date(NOW.getTime() + 6 * 60_000));
    await readCalendar(anna, NOW);
    expect(asked("/token")).toHaveLength(2);
  });

  it("are asked for again after a new grant", async () => {
    await grant("anna");
    await readCalendar(anna, NOW);
    const second = await grant("anna");
    await readCalendar(anna, NOW);
    expect(asked("/events").at(-1)!.token).toBe(`access:${second}`);
  });

  it("are renewed once when Google no longer takes one", async () => {
    await grant("anna");
    let refused = 0;
    google.events = () => (refused++ === 0 ? { status: 401, body: {} } : { body: { items: [event("Kalas")] } });

    expect(titles(await readCalendar(anna, NOW))).toEqual(["Kalas"]);
    expect(asked("/token")).toHaveLength(2);
  });

  it("are not renewed for ever", async () => {
    await grant("anna");
    google.events = () => ({ status: 401, body: {} });

    expect(await readCalendar(anna, NOW)).toEqual({ state: "unreachable" });
    expect(asked("/events")).toHaveLength(2);
  });
});
