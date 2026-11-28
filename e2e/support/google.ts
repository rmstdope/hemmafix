// A stand-in for Google's token endpoint and Calendar API. The app under test is pointed at it
// with GOOGLE_API_ORIGIN (playwright.config.ts); it listens on the port after the worker's server,
// which is free while a test uses it.
import { createServer } from "node:http";
import { addDays, HOME_TIME_ZONE, todayIso } from "../../src/lib/dates";
import { E2E_PORT } from "./env";

export const FAMILY_CALENDAR = "family0123456789@group.calendar.google.com";

type Time = { date: string } | { dateTime: string };
export type GoogleEvent = { id: string; summary?: string; location?: string; start: Time; end: Time };

const offset = new Intl.DateTimeFormat("en-US", { timeZone: HOME_TIME_ZONE, timeZoneName: "longOffset" });
/** `time` (hh:mm) on the day `days` from today, in the home's time zone. */
function at(days: number, time: string) {
  const day = addDays(todayIso(), days);
  const zone = offset.formatToParts(new Date(`${day}T12:00:00Z`)).find((p) => p.type === "timeZoneName")!.value;
  return { dateTime: `${day}T${time}:00${zone.replace("GMT", "") || "+00:00"}` };
}

let made = 0;
export function timed(summary: string | undefined, days: number, from: string, to: string, location?: string): GoogleEvent {
  return { id: `event-${++made}`, summary, location, start: at(days, from), end: at(days, to) };
}
/** An all-day event from `days` from today, `length` days long. */
export function allDay(summary: string, days: number, length = 1, location?: string): GoogleEvent {
  const today = todayIso();
  return {
    id: `event-${++made}`,
    summary,
    location,
    start: { date: addDays(today, days) },
    end: { date: addDays(today, days + length) },
  };
}

/** Starts the stand-in. Change its properties to change what Google holds or how it answers. */
export async function startGoogle(events: GoogleEvent[] = []) {
  const google = {
    events,
    hasFamilyCalendar: true,
    /** Answers every request with a server error. */
    down: false,
    /** The person has withdrawn Hemmafix's access. */
    withdrawn: false,
    close: () =>
      new Promise<void>((resolve) => {
        server.closeAllConnections();
        server.close(() => resolve());
      }),
  };
  const server = createServer((request, response) => {
    const { pathname } = new URL(request.url!, "http://google");
    const answer = (status: number, body: unknown) => {
      response.writeHead(status, { "content-type": "application/json" });
      response.end(JSON.stringify(body));
    };
    request.resume();
    if (google.down) return answer(503, {});
    if (pathname === "/token") {
      return google.withdrawn
        ? answer(400, { error: "invalid_grant" })
        : answer(200, { access_token: "e2e-access", expires_in: 3600 });
    }
    if (google.withdrawn) return answer(401, {});
    if (pathname === "/calendar/v3/users/me/calendarList") {
      const mine = { id: "someone@e2e.test" };
      return answer(200, { items: google.hasFamilyCalendar ? [mine, { id: FAMILY_CALENDAR }] : [mine] });
    }
    if (pathname === `/calendar/v3/calendars/${encodeURIComponent(FAMILY_CALENDAR)}/events`) {
      return answer(200, { items: google.events });
    }
    return answer(404, {});
  });
  await new Promise<void>((resolve, reject) => server.once("error", reject).listen(E2E_PORT + 1, resolve));
  return google;
}
