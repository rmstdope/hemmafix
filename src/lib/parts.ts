/** The parts of Hemmafix, in tab order. Hemmet, login and consent are not parts. */
export const PARTS = [
  { key: "uppgifter", label: "Uppgifter", href: "/" },
  { key: "listor", label: "Listor", href: "/listor" },
] as const;

export type PartKey = (typeof PARTS)[number]["key"];

/** The part a path belongs to (Gjort belongs to the tasks), or null outside the parts. */
export function partOf(pathname: string): PartKey | null {
  if (pathname === "/" || pathname === "/gjort") return "uppgifter";
  if (pathname === "/listor") return "listor";
  return null;
}
