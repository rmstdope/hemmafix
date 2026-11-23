const TITLES = ["Nybörjare", "Hjälpreda", "Fixare", "Städproffs", "Hemmahjälte", "Husmästare", "Legend"];
/** Lifetime coins where levels 1-7 begin. */
const STEPS = [0, 100, 250, 500, 1000, 2000, 4000];
/** Past level 7 (Legend) a new level begins every this many coins. */
const LEGEND_STEP = 4000;
const LEGEND_LEVEL = STEPS.length;

export type Level = {
  level: number;
  title: string;
  /** Lifetime coins where this level begins and where the next one does. */
  start: number;
  next: number;
  /** How far through this level, 0 to just under 1; resets at every step. */
  progress: number;
};

const startOf = (level: number) => (level <= LEGEND_LEVEL ? STEPS[level - 1]! : LEGEND_STEP * (level - LEGEND_LEVEL + 1));
const titleOf = (level: number) => (level <= LEGEND_LEVEL ? TITLES[level - 1]! : `Legend ${level - LEGEND_LEVEL + 1}`);

/** The level a member has reached from all the coins they have ever earned (spending never lowers it). */
export function levelFor(lifetimeCoins: number): Level {
  const coins = Math.max(0, lifetimeCoins);
  const level =
    coins < LEGEND_STEP
      ? STEPS.filter((s) => coins >= s).length
      : LEGEND_LEVEL + Math.floor((coins - LEGEND_STEP) / LEGEND_STEP);
  const start = startOf(level);
  const next = startOf(level + 1);
  return { level, title: titleOf(level), start, next, progress: (coins - start) / (next - start) };
}
