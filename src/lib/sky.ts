/**
 * What the themes that change the sky share: which they are, when something flies over the window,
 * and how their pieces are scattered over it.
 */

export const SKY_THEMES = ["jul", "kalas"] as const;
export type SkyTheme = (typeof SKY_THEMES)[number];

/** The sky theme a look's key names; null for every other look. */
export const skyTheme = (key: string): SkyTheme | null => SKY_THEMES.find((t) => t === key) ?? null;

/** The first pass comes this long after Hemmafix is opened... */
export const FIRST_PASS_MS = 4_000;
/** ...and then one starts this often. */
export const PASS_EVERY_MS = 30_000;
/** How long a pass takes to cross the window, whatever its size. */
export const PASS_MS = 4_000;

/**
 * When the pass under way, or else the next one, starts, in milliseconds since Hemmafix was
 * opened. The rhythm is a function of that alone, so moving between pages neither restarts it
 * nor cuts a pass short.
 */
export function passStart(sinceOpenMs: number): number {
  const passes = Math.max(0, Math.floor((sinceOpenMs - FIRST_PASS_MS) / PASS_EVERY_MS));
  const start = FIRST_PASS_MS + passes * PASS_EVERY_MS;
  return sinceOpenMs < start + PASS_MS ? start : start + PASS_EVERY_MS;
}

export type SkyPiece = {
  kind: "flake" | "present" | "square" | "dot" | "balloon";
  /** Where it is, percent from the left. */
  x: number;
  /** Where it is when the page opens (and where it stays under reduced motion), percent from the top. */
  y: number;
  /** How long it takes to cross the height of the sky: balloons rise, everything else falls. */
  seconds: number;
  /** Degrees it turns over one fall; for a balloon, how far it tips to each side. */
  turn: number;
  /** Width in pixels, and height too for everything but a balloon. */
  size: number;
  colour: string;
};

/**
 * A seeded generator (mulberry32): scattered as by chance, but the same on every draw, so the
 * server and the browser agree on the sky and a new page does not reshuffle it.
 */
export function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** One place in each of `count` columns and rows, paired by chance: spread out, never in lines. */
export function scattered(count: number, random: () => number): { x: number; y: number }[] {
  const shuffled = () =>
    Array.from({ length: count }, (_, i) => ({ i, at: random() }))
      .sort((a, b) => a.at - b.at)
      .map(({ i }) => ((i + random()) / count) * 100);
  const columns = shuffled();
  const rows = shuffled();
  return columns.map((x, i) => ({ x, y: rows[i]! }));
}
