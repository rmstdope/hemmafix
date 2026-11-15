"use client";

import { ChevronRight } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { toast } from "sonner";
import { createRoutine } from "@/app/actions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { taskCountLabel } from "@/lib/routine-texts";

export const SAVE_FAILED = "Det gick inte att spara. Försök igen.";

type RoutineRow = { id: string; name: string; taskCount: number };

/** The home's routines, one row each, and a field to make a new one. */
export function Routines({ routines }: { routines: RoutineRow[] }) {
  const router = useRouter();
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();

  const submit = () =>
    startTransition(async () => {
      const result = await createRoutine(name).catch(() => ({ ok: false, error: SAVE_FAILED, id: undefined }));
      if (result.ok && result.id) router.push(`/hemmet/rutiner/${result.id}`);
      else toast.error(result.error ?? SAVE_FAILED);
    });

  return (
    <div className="space-y-3">
      {routines.length === 0 ? (
        <p className="rounded-xl border border-dashed p-3.5 text-sm text-muted-foreground">Inga rutiner ännu.</p>
      ) : (
        <ul className="divide-y rounded-xl border bg-card" aria-label="Rutiner">
          {routines.map((r) => (
            <li key={r.id}>
              <Link href={`/hemmet/rutiner/${r.id}`} className="flex min-h-11 items-center gap-2 py-2 pr-2 pl-3">
                <span className="min-w-0 flex-1">
                  <span className="block break-words">{r.name}</span>
                  <span className="block text-sm text-muted-foreground">{taskCountLabel(r.taskCount)}</span>
                </span>
                <ChevronRight aria-hidden className="size-5 shrink-0 text-muted-foreground" />
              </Link>
            </li>
          ))}
        </ul>
      )}

      <form
        className="flex gap-2"
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
      >
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Ny rutin"
          aria-label="Ny rutin"
          autoComplete="off"
          className="h-11 text-base md:text-sm"
        />
        <Button type="submit" className="h-11 shrink-0" disabled={pending}>
          Lägg till
        </Button>
      </form>
    </div>
  );
}
