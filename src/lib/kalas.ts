/** The Kalas theme's own rules: its glitter and balloons, and where the bunch rises from. */

import { FIRST_PASS_MS, PASS_EVERY_MS, scattered, seeded, type SkyPiece } from "./sky";

const GLITTER_COLOURS = ["#ffd23f", "#ff70a6", "#4d96ff", "#ffffff", "#2a9d8f"];
const BALLOON_COLOURS = ["#e63946", "#f4a261", "#ffd23f", "#2a9d8f", "#4d96ff", "#c77dff", "#ff70a6"];

function glitter(kind: "square" | "dot", count: number, random: () => number): SkyPiece[] {
  return scattered(count, random).map(({ x, y }, i) => ({
    kind,
    x,
    y,
    seconds: 10 + random() * 8,
    turn: (i % 2 ? -1 : 1) * (180 + random() * 360),
    size: 5 + (i % 4),
    colour: GLITTER_COLOURS[i % GLITTER_COLOURS.length]!,
  }));
}

function balloons(random: () => number): SkyPiece[] {
  return scattered(BALLOON_COLOURS.length, random).map(({ x, y }, i) => ({
    kind: "balloon",
    x,
    y,
    seconds: 14 + random() * 8,
    turn: (i % 2 ? -1 : 1) * (3 + random() * 4),
    size: 24,
    colour: BALLOON_COLOURS[i]!,
  }));
}

const random = seeded(7);
export const PARTY_PIECES: readonly SkyPiece[] = [
  ...glitter("square", 34, random),
  ...glitter("dot", 22, random),
  ...balloons(random),
];

/** The golden ratio's fraction: stepping by it never comes back to a place it has been. */
const STEP = 0.6180339887;

/**
 * Where along the bottom of the window the bunch rises from in the pass starting at
 * `passStartMs`, from 0 (left) to just under 1 (right). `seed` is drawn once per opening of the
 * app, so a pass resumed on another page keeps its place.
 */
export function bunchPlace(passStartMs: number, seed: number): number {
  const pass = Math.round((passStartMs - FIRST_PASS_MS) / PASS_EVERY_MS);
  return (seed + pass * STEP) % 1;
}
