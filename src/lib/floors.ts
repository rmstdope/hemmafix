/** How a floor is shown: numbered floors as "Plan 2", named ones as they are ("Suterräng"). */
export function floorLabel(name: string): string {
  return /^-?\d+$/.test(name.trim()) ? `Plan ${name.trim()}` : name;
}

/**
 * What makes two floor names the same: how they are shown, ignoring case. "2" and "Plan 2"
 * both show as "Plan 2", so a home cannot have both.
 */
export function floorKey(name: string): string {
  return floorLabel(name).trim().toLowerCase();
}

/** The name a new floor gets: the lowest whole number whose label is not already taken. */
export function nextFloorName(existing: string[]): string {
  const used = new Set(existing.map(floorKey));
  let n = 1;
  while (used.has(floorKey(String(n)))) n++;
  return String(n);
}

/** "Badrum · Plan 2" when the home has several floors, otherwise just "Badrum". */
export function roomLabel(roomName: string, floorName: string | null, showFloors: boolean): string {
  return showFloors && floorName ? `${roomName} · ${floorLabel(floorName)}` : roomName;
}
