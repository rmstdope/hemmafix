// The Kalender part: what Google's events look like on the page, and the access that reading
// them takes. Pure: the server reads Google (src/server/calendar.ts) and the browser only shows.
import { addDays, formatTime, todayIso } from "./dates";

/** Read only: Hemmafix never asks for more. */
export const CALENDAR_SCOPE = "https://www.googleapis.com/auth/calendar.readonly";

/** How many days after today Kalender shows. */
export const CALENDAR_DAYS = 14;

/** What asking a family member for access sends to Better Auth, which sends them on to Google. */
export const CALENDAR_LINK_REQUEST = {
  provider: "google" as const,
  scopes: [CALENDAR_SCOPE],
  callbackURL: "/kalender",
  errorCallbackURL: "/kalender",
  // A refresh token, so the calendar can be read later: Google gives one only when asked this way.
  additionalParams: { access_type: "offline", prompt: "consent" },
};

const scopesOf = (stored: string | null | undefined) => (stored ?? "").split(/[\s,]+/).filter(Boolean);

export function hasCalendarScope(stored: string | null | undefined): boolean {
  return scopesOf(stored).includes(CALENDAR_SCOPE);
}

/** The stored scopes (comma separated, as Better Auth keeps them) without the calendar's. */
export function withoutCalendarScope(stored: string | null | undefined): string {
  return scopesOf(stored)
    .filter((s) => s !== CALENDAR_SCOPE)
    .join(",");
}

/** The calendar a Google family group shares has an id of its own form. */
export function isFamilyCalendarId(id: string): boolean {
  return id.startsWith("family") && id.endsWith("@group.calendar.google.com");
}

/** A timed event has `dateTime`; an all-day one `date`, whose end is the day after its last. */
export type CalendarEventTime = { dateTime: string } | { date: string };

export type CalendarEvent = {
  id: string;
  title: string | null;
  location: string | null;
  start: CalendarEventTime;
  end: CalendarEventTime;
};

export type CalendarCard = { id: string; title: string; line: string; ended: boolean };

/** `lead` is the part set strong: "Idag", "Imorgon" or the whole date. */
export type CalendarDay = { day: string; heading: { lead: string; rest: string | null }; events: CalendarCard[] };

export type CalendarView =
  | { state: "needs-access" }
  | { state: "no-calendar" }
  | { state: "unreachable" }
  | { state: "ok"; days: CalendarDay[] };

const longDate = new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });

function heading(day: string, today: string): CalendarDay["heading"] {
  const year = day.slice(0, 4);
  const text = longDate.format(new Date(`${day}T00:00:00Z`)) + (year === today.slice(0, 4) ? "" : ` ${year}`);
  if (day === today) return { lead: "Idag", rest: text };
  if (day === addDays(today, 1)) return { lead: "Imorgon", rest: text };
  return { lead: text.charAt(0).toUpperCase() + text.slice(1), rest: null };
}

const dayNumber = (day: string) => Date.parse(`${day}T00:00:00Z`) / 86_400_000;
const oneLine = (text: string | null) => text?.replace(/\s+/g, " ").trim() ?? "";

/** An event placed in time: its first and last day, and what orders it within a day. */
function placed(event: CalendarEvent) {
  if ("date" in event.start) {
    const first = event.start.date;
    const end = "date" in event.end ? addDays(event.end.date, -1) : first;
    return { first, last: end < first ? first : end, allDay: true, startsAt: Date.parse(first), endsAt: null, time: "Heldag" };
  }
  const start = new Date(event.start.dateTime);
  const end = new Date("dateTime" in event.end ? event.end.dateTime : event.start.dateTime);
  const first = todayIso(start);
  // The last moment it covers: one that ends at midnight does not reach the next day.
  const last = todayIso(new Date(Math.max(start.getTime(), end.getTime() - 1)));
  return {
    first,
    last,
    allDay: false,
    startsAt: start.getTime(),
    endsAt: end.getTime(),
    time: `${formatTime(start)}–${formatTime(end)}`,
  };
}

const byTitle = new Intl.Collator("sv-SE");

/**
 * Today and the following days, each with the events that cover it. Days without events are left
 * out. All-day events lead their day; the rest go by when they started.
 */
export function agenda(events: CalendarEvent[], now: Date): CalendarDay[] {
  const today = todayIso(now);
  const final = addDays(today, CALENDAR_DAYS);
  const all = events
    .map((event) => ({ event, title: oneLine(event.title) || "(Ingen titel)", ...placed(event) }))
    .sort(
      (a, b) => Number(b.allDay) - Number(a.allDay) || a.startsAt - b.startsAt || byTitle.compare(a.title, b.title),
    );

  const days: CalendarDay[] = [];
  for (let day = today; day <= final; day = addDays(day, 1)) {
    const cards = all
      .filter((e) => e.first <= day && day <= e.last)
      .map((e): CalendarCard => {
        const length = dayNumber(e.last) - dayNumber(e.first) + 1;
        const nth = dayNumber(day) - dayNumber(e.first) + 1;
        const line = [e.time, length > 1 ? `dag ${nth} av ${length}` : "", oneLine(e.event.location)];
        return {
          id: e.event.id,
          title: e.title,
          line: line.filter(Boolean).join(" · "),
          ended: day === today && e.endsAt !== null && e.endsAt <= now.getTime(),
        };
      });
    if (cards.length > 0) days.push({ day, heading: heading(day, today), events: cards });
  }
  return days;
}
