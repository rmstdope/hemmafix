import { coinsBadgeLabel } from "@/lib/coins";
import { cn } from "@/lib/utils";

/** The small gold coin, the same as in the total beside the picture. */
export function CoinIcon({ className }: { className?: string }) {
  return (
    <span
      aria-hidden
      className={cn(
        "inline-block shrink-0 rounded-full bg-[radial-gradient(circle_at_35%_35%,#fde68a,#f59e0b_70%,#b45309)] shadow-[inset_0_0_0_1.5px_#d97706]",
        className,
      )}
    />
  );
}

/** What a task gives: a coin and its number. `faded` on a done row, where it is what that tick gave. */
export function CoinBadge({ coins, faded = false, className }: { coins: number; faded?: boolean; className?: string }) {
  return (
    <span
      className={cn(
        "inline-flex h-6 shrink-0 items-center gap-1 rounded-full border border-amber-300 bg-amber-100 px-2 text-xs font-semibold whitespace-nowrap text-zinc-900 tabular-nums dark:border-amber-700 dark:bg-amber-950 dark:text-amber-100",
        faded && "opacity-60",
        className,
      )}
    >
      <CoinIcon className="size-3" />
      <span aria-hidden>{coins}</span>
      <span className="sr-only">{coinsBadgeLabel(coins)}</span>
    </span>
  );
}
