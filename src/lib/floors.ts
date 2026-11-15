/** How a floor is shown: numbered floors as "Plan 2", named ones as they are ("Suterräng"). */
export function floorLabel(name: string): string {
  return /^-?\d+$/.test(name.trim()) ? `Plan ${name.trim()}` : name;
}

/** The name a new floor gets: the lowest whole number not already used as a floor's name. */
export function nextFloorName(existing: string[]): string {
  const used = new Set(existing.map((n) => n.trim()));
  let n = 1;
  while (used.has(String(n))) n++;
  return String(n);
}

/** "Badrum · Plan 2" when the home has several floors, otherwise just "Badrum". */
export function roomLabel(roomName: string, floorName: string | null, showFloors: boolean): string {
  return showFloors && floorName ? `${roomName} · ${floorLabel(floorName)}` : roomName;
}
