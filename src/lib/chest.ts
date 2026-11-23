/** The coins a daily chest gives, at least and at most. */
export const CHEST_MIN = 5;
export const CHEST_MAX = 10;

/** A random whole number of coins from CHEST_MIN to CHEST_MAX, equally likely. */
export function rollChestCoins(random: () => number = Math.random): number {
  return CHEST_MIN + Math.floor(random() * (CHEST_MAX - CHEST_MIN + 1));
}
