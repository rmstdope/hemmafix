// The calls to Google that reading the family calendar takes. No database: the grant is
// calendar.ts's. Every answer is checked before it is used.
import "server-only";
import { z } from "zod";
import { hasCalendarScope, isFamilyCalendarId, type CalendarEvent } from "@/lib/calendar";

/** Google no longer lets this grant read the calendar; the person has to give access again. */
export class AccessWithdrawn extends Error {}
/** Google did not take the access token; a new one may do. */
export class AccessExpired extends Error {}

const TIMEOUT_MS = 10_000;
/** More pages than any family fills in two weeks; it stops a Google that never says "last page". */
const MAX_PAGES = 20;

// `GOOGLE_API_ORIGIN` is for the end-to-end tests' stand-in for Google; it is unset everywhere else.
const tokenUrl = () => {
  const origin = process.env.GOOGLE_API_ORIGIN;
  return origin ? `${origin}/token` : "https://oauth2.googleapis.com/token";
};
const calendarUrl = () => `${process.env.GOOGLE_API_ORIGIN || "https://www.googleapis.com"}/calendar/v3`;

const request = (url: string, init: RequestInit) =>
  fetch(url, { ...init, cache: "no-store", redirect: "error", signal: AbortSignal.timeout(TIMEOUT_MS) });

const tokenAnswer = z.object({ access_token: z.string().min(1), expires_in: z.number(), scope: z.string().optional() });

export async function refreshAccess(refreshToken: string): Promise<{ accessToken: string; expiresIn: number }> {
  const response = await request(tokenUrl(), {
    method: "POST",
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: process.env.GOOGLE_CLIENT_ID ?? "",
      client_secret: process.env.GOOGLE_CLIENT_SECRET ?? "",
    }),
  });
  if (!response.ok) {
    const body: unknown = await response.json().catch(() => null);
    // The one refusal that is about this person's grant; the others are about the app or Google.
    const refused = z.object({ error: z.literal("invalid_grant") }).safeParse(body).success;
    if (refused) throw new AccessWithdrawn("Google refused the refresh token");
    throw new Error(`Google's token endpoint answered ${response.status}`);
  }
  const answer = tokenAnswer.parse(await response.json());
  if (answer.scope !== undefined && !hasCalendarScope(answer.scope)) {
    throw new AccessWithdrawn("The new token does not cover the calendar");
  }
  return { accessToken: answer.access_token, expiresIn: answer.expires_in };
}

const SCOPE_REFUSALS = new Set(["insufficientPermissions", "ACCESS_TOKEN_SCOPE_INSUFFICIENT"]);
const reasons = z.array(z.object({ reason: z.string().optional() })).optional();
const errorAnswer = z.object({ error: z.object({ errors: reasons, details: reasons }) });

async function get(accessToken: string, path: string, query: Record<string, string>): Promise<unknown> {
  const response = await request(`${calendarUrl()}${path}?${new URLSearchParams(query)}`, {
    headers: { authorization: `Bearer ${accessToken}` },
  });
  if (response.ok) return response.json();
  if (response.status === 401) throw new AccessExpired("Google did not take the access token");
  if (response.status === 403) {
    const body = errorAnswer.safeParse(await response.json().catch(() => null));
    const given = body.success ? [...(body.data.error.errors ?? []), ...(body.data.error.details ?? [])] : [];
    if (given.some((e) => e.reason && SCOPE_REFUSALS.has(e.reason))) {
      throw new AccessWithdrawn("The token does not cover the calendar");
    }
  }
  throw new Error(`Google Calendar answered ${response.status}`);
}

async function pages<T>(
  accessToken: string,
  path: string,
  query: Record<string, string>,
  item: z.ZodType<T>,
): Promise<T[]> {
  const page = z.object({ items: z.array(item).default([]), nextPageToken: z.string().optional() });
  const all: T[] = [];
  let pageToken: string | undefined;
  for (let i = 0; i < MAX_PAGES; i++) {
    const answer = page.parse(await get(accessToken, path, pageToken ? { ...query, pageToken } : query));
    all.push(...answer.items);
    pageToken = answer.nextPageToken;
    if (!pageToken) return all;
  }
  throw new Error(`Google Calendar gave more than ${MAX_PAGES} pages`);
}

/** The id of the calendar the person's Google family group shares, or null when they have none. */
export async function findFamilyCalendar(accessToken: string): Promise<string | null> {
  const calendars = await pages(
    accessToken,
    "/users/me/calendarList",
    // The family calendar counts also when the person has hidden it in Google.
    { maxResults: "250", showHidden: "true" },
    z.object({ id: z.string() }),
  );
  return calendars.find((c) => isFamilyCalendarId(c.id))?.id ?? null;
}

const eventTime = z.union([
  z.object({ dateTime: z.iso.datetime({ offset: true }) }),
  z.object({ date: z.iso.date() }),
]);
const eventAnswer = z.object({
  id: z.string(),
  status: z.string().optional(),
  summary: z.string().optional(),
  location: z.string().optional(),
  // A cancelled event may come without its times.
  start: eventTime.optional(),
  end: eventTime.optional(),
});

/** The calendar's events between `from` and `to`, each repetition on its own. */
export async function listEvents(
  accessToken: string,
  calendarId: string,
  from: string,
  to: string,
): Promise<CalendarEvent[]> {
  const events = await pages(
    accessToken,
    `/calendars/${encodeURIComponent(calendarId)}/events`,
    { singleEvents: "true", orderBy: "startTime", maxResults: "2500", timeMin: from, timeMax: to },
    eventAnswer,
  );
  return events.flatMap(({ id, status, summary, location, start, end }) =>
    status !== "cancelled" && start && end
      ? [{ id, title: summary ?? null, location: location ?? null, start, end }]
      : [],
  );
}
