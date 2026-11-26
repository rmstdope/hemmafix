/** The Jul theme's own rules: what falls from its sky. */

import { scattered, seeded, type SkyPiece } from "./sky";

const PRESENT_COLOURS = ["#dc2626", "#16a34a", "#eab308", "#2563eb", "#db2777"];

function pieces(kind: "flake" | "present", count: number, random: () => number): SkyPiece[] {
  const flake = kind === "flake";
  return scattered(count, random).map(({ x, y }, i) => ({
    kind,
    x,
    y,
    seconds: 10 + random() * 8,
    turn: (i % 2 ? -1 : 1) * (60 + random() * 140),
    size: flake ? 3 + (i % 3) : 16 + (i % 3) * 2,
    colour: flake ? "#ffffff" : PRESENT_COLOURS[i % PRESENT_COLOURS.length]!,
  }));
}

const random = seeded(24);
export const SKY_PIECES: readonly SkyPiece[] = [...pieces("flake", 40, random), ...pieces("present", 12, random)];
