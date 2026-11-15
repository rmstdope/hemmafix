"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { cn } from "@/lib/utils";
import { RoomOptions } from "./room-options";

type Option = { id: string; name: string };
type Room = Option & { floorId: string };

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-transparent px-3 text-base md:text-sm dark:bg-input/30";

/**
 * Filters the open tasks on room (or a whole floor) and on who they are assigned to; kept in
 * the URL as `rum`, `plan` and `vem`.
 */
export function BoardFilters({
  floors,
  rooms,
  members,
  currentUserId,
  roomId,
  floorId,
  who,
}: {
  floors: Option[];
  rooms: Room[];
  members: Option[];
  currentUserId: string;
  roomId?: string;
  floorId?: string;
  who?: string;
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  // The selects' own state, not the props: the props catch up only once navigation is done,
  // and a second change made before that must not bring back the first filter's old value.
  // `place` is "room:<id>", "floor:<id>" or "" for everywhere.
  const [current, setCurrent] = useState({
    place: roomId ? `room:${roomId}` : floorId ? `floor:${floorId}` : "",
    vem: who ?? "",
  });

  const go = (patch: Partial<typeof current>) => {
    const next = { ...current, ...patch };
    setCurrent(next);
    const params = new URLSearchParams();
    const [kind, id] = next.place.split(":");
    if (kind === "room" && id) params.set("rum", id);
    if (kind === "floor" && id) params.set("plan", id);
    if (next.vem) params.set("vem", next.vem);
    const query = params.toString();
    startTransition(() => router.replace(query ? `/?${query}` : "/", { scroll: false }));
  };

  return (
    <div className={cn("mt-6 mb-3 grid grid-cols-2 gap-2", pending && "opacity-60")} role="search">
      <select
        aria-label="Filtrera på rum"
        value={current.place}
        onChange={(e) => go({ place: e.target.value })}
        className={selectClass}
      >
        <option value="">Alla rum</option>
        <RoomOptions
          floors={floors}
          rooms={rooms}
          roomValue={(id) => `room:${id}`}
          wholeFloor={(id) => `floor:${id}`}
        />
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
