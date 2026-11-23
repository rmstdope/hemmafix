"use client";

import { Check } from "lucide-react";
import { useRouter } from "next/navigation";
import { useOptimistic, useRef, useState, useTransition } from "react";
import { toast } from "sonner";
import { declineReward, giveReward } from "@/app/actions";
import { Sheet } from "@/components/sheet";
import { Button } from "@/components/ui/button";
import { formatCoins } from "@/lib/coins";
import { waitingWhen } from "@/lib/rewards";
import { cn } from "@/lib/utils";
import type { GoldRow } from "@/server/rewards";

/**
 * Bought rewards an adult is asked to give, at the top of Nu: ticking one off means it was given
 * (no coins, no shower, no streak day), "Ge inte" hands the coins back.
 */
export function GoldRows({ rows, now }: { rows: GoldRow[]; now: string }) {
  if (rows.length === 0) return null;
  return (
    <ul className="mb-2 space-y-2" aria-label="Belöningar att ge">
      {rows.map((r) => (
        <GoldItem key={r.id} row={r} now={new Date(now)} />
      ))}
    </ul>
  );
}

function GoldItem({ row, now }: { row: GoldRow; now: Date }) {
  const [pending, startTransition] = useTransition();
  const router = useRouter();
  const [hidden, hide] = useOptimistic(false);
  const [declining, setDeclining] = useState(false);
  const opener = useRef<HTMLButtonElement>(null);
  const cancel = useRef<HTMLButtonElement>(null);
  const title = `Ge ${row.buyerName}: ${row.name}`;

  const run = (fn: () => ReturnType<typeof giveReward>, after?: () => void) =>
    startTransition(async () => {
      hide(true);
      const result = await fn();
      if (result.error) {
        toast.error(result.error);
        router.refresh();
      }
      after?.();
    });

  if (hidden) return null;
  return (
    <li
      className={cn(
        "flex items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-3 py-2 text-amber-950 transition-opacity dark:border-amber-700 dark:bg-amber-950/40 dark:text-amber-100",
        pending && "opacity-60",
      )}
    >
      <Button
        variant="outline"
        size="icon-lg"
        className="size-11 shrink-0 rounded-full border-amber-400 bg-transparent"
        aria-label={`${title}: markera som given`}
        onClick={() => run(() => giveReward(row.id))}
      >
        <Check className="opacity-40" />
      </Button>
      <div className="min-w-0 flex-1">
        <p className="font-medium break-words">{title}</p>
        <p className="text-sm opacity-80">{waitingWhen(row.createdAt, now)}</p>
      </div>
      <button
        ref={opener}
        type="button"
        className="min-h-11 shrink-0 px-2 text-sm underline outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        onClick={() => setDeclining(true)}
      >
        Ge inte
      </button>
      {declining && (
        <Sheet title={`Ge inte ${row.name} till ${row.buyerName}?`} onClose={() => setDeclining(false)} returnFocusTo={opener} focusRef={cancel}>
          <p className="mb-4">{`${row.buyerName} får tillbaka ${formatCoins(row.price)} mynt.`}</p>
          <div className="flex flex-col gap-2">
            <Button
              variant="destructive"
              className="min-h-11"
              onClick={() => {
                setDeclining(false);
                run(() => declineReward(row.id));
              }}
            >
              Ge inte
            </Button>
            <Button ref={cancel} variant="outline" className="min-h-11" onClick={() => setDeclining(false)}>
              Avbryt
            </Button>
          </div>
        </Sheet>
      )}
    </li>
  );
}
