/** The parts of Hemmafix, in tab order. Hemmet, login and consent are not parts. */
export const PARTS = [
  { key: "uppgifter", label: "Uppgifter", href: "/" },
  { key: "listor", label: "Listor", href: "/listor" },
] as const;

export type PartKey = (typeof PARTS)[number]["key"];

/** The part a path belongs to (Gjort belongs to the tasks), or null outside the parts. */
export function partOf(pathname: string): PartKey | null {
  if (pathname === "/" || pathname === "/gjort") return "uppgifter";
  if (pathname === "/listor" || pathname.startsWith("/listor/")) return "listor";
  return null;
}

/** The part Gjort or Hemmet was opened from, as stored in the session; Uppgifter when unknown. */
export function rememberedPart(raw: string | null): PartKey {
  return raw === "listor" ? "listor" : "uppgifter";
}

/** Whether a path is Hemmet or one of its pages (a routine's). */
export function isHemmet(pathname: string): boolean {
  return pathname === "/hemmet" || pathname.startsWith("/hemmet/");
}

/** The part whose tab is lit: Gjort and Hemmet light the part they were opened from. */
export function litPart(pathname: string, remembered: PartKey): PartKey | null {
  return pathname === "/gjort" || isHemmet(pathname) ? remembered : partOf(pathname);
}
