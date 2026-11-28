// The family calendar for one person, read with the access that person has given. The grant is
// their Google account row, which Better Auth writes when they give access: the calendar scope and
// a refresh token. Nothing about the events is stored.
import "server-only";
import { decryptOAuthToken } from "better-auth/oauth2";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { account } from "@/db/schema";
import { CALENDAR_DAYS, agenda, hasCalendarScope, withoutCalendarScope, type CalendarView } from "@/lib/calendar";
import { addDays, todayIso } from "@/lib/dates";
import { assertCan, type Role } from "@/lib/permissions";
import { auth } from "./auth";
import { AccessExpired, AccessWithdrawn, findFamilyCalendar, listEvents, refreshAccess } from "./google-calendar";

type Viewer = { userId: string; role: Role };
type Grant = { id: string; refreshToken: string; scope: string };

async function grantOf(userId: string): Promise<Grant | null> {
  const rows = await db
    .select({ id: account.id, refreshToken: account.refreshToken, scope: account.scope })
    .from(account)
    .where(and(eq(account.userId, userId), eq(account.providerId, "google")));
  for (const { id, refreshToken, scope } of rows) {
    if (refreshToken && scope && hasCalendarScope(scope)) return { id, refreshToken, scope };
  }
  return null;
}

/** Forgets that access was given, unless a new one has replaced the one Google refused. */
async function withdraw(grant: Grant) {
  await db
    .update(account)
    .set({ scope: withoutCalendarScope(grant.scope) })
    .where(and(eq(account.id, grant.id), eq(account.refreshToken, grant.refreshToken)));
}

/** How long an access token is used before a new one is asked for, which is also how late a
 * withdrawal in Google can be noticed. */
const REUSE_MS = 5 * 60_000;
const tokens = new Map<string, { refreshToken: string; accessToken: string; until: number }>();

async function accessTokenFor(grant: Grant): Promise<string> {
  const kept = tokens.get(grant.id);
  if (kept && kept.refreshToken === grant.refreshToken && Date.now() < kept.until) return kept.accessToken;
  let refreshToken: string;
  try {
    refreshToken = await decryptOAuthToken(grant.refreshToken, await auth.$context);
  } catch {
    // Written under another secret: unusable, and giving access again repairs it.
    throw new AccessWithdrawn("The stored refresh token cannot be read");
  }
  const { accessToken, expiresIn } = await refreshAccess(refreshToken);
  const until = Date.now() + Math.min(REUSE_MS, (expiresIn - 60) * 1000);
  tokens.set(grant.id, { refreshToken: grant.refreshToken, accessToken, until });
  return accessToken;
}

async function withToken<T>(grant: Grant, run: (accessToken: string) => Promise<T>): Promise<T> {
  try {
    return await run(await accessTokenFor(grant));
  } catch (error) {
    if (!(error instanceof AccessExpired)) throw error;
    tokens.delete(grant.id);
    return run(await accessTokenFor(grant));
  }
}

const logFailure = (error: unknown) =>
  console.error("could not read Google Calendar:", error instanceof Error ? error.message : error);

/**
 * Whether the person has to give access (again). True only when that is known: a Google that does
 * not answer is not a reason to ask.
 */
export async function calendarNeedsAccess(viewer: Viewer): Promise<boolean> {
  assertCan(viewer, "calendar:view");
  const grant = await grantOf(viewer.userId);
  if (!grant) return true;
  try {
    await accessTokenFor(grant);
  } catch (error) {
    if (error instanceof AccessWithdrawn) {
      await withdraw(grant);
      return true;
    }
    logFailure(error);
  }
  return false;
}

export async function readCalendar(viewer: Viewer, now = new Date()): Promise<CalendarView> {
  assertCan(viewer, "calendar:view");
  const grant = await grantOf(viewer.userId);
  if (!grant) return { state: "needs-access" };
  // A day more at each end than is shown, so no time zone cuts an event off; `agenda` picks the days.
  const today = todayIso(now);
  const from = `${addDays(today, -1)}T00:00:00Z`;
  const to = `${addDays(today, CALENDAR_DAYS + 2)}T00:00:00Z`;
  try {
    const events = await withToken(grant, async (token) => {
      const calendar = await findFamilyCalendar(token);
      return calendar ? listEvents(token, calendar, from, to) : null;
    });
    return events ? { state: "ok", days: agenda(events, now) } : { state: "no-calendar" };
  } catch (error) {
    if (error instanceof AccessWithdrawn) {
      await withdraw(grant);
      return { state: "needs-access" };
    }
    logFailure(error);
    return { state: "unreachable" };
  }
}
