/** "Mamma", "Mamma och Pappa", "Mamma, Pappa och Lisa". */
export function joinNames(names: string[]): string {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} och ${names[names.length - 1]}`;
}

/** The note shown to the person whose tick was cheered. */
export function noteText(names: string[], title: string): string {
  return `${joinNames(names)} gav dig en high five för ${title}`;
}
