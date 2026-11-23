import { coinVars } from "./look-styles";

/** The look of the gold coin pill: the real one beside the picture and the copy that slides in. */
export const coinPillClass =
  "flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 py-0.5 pr-2.5 pl-1 text-sm font-semibold whitespace-nowrap text-zinc-900 tabular-nums outline-none dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";

/** The coin: the person's own look, or the one named by `look` (for the shop's previews). */
export function CoinDot({ look }: { look?: string }) {
  return (
    <span
      aria-hidden
      data-coin
      style={look ? coinVars(look) : undefined}
      className="coin-dot flex size-[18px] shrink-0 items-center justify-center text-[15px] leading-none"
    />
  );
}
