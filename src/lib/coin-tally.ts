/** Coins in every shower, whatever the task is worth. */
export const SHOWER_COINS = 5;

type Shower = { coins: number; landed: number; credited: number; saved: boolean | null };

/** What the pill shows while showers play (`shown`), or null when it shows the server's total. */
export type Tally = { shown: number | null; showers: Record<number, Shower> };

export type TallyAction =
  | { type: "start"; id: number; total: number; coins: number; instant: boolean }
  | { type: "land"; id: number }
  | { type: "settle"; id: number; saved: boolean }
  | { type: "release" };

export const initialTally: Tally = { shown: null, showers: {} };

export function tallyReducer(tally: Tally, action: TallyAction): Tally {
  if (action.type === "release") return initialTally;
  if (action.type === "start") {
    const credited = action.instant ? action.coins : 0;
    return {
      shown: (tally.shown ?? action.total) + credited,
      showers: {
        ...tally.showers,
        [action.id]: { coins: action.coins, landed: action.instant ? SHOWER_COINS : 0, credited, saved: null },
      },
    };
  }
  const shower = tally.showers[action.id];
  if (!shower || tally.shown === null) return tally;
  if (action.type === "settle") {
    // A failed save takes back what was credited so far; coins still in the air add nothing.
    const back = action.saved ? 0 : shower.credited;
    return {
      shown: tally.shown - back,
      showers: { ...tally.showers, [action.id]: { ...shower, saved: action.saved, credited: action.saved ? shower.credited : 0 } },
    };
  }
  const landed = shower.landed + 1;
  const credited = shower.saved === false ? 0 : Math.round((shower.coins * landed) / SHOWER_COINS);
  return {
    shown: tally.shown + credited - shower.credited,
    showers: { ...tally.showers, [action.id]: { ...shower, landed, credited } },
  };
}

/** Every shower has landed all its coins and been told whether its save worked. */
export const isFinished = (tally: Tally) => {
  const all = Object.values(tally.showers);
  return all.length > 0 && all.every((s) => s.landed >= SHOWER_COINS && s.saved !== null);
};
