import { z } from "zod";
import { addDays, formatTime, todayIso } from "./dates";
import { formatCoins } from "./coins";

export const MAX_REWARD_PRICE = 1000;
export const PRICE_ERROR = "Priset ska vara 1–1 000 mynt.";

const priceInput = z.unknown().transform((v) => (typeof v === "string" ? (v.trim() === "" ? NaN : Number(v)) : v)).pipe(
  z
    .number({ error: PRICE_ERROR })
    .int({ error: PRICE_ERROR })
    .min(1, { error: PRICE_ERROR })
    .max(MAX_REWARD_PRICE, { error: PRICE_ERROR }),
);

/** A reward as typed into its sheet: a name and a whole price from 1 to 1 000 coins. */
export const rewardInput = z.object({
  name: z.string({ error: "Skriv ett namn." }).trim().min(1, { error: "Skriv ett namn." }).max(80, { error: "Namnet är för långt." }),
  price: priceInput,
});
export type RewardInput = z.infer<typeof rewardInput>;

/** Under an unaffordable reward: what is still missing. */
export const coinsLeftText = (price: number, balance: number) => `${formatCoins(price - balance)} mynt kvar`;

/** The buy sheet's sentence. */
export const buyText = (price: number, balance: number) =>
  `Det kostar ${formatCoins(price)} mynt. Du har ${formatCoins(balance)} och får ${formatCoins(balance - price)} kvar. En vuxen ger dig belöningen.`;

const WEEKDAYS = ["söndag", "måndag", "tisdag", "onsdag", "torsdag", "fredag", "lördag"];
const weekdayInHome = new Intl.DateTimeFormat("en-US", { timeZone: "Europe/Stockholm", weekday: "short" });
const WEEKDAY_INDEX: Record<string, number> = { Sun: 0, Mon: 1, Tue: 2, Wed: 3, Thu: 4, Fri: 5, Sat: 6 };
const MONTHS = ["jan", "feb", "mar", "apr", "maj", "jun", "jul", "aug", "sep", "okt", "nov", "dec"];

/** "idag", "igår", "i fredags" within the last week, else "2 nov", all in the home's time zone. */
function dayWords(at: Date, now: Date): string {
  const day = todayIso(at);
  const today = todayIso(now);
  if (day === today) return "idag";
  if (day === addDays(today, -1)) return "igår";
  for (let back = 2; back <= 6; back++) {
    if (day === addDays(today, -back)) return `i ${WEEKDAYS[WEEKDAY_INDEX[weekdayInHome.format(at)]!]}s`;
  }
  const [, m, d] = day.split("-").map(Number);
  return `${d} ${MONTHS[m! - 1]}`;
}

/** "Köpt idag 16:20" */
export const purchasedWhen = (at: Date, now: Date = new Date()) => {
  const words = dayWords(at, now);
  return `Köpt ${words} ${formatTime(at)}`;
};

/** The gold row's line: "🎁 Belöning · köpt idag 16:20" */
export const waitingWhen = (at: Date, now: Date = new Date()) =>
  `🎁 Belöning · ${purchasedWhen(at, now).replace(/^Köpt/, "köpt")}`;

/** "Fick i fredags" */
export const givenWhen = (at: Date, now: Date = new Date()) => `Fick ${dayWords(at, now)}`;

/**
 * Who is asked to give a purchase: every adult except the buyer, or the buyer themselves when
 * they are the home's only adult. Empty when nobody can.
 */
export function giveRecipients(buyerId: string, members: { id: string; role: "adult" | "child" }[]): string[] {
  const adults = members.filter((m) => m.role === "adult").map((m) => m.id);
  const others = adults.filter((id) => id !== buyerId);
  if (others.length > 0) return others;
  return adults.includes(buyerId) ? [buyerId] : [];
}
