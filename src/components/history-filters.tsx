"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-base md:text-sm dark:bg-input/30";

const PERIODS = [
  { value: "7", label: "Senaste veckan" },
  { value: "30", label: "Senaste månaden" },
  { value: "365", label: "Senaste året" },
];

/**
 * Picks whose history to show (adults only: `members` is empty for children) and how far
 * back. Kept in the URL; the server decides what the person may actually see.
 */
export function HistoryFilters({
  members,
  currentUserId,
  personId,
  period,
}: {
  members: Option[];
  currentUserId: string;
  personId: string;
  period: number;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // Own state, so a second change before navigation finishes keeps the first (see BoardFilters).
  const [current, setCurrent] = useState({ vem: personId, period: String(period) });

  const go = (patch: Partial<typeof current>) => {
    const next = { ...current, ...patch };
    setCurrent(next);
    const params = new URLSearchParams();
    if (next.vem !== currentUserId) params.set("vem", next.vem);
    if (next.period !== "30") params.set("period", next.period);
    const query = params.toString();
    startTransition(() => router.replace(query ? `/gjort?${query}` : "/gjort", { scroll: false }));
  };

  return (
    <div className={cn("grid gap-2", members.length > 0 && "sm:grid-cols-2", pending && "opacity-60")} role="search">
      {members.length > 0 && (
        <select
          aria-label="Vems uppgifter"
          value={current.vem}
          onChange={(e) => go({ vem: e.target.value })}
          className={selectClass}
        >
          {members.map((m) => (
            <option key={m.id} value={m.id}>
              {m.id === currentUserId ? `${m.name} (jag)` : m.name}
            </option>
          ))}
        </select>
      )}
      <select
        aria-label="Period"
        value={current.period}
        onChange={(e) => go({ period: e.target.value })}
        className={selectClass}
      >
        {PERIODS.map((p) => (
          <option key={p.value} value={p.value}>
            {p.label}
          </option>
        ))}
      </select>
    </div>
  );
}
