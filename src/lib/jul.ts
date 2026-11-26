/** The Jul theme's own rules: when Santa's sleigh flies, and what falls from the sky. */

/** The first pass comes this long after Hemmafix is opened... */
export const FIRST_PASS_MS = 4_000;
/** ...and then one starts this often. */
export const PASS_EVERY_MS = 30_000;
/** How long the sleigh takes to cross the window, whatever its width. */
export const PASS_MS = 4_000;

/**
 * When the pass under way, or else the next one, starts, in milliseconds since Hemmafix was
 * opened. The rhythm is a function of that alone, so moving between pages neither restarts it
 * nor cuts a pass short.
 */
export function sleighPassStart(sinceOpenMs: number): number {
  const passes = Math.max(0, Math.floor((sinceOpenMs - FIRST_PASS_MS) / PASS_EVERY_MS));
  const start = FIRST_PASS_MS + passes * PASS_EVERY_MS;
  return sinceOpenMs < start + PASS_MS ? start : start + PASS_EVERY_MS;
}

export type SkyPiece = {
  kind: "flake" | "present";
  /** Where it falls, percent from the left. */
  x: number;
  /** Where it is when the page opens (and where it stays under reduced motion), percent from the top. */
  y: number;
  /** How long it takes to fall the height of the sky. */
  seconds: number;
  /** Degrees it turns over one fall. */
  turn: number;
  /** Width and height in pixels. */
  size: number;
  colour: string;
};

const PRESENT_COLOURS = ["#dc2626", "#16a34a", "#eab308", "#2563eb", "#db2777"];

/**
 * A seeded generator (mulberry32): scattered as by chance, but the same on every draw, so the
 * server and the browser agree on the sky and a new page does not reshuffle it.
 */
function seeded(seed: number) {
  let state = seed;
  return () => {
    state = (state + 0x6d2b79f5) | 0;
    let t = Math.imul(state ^ (state >>> 15), 1 | state);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function pieces(kind: SkyPiece["kind"], count: number, random: () => number): SkyPiece[] {
  const flake = kind === "flake";
  // One piece in each of `count` columns and rows, paired by chance: spread out, never in lines.
  const shuffled = () =>
    Array.from({ length: count }, (_, i) => ({ i, at: random() }))
      .sort((a, b) => a.at - b.at)
      .map(({ i }) => ((i + random()) / count) * 100);
  const columns = shuffled();
  const rows = shuffled();
  return Array.from({ length: count }, (_, i) => ({
    kind,
    x: columns[i]!,
    y: rows[i]!,
    seconds: 10 + random() * 8,
    turn: (i % 2 ? -1 : 1) * (60 + random() * 140),
    size: flake ? 3 + (i % 3) : 16 + (i % 3) * 2,
    colour: flake ? "#ffffff" : PRESENT_COLOURS[i % PRESENT_COLOURS.length]!,
  }));
}

const random = seeded(24);
export const SKY_PIECES: readonly SkyPiece[] = [...pieces("flake", 40, random), ...pieces("present", 12, random)];
