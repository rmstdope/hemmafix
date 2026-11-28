/** The parts of Hemmafix, in tab order. Hemmet, login and consent are not parts. */
export const PARTS = [
  { key: "uppgifter", label: "Uppgifter", href: "/" },
  { key: "listor", label: "Listor", href: "/listor" },
  { key: "kalender", label: "Kalender", href: "/kalender" },
  { key: "jag", label: "Jag", href: "/jag" },
] as const;

export type PartKey = (typeof PARTS)[number]["key"];

/** The part a path belongs to (Gjort belongs to the tasks), or null outside the parts. */
export function partOf(pathname: string): PartKey | null {
  if (pathname === "/" || pathname === "/gjort") return "uppgifter";
  if (pathname === "/listor" || pathname.startsWith("/listor/")) return "listor";
  if (pathname === "/kalender") return "kalender";
  if (pathname === "/jag") return "jag";
  return null;
}

/** The part Gjort or Hemmet was opened from, as stored in the session; Uppgifter when unknown. */
export function rememberedPart(raw: string | null): PartKey {
  return PARTS.find((p) => p.key === raw)?.key ?? "uppgifter";
}

/** Whether a path is Hemmet or one of its pages (a routine's). */
export function isHemmet(pathname: string): boolean {
  return pathname === "/hemmet" || pathname.startsWith("/hemmet/");
}

/** The part whose tab is lit: Gjort and Hemmet light the part they were opened from. */
export function litPart(pathname: string, remembered: PartKey): PartKey | null {
  return pathname === "/gjort" || isHemmet(pathname) ? remembered : partOf(pathname);
}

/** The two parts of Jag, in switch order. */
export const JAG_PARTS = [
  { key: "framsteg", label: "Framsteg" },
  { key: "butik", label: "Butik" },
] as const;

export type JagPart = (typeof JAG_PARTS)[number]["key"];

/** The part of Jag stored on this device; Framsteg when unknown. */
export function parseJagPart(raw: string | null): JagPart {
  return raw === "butik" ? "butik" : "framsteg";
}
