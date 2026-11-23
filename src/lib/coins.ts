/** What a ticked-off task earns, until an adult can set it per task. */
export const COINS_PER_TASK = 10;

const number = new Intl.NumberFormat("sv-SE", { useGrouping: true, maximumFractionDigits: 0 });

/** A coin total written in full, never shortened ("1 250"). */
export const formatCoins = (n: number) => number.format(n);

/** The screen-reader name of the coin pill ("40 mynt"). */
export const coinsLabel = (n: number) => `${formatCoins(n)} mynt`;
