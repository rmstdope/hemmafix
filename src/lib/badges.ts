import { formatCoins } from "./coins";
import { HOME_TIME_ZONE } from "./dates";

/** What winning a badge gives, plain: the streak's extra never applies to it. */
export const BADGE_COINS = 25;

export const BADGE_KEYS = [
  "first-task",
  "ten-same",
  "week-streak",
  "every-room",
  "quiet-week",
  "hundred",
  "level-5",
  "first-buy",
] as const;
export type BadgeKey = (typeof BADGE_KEYS)[number];

export const BADGES: { key: BadgeKey; emoji: string; name: string; description: string }[] = [
  { key: "first-task", emoji: "🥇", name: "Första uppgiften", description: "Bocka av din första uppgift." },
  { key: "ten-same", emoji: "🔟", name: "Tio av samma", description: "Gör samma uppgift tio gånger." },
  { key: "week-streak", emoji: "🔥", name: "7 dagar i rad", description: "Gör minst en uppgift sju dagar i rad." },
  { key: "every-room", emoji: "🏠", name: "Varje rum", description: "Gör en uppgift i varje rum i hemmet." },
  {
    key: "quiet-week",
    emoji: "📅",
    name: "En vecka utan sena",
    description: "En hel vecka, måndag till söndag, utan att någon av dina uppgifter blir sen.",
  },
  { key: "hundred", emoji: "💯", name: "100 uppgifter", description: "Bocka av 100 uppgifter." },
  { key: "level-5", emoji: "⭐", name: "Nivå 5", description: "Nå nivå 5." },
  { key: "first-buy", emoji: "🛍️", name: "Första köpet", description: "Köp något i Butik." },
];

/** What a person has done since badges began (nothing from before counts). */
export type BadgeFacts = {
  /** Ticks held now. */
  ticks: number;
  /** The most times one task was ticked. */
  sameTaskBest: number;
  /** Days in a row with a tick, counted from the day badges began. */
  run: number;
  /** Current rooms with a tick, and how many current rooms the home has. */
  roomsDone: number;
  rooms: number;
  /** Days of the running week, up to yesterday, without a late task of theirs; 0 once one is late. */
  quietDays: number;
  /** A finished Monday-Sunday week was without a late task of theirs. */
  quietWeek: boolean;
  /** Every coin earned, badge coins included. */
  lifetime: number;
  /** Bought a look or a reward. */
  bought: boolean;
};

const STREAK_GOAL = 7;
const TEN = 10;
const HUNDRED = 100;
const LEVEL_5_COINS = 1000;

export function earnedKeys(f: BadgeFacts): BadgeKey[] {
  const won: Record<BadgeKey, boolean> = {
    "first-task": f.ticks >= 1,
    "ten-same": f.sameTaskBest >= TEN,
    "week-streak": f.run >= STREAK_GOAL,
    "every-room": f.rooms > 0 && f.roomsDone >= f.rooms,
    "quiet-week": f.quietWeek,
    hundred: f.ticks >= HUNDRED,
    "level-5": f.lifetime >= LEVEL_5_COINS,
    "first-buy": f.bought,
  };
  return BADGE_KEYS.filter((k) => won[k]);
}

/** How far along a badge is, or null when nothing about it can be counted. */
export function progressLine(key: BadgeKey, f: BadgeFacts): { have: number; need: number; text: string } | null {
  const line = (have: number, need: number, text: (n: number) => string) => {
    const shown = Math.min(have, need);
    return { have: shown, need, text: text(shown) };
  };
  switch (key) {
    case "ten-same":
      return line(f.sameTaskBest, TEN, (n) => `${n} av ${TEN} gånger.`);
    case "week-streak":
      return line(f.run, STREAK_GOAL, (n) => `${n} av ${STREAK_GOAL} dagar.`);
    case "every-room":
      return line(f.roomsDone, f.rooms, (n) => `${n} av ${f.rooms} rum klara.`);
    case "quiet-week":
      return line(f.quietDays, 7, (n) => `${n} av 7 dagar.`);
    case "hundred":
      return line(f.ticks, HUNDRED, (n) => `${n} av ${HUNDRED} uppgifter.`);
    case "level-5":
      return line(f.lifetime, LEVEL_5_COINS, (n) => `${formatCoins(n)} av ${formatCoins(LEVEL_5_COINS)} mynt.`);
    default:
      return null;
  }
}

const dayMonth = new Intl.DateTimeFormat("sv-SE", { day: "numeric", month: "long", timeZone: HOME_TIME_ZONE });

/** "Vunnet 12 november." */
export const wonLine = (at: Date) => `Vunnet ${dayMonth.format(at)}.`;
