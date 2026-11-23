"use client";

import { X } from "lucide-react";
import { toast } from "sonner";
import { useOptimistic, useTransition } from "react";
import { closeHighFiveNotes } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { noteText } from "@/lib/high-fives";
import type { HighFiveNote } from "@/server/high-fives";

/** Who cheered your ticks since you last closed the note; closing it keeps the count on the row. */
export function HighFiveNotes({ notes }: { notes: HighFiveNote[] }) {
  const [, startTransition] = useTransition();
  const [shown, hide] = useOptimistic(notes, (all, id: string) => all.filter((n) => n.instanceId !== id));
  if (shown.length === 0) return null;
  return (
    <ul className="mb-3 space-y-2" aria-label="High fives">
      {shown.map((n) => (
        <li
          key={n.instanceId}
          className="flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 py-1 pr-1 pl-3 text-sm text-amber-950"
        >
          <span aria-hidden>👏</span>
          <span className="min-w-0 flex-1">{noteText(n.names, n.title)}</span>
          <Button
            variant="ghost"
            size="icon-lg"
            className="size-11 shrink-0"
            aria-label="Stäng"
            onClick={() =>
              startTransition(async () => {
                hide(n.instanceId);
                const result = await closeHighFiveNotes([n.instanceId]);
                if (result.error) toast.error(result.error);
              })
            }
          >
            <X />
          </Button>
        </li>
      ))}
    </ul>
  );
}
