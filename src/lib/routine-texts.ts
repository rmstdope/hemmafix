/** "Inga uppgifter", "1 uppgift", "5 uppgifter": how many tasks a routine holds. */
export function taskCountLabel(count: number): string {
  if (count === 0) return "Inga uppgifter";
  return count === 1 ? "1 uppgift" : `${count} uppgifter`;
}

/** The notice for any save that failed in a way the person cannot fix. */
export const SAVE_FAILED = "Det gick inte att spara. Försök igen.";
