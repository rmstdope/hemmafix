/** The folded groups as stored: a JSON list of group keys. Anything unreadable means nothing is folded. */
export function parseFolded(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value.filter((v): v is string => typeof v === "string") : [];
  } catch {
    return [];
  }
}

const isDay = (key: string) => /^\d{4}-\d{2}-\d{2}$/.test(key);

/** Folds an open group or opens a folded one; days already past are forgotten so the list stays short. */
export function toggleFolded(folded: string[], key: string, today: string): string[] {
  const kept = folded.filter((k) => !(isDay(k) && k < today));
  return kept.includes(key) ? kept.filter((k) => k !== key) : [...kept, key];
}
