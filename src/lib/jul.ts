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

/** An even but irregular spread without chance: the server and the browser draw the same sky. */
const spread = (i: number, step: number) => ((i + 1) * step) % 1;

function pieces(kind: SkyPiece["kind"], count: number): SkyPiece[] {
  const flake = kind === "flake";
  return Array.from({ length: count }, (_, i) => ({
    kind,
    x: spread(i, 0.618034) * 100,
    y: spread(i, 0.754877) * 100,
    seconds: 10 + spread(i, 0.569840) * 8,
    turn: (i % 2 ? -1 : 1) * (60 + spread(i, 0.414214) * 140),
    size: flake ? 3 + (i % 3) : 16 + (i % 3) * 2,
    colour: flake ? "#ffffff" : PRESENT_COLOURS[i % PRESENT_COLOURS.length]!,
  }));
}

export const SKY_PIECES: readonly SkyPiece[] = [...pieces("flake", 40), ...pieces("present", 12)];
