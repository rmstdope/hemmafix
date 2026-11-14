const fmt = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "short" });

function todayIso(now: Date) {
  // Local calendar date in YYYY-MM-DD.
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function addDays(iso: string, days: number) {
  const [y, m, d] = iso.split("-").map(Number);
  return todayIso(new Date(y!, m! - 1, d! + days));
}

/** Human label for a YYYY-MM-DD due date, relative to `now`. */
export function formatDue(
  dueDate: string | null,
  now: Date = new Date(),
): { label: string; overdue: boolean } | null {
  if (!dueDate) return null;
  const today = todayIso(now);
  if (dueDate === today) return { label: "Idag", overdue: false };
  if (dueDate === addDays(today, 1)) return { label: "Imorgon", overdue: false };
  if (dueDate === addDays(today, -1)) return { label: "Igår", overdue: true };
  const [y, m, d] = dueDate.split("-").map(Number);
  return { label: fmt.format(new Date(y!, m! - 1, d!)), overdue: dueDate < today };
}
