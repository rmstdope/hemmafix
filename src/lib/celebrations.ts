import { BADGE_COINS } from "./badges";

/** What a screen reader hears when a badge card or a level card opens. */
export const badgeAnnouncement = (name: string) => `Nytt märke: ${name}, ${BADGE_COINS} mynt`;
export const levelAnnouncement = (level: number, title: string) => `Nivå ${level}, ${title}`;

/** How long the confetti is on screen. */
export const CONFETTI_MS = 2000;
export const CONFETTI_COLOURS = 6;

export type ConfettiPiece = {
  /** Where it starts, as a percentage of the width. */
  left: number;
  /** Sideways drift in px while it falls. */
  drift: number;
  delay: number;
  duration: number;
  /** An index into the colour palette. */
  colour: number;
  spin: number;
};

/** The pieces of one burst; every piece has fallen by `CONFETTI_MS`. */
export function confettiPieces(count: number, random: () => number = Math.random): ConfettiPiece[] {
  return Array.from({ length: count }, () => {
    const delay = Math.floor(random() * 300);
    return {
      left: random() * 100,
      drift: Math.round((random() - 0.5) * 120),
      delay,
      duration: 1400 + Math.floor(random() * (CONFETTI_MS - delay - 1400 + 1)),
      colour: Math.floor(random() * CONFETTI_COLOURS),
      spin: Math.round((random() - 0.5) * 720),
    };
  });
}
