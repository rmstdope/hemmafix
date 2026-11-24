import type { ReactNode } from "react";
import { cn } from "@/lib/utils";
import { CoinBadge } from "./coin-badge";

/**
 * The body of every task row that carries a coin: the title with its trailing control on line 1
 * (a long title wraps), the grey details with the coin on the right of line 2.
 */
export function TaskRowBody({
  title,
  struck = false,
  trailing,
  details,
  coins,
  faded = false,
}: {
  title: string;
  /** A done row: the title is struck through and grey. */
  struck?: boolean;
  /** The control at the top right of line 1. */
  trailing?: ReactNode;
  /** Small grey text on the left of line 2. */
  details?: ReactNode;
  /** Null: no badge (a tick from before coins existed). */
  coins: number | null;
  /** On a done row, where the badge is what that tick gave. */
  faded?: boolean;
}) {
  return (
    <div className="min-w-0 flex-1">
      <div className="flex min-h-6 items-start gap-1">
        <p className={cn("min-w-0 flex-1 pt-0.5 leading-5 font-medium [overflow-wrap:anywhere]", struck && "text-muted-foreground line-through")}>
          {title}
        </p>
        {trailing}
      </div>
      <div className="mt-1 flex items-end gap-2">
        <p className="min-w-0 flex-1 text-xs leading-4 text-muted-foreground">{details}</p>
        {coins !== null && <CoinBadge coins={coins} faded={faded} />}
      </div>
    </div>
  );
}
