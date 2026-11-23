export const FLIGHT_MS = 650;
export const STAGGER_MS = 100;

export type Point = { x: number; y: number };

/** Where a coin is at progress t (0..1): an eased quadratic arc that bows up and a little sideways. */
export function flightPoint(from: Point, to: Point, t: number, bend: number): Point {
  const e = t < 0.5 ? 2 * t * t : 1 - (-2 * t + 2) ** 2 / 2;
  const control = { x: (from.x + to.x) / 2 + bend - 60, y: Math.min(from.y, to.y) - 40 };
  const a = (1 - e) * (1 - e);
  const b = 2 * (1 - e) * e;
  const c = e * e;
  return { x: a * from.x + b * control.x + c * to.x, y: a * from.y + b * control.y + c * to.y };
}

/** A coin shrinks slightly as it goes. */
export const flightScale = (t: number) => 1 - 0.25 * t;
