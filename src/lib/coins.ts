/** What a task gives until an adult sets it, and the bounds of what they may set. */
export const DEFAULT_COINS = 10;
export const MAX_COINS = 100;
const COIN_STEP = 5;

/** − and +: to the next multiple of 5 in that direction, kept within 0 and 100. */
export function stepCoins(n: number, direction: 1 | -1): number {
  const next = direction === 1 ? (Math.floor(n / COIN_STEP) + 1) * COIN_STEP : (Math.ceil(n / COIN_STEP) - 1) * COIN_STEP;
  return Math.min(MAX_COINS, Math.max(0, next));
}

/** A typed amount when the field is left: whole, within 0 and 100; empty or unreadable gives `fallback`. */
export function clampCoins(raw: string, fallback: number): number {
  if (raw.trim() === "") return fallback;
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.min(MAX_COINS, Math.max(0, Math.round(n)));
}

const number = new Intl.NumberFormat("sv-SE", { useGrouping: true, maximumFractionDigits: 0 });

/** A coin total written in full, never shortened ("1 250"). */
export const formatCoins = (n: number) => number.format(n);

/** The screen-reader name of the coin pill ("40 mynt"). */
export const coinsLabel = (n: number) => `${formatCoins(n)} mynt`;

/** The screen-reader text of a row's badge ("30 mynt"). */
export const coinsBadgeLabel = (n: number) => `${n} mynt`;
