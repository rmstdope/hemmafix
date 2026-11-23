import { streakLabel, streakPillText } from "@/lib/streak";
import { cn } from "@/lib/utils";

/**
 * The flame left of the coin pill: days in a row with a tick-off, "🔥7+" from day 7, a grey 🔥0
 * without a streak. Only a sign: it is no button.
 */
export function StreakPill({ run }: { run: number }) {
  return (
    <span
      role="img"
      aria-label={streakLabel(run)}
      className={cn(
        "flex h-8 items-center rounded-full border px-2.5 text-sm font-semibold whitespace-nowrap tabular-nums",
        run > 0
          ? "border-orange-300 bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-950 dark:text-orange-300"
          : "border-zinc-200 bg-zinc-100 text-zinc-400 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-500",
      )}
    >
      {streakPillText(run)}
    </span>
  );
}
