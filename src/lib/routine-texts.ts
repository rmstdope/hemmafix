/** "Inga uppgifter", "1 uppgift", "5 uppgifter": how many tasks a routine holds. */
export function taskCountLabel(count: number): string {
  if (count === 0) return "Inga uppgifter";
  return count === 1 ? "1 uppgift" : `${count} uppgifter`;
}
