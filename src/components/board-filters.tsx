"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";

type Option = { id: string; name: string };

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-base md:text-sm dark:bg-input/30";

/** Filters the open tasks on room and on who they are assigned to; kept in the URL. */
export function BoardFilters({
  rooms,
  members,
  currentUserId,
  roomId,
  who,
}: {
  rooms: Option[];
  members: Option[];
  currentUserId: string;
  roomId?: string;
  who?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The selects' own state, not the props: the props catch up only once navigation is done,
  // and a second change made before that must not bring back the first filter's old value.
  const [current, setCurrent] = useState({ rum: roomId ?? "", vem: who ?? "" });

  const go = (patch: Partial<typeof current>) => {
    const next = { ...current, ...patch };
    setCurrent(next);
    const params = new URLSearchParams();
    if (next.rum) params.set("rum", next.rum);
    if (next.vem) params.set("vem", next.vem);
    const query = params.toString();
    startTransition(() => router.replace(query ? `/?${query}` : "/", { scroll: false }));
  };

  return (
    <div className={cn("mt-6 mb-3 grid grid-cols-2 gap-2", pending && "opacity-60")} role="search">
      <select
        aria-label="Filtrera på rum"
        value={current.rum}
        onChange={(e) => go({ rum: e.target.value })}
        className={selectClass}
      >
        <option value="">Alla rum</option>
        {rooms.map((r) => (
          <option key={r.id} value={r.id}>
            {r.name}
          </option>
        ))}
      </select>
      <select
        aria-label="Filtrera på person"
        value={current.vem}
        onChange={(e) => go({ vem: e.target.value })}
        className={selectClass}
      >
        <option value="">Alla</option>
        <option value="mine">Mina</option>
        <option value="none">Ingen tilldelad</option>
        {members
          .filter((m) => m.id !== currentUserId)
          .map((m) => (
            <option key={m.id} value={m.id}>
              {m.name}
            </option>
          ))}
      </select>
    </div>
  );
}
