export const HOME_TIME_ZONE = "Europe/Stockholm";

const isoInHomeZone = new Intl.DateTimeFormat("sv-SE", {
  timeZone: HOME_TIME_ZONE,
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
});

/** Today's calendar date (YYYY-MM-DD) in the household's time zone. */
export function todayIso(now: Date = new Date()): string {
  return isoInHomeZone.format(now);
}

// Calendar arithmetic in UTC, so neither server nor browser time zone can shift a day.
function parse(iso: string) {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y!, m! - 1, d!));
}

/** Calendar arithmetic on YYYY-MM-DD dates. */
export function addDays(iso: string, days: number) {
  const date = parse(iso);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

const label = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short", timeZone: "UTC" });

/**
 * Human label for a YYYY-MM-DD due date relative to `today` (also YYYY-MM-DD).
 * `today` is computed once on the server and passed down, so server and
 * browser render the same text whatever the device's time zone.
 */
export function formatDue(
  dueDate: string | null,
  today: string,
): { label: string; overdue: boolean } | null {
  if (!dueDate) return null;
  if (dueDate === today) return { label: "Idag", overdue: false };
  if (dueDate === addDays(today, 1)) return { label: "Imorgon", overdue: false };
  if (dueDate === addDays(today, -1)) return { label: "Igår", overdue: true };
  return { label: label.format(parse(dueDate)), overdue: dueDate < today };
}

const weekdayLabel = new Intl.DateTimeFormat("sv-SE", {
  weekday: "long",
  day: "numeric",
  month: "short",
  timeZone: "UTC",
});
const timeInHomeZone = new Intl.DateTimeFormat("sv-SE", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: HOME_TIME_ZONE,
});

/** Heading for a day in the history: "Idag", "Igår" or "lördag 14 nov.". */
export function formatDay(day: string, today: string): string {
  if (day === today) return "Idag";
  if (day === addDays(today, -1)) return "Igår";
  const text = weekdayLabel.format(parse(day));
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** Clock time in the household's time zone, e.g. "07:45". */
export function formatTime(at: Date): string {
  return timeInHomeZone.format(at);
}

const connectedDate = new Intl.DateTimeFormat("sv-SE", {
  day: "numeric",
  month: "short",
  year: "numeric",
  timeZone: HOME_TIME_ZONE,
});

/** A date in the household's time zone, e.g. "12 nov 2026" (Intl writes "nov." with a dot). */
export function formatConnectedDate(at: Date): string {
  return connectedDate.format(at).replace(".", "");
}

/** When an app was last used: "i dag 08:14", "i går 19:02", a date, or "Inte använd ännu". */
export function formatLastUsed(at: Date | null, now: Date): string {
  if (!at) return "Inte använd ännu";
  const day = todayIso(at);
  const today = todayIso(now);
  if (day === today) return `i dag ${formatTime(at)}`;
  if (day === addDays(today, -1)) return `i går ${formatTime(at)}`;
  return formatConnectedDate(at);
}

const tabWeekday = new Intl.DateTimeFormat("sv-SE", { weekday: "long", timeZone: "UTC" });
const tabDayLong = new Intl.DateTimeFormat("sv-SE", { weekday: "long", day: "numeric", month: "long", timeZone: "UTC" });
const capitalised = (s: string) => s.charAt(0).toUpperCase() + s.slice(1);

/** A day as a tab names it: "Ons 25", "Tor 26" (Intl's own short form of torsdag is "tors"). */
export function formatTabDay(day: string): string {
  const date = parse(day);
  return `${capitalised(tabWeekday.format(date).slice(0, 3))} ${date.getUTCDate()}`;
}

/** The same day read aloud: "Onsdag 25 november". */
export function formatTabDayLong(day: string): string {
  return capitalised(tabDayLong.format(parse(day)));
}
