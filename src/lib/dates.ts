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

function addDays(iso: string, days: number) {
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
