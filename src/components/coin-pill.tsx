/** The look of the gold coin pill: the real one beside the picture and the copy that slides in. */
export const coinPillClass =
  "flex h-8 items-center gap-1.5 rounded-full border border-amber-300 bg-amber-100 py-0.5 pr-2.5 pl-1 text-sm font-semibold whitespace-nowrap text-zinc-900 tabular-nums outline-none dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100";

export function CoinDot() {
  return (
    <span
      aria-hidden
      data-coin
      className="size-[18px] shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fde68a,#f59e0b_70%,#b45309)] shadow-[inset_0_0_0_1.5px_#d97706]"
    />
  );
}
