"use client";

import { ListFilter, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useId, useRef, useState, useTransition, type ReactNode } from "react";
import { activeFilters, boardQuery, parseTab } from "@/lib/board-tabs";
import { cn } from "@/lib/utils";
import { PageHeader } from "./page-header";
import { RoomOptions } from "./room-options";
import { floorLabel } from "@/lib/floors";

type Option = { id: string; name: string };
type Room = Option & { floorId: string };

const selectClass =
  "h-11 w-full min-w-0 rounded-lg border border-input bg-background px-3 text-base md:text-sm dark:bg-input/30";

type Props = {
  floors: Option[];
  rooms: Room[];
  members: Option[];
  currentUserId: string;
  roomId?: string;
  floorId?: string;
  who?: string;
};

const placeOf = (p: Props) => (p.roomId ? `room:${p.roomId}` : p.floorId ? `floor:${p.floorId}` : "");

/** The words the filter panel uses for a choice, which the chips repeat. */
function words({ floors, rooms, members, currentUserId }: Props) {
  return {
    place: (place: string) => {
      const [kind, id] = place.split(":");
      if (kind === "floor") return `Hela ${floorLabel(floors.find((f) => f.id === id)?.name ?? "").replace(/^Plan/, "plan")}`;
      const room = rooms.find((r) => r.id === id);
      const floor = floors.find((f) => f.id === room?.floorId);
      return room ? (floors.length > 1 && floor ? `${room.name} (${floorLabel(floor.name)})` : room.name) : "";
    },
    vem: (vem: string) =>
      vem === "mine" ? "Mina" : vem === "none" ? "Ingen tilldelad" : (members.find((m) => m.id === vem && m.id !== currentUserId)?.name ?? ""),
  };
}

/** Moves to the board with a new filter, keeping the tab that is open (the URL has the latest). */
function useGo(initial: { place: string; vem: string }) {
  const router = useRouter();
  const search = useSearchParams();
  const [pending, startTransition] = useTransition();
  // The state is ours, not the props: those catch up only once navigation is done, and a second
  // change made before that must not bring back the first filter's old value.
  const [current, setCurrent] = useState(initial);
  // ...until the server's answer changes what the filter is (a chip removed it, another change landed).
  const [seen, setSeen] = useState(initial);
  // While a change of ours is still on its way the props are behind it, so they are not taken as news.
  if (seen.place !== initial.place || seen.vem !== initial.vem) {
    setSeen(initial);
    if (!pending) setCurrent(initial);
  }
  const go = (patch: Partial<typeof current>) => {
    const next = { ...current, ...patch };
    setCurrent(next);
    const query = boardQuery({ ...next, tab: parseTab(search.get("flik")) });
    startTransition(() => router.replace(query ? `/?${query}` : "/", { scroll: false }));
  };
  return { current, go, pending };
}

/**
 * The page header with the filter button beside the member's picture, and the panel that folds
 * open under it. Picks apply at once; Esc or the button closes the panel.
 */
export function FilterHeader(props: Props & { title: string; subtitle?: string; children?: ReactNode }) {
  const { floors, rooms, members, currentUserId, title, subtitle, children } = props;
  const { current, go, pending } = useGo({ place: placeOf(props), vem: props.who ?? "" });
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  const count = (current.place ? 1 : 0) + (current.vem ? 1 : 0);
  const close = () => {
    setOpen(false);
    button.current?.focus();
  };
  // Esc closes the panel wherever focus is.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: globalThis.KeyboardEvent) => {
      if (e.key === "Escape" && !e.defaultPrevented) close();
    };
    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <div>
      <PageHeader title={title} subtitle={subtitle} lowered>
        <button
          ref={button}
          type="button"
          aria-label={count > 0 ? `Filtrera, ${count} filter på` : "Filtrera"}
          aria-expanded={open}
          aria-controls={panelId}
          onClick={() => (open ? close() : setOpen(true))}
          className={cn(
            "relative flex size-11 items-center justify-center rounded-lg border outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
            open ? "border-foreground bg-foreground text-background" : "text-muted-foreground",
          )}
        >
          <ListFilter className="size-5" aria-hidden />
          {count > 0 && !open ? (
            <span
              aria-hidden
              className="absolute -top-1 -right-1 flex size-4 items-center justify-center rounded-full bg-primary text-[10px] font-semibold text-primary-foreground ring-2 ring-background"
            >
              {count}
            </span>
          ) : null}
        </button>
        {children}
      </PageHeader>
      <div
        id={panelId}
        role="group"
        aria-label="Filter"
        hidden={!open}
        className={cn("mb-3 space-y-3 rounded-xl border bg-muted/40 p-3 shadow-sm", pending && "opacity-60")}
      >
        <label className="block space-y-1 text-xs text-muted-foreground">
          <span>Rum</span>
          <select value={current.place} onChange={(e) => go({ place: e.target.value })} className={selectClass}>
            <option value="">Alla rum</option>
            <RoomOptions floors={floors} rooms={rooms} roomValue={(id) => `room:${id}`} wholeFloor={(id) => `floor:${id}`} />
          </select>
        </label>
        <label className="block space-y-1 text-xs text-muted-foreground">
          <span>Person</span>
          <select value={current.vem} onChange={(e) => go({ vem: e.target.value })} className={selectClass}>
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
        </label>
        {count > 0 ? (
          <div className="text-right">
            <button type="button" onClick={() => go({ place: "", vem: "" })} className="min-h-11 px-1 text-sm text-primary underline">
              Rensa filter
            </button>
          </div>
        ) : null}
      </div>
    </div>
  );
}

/** One chip per filter that is on, under the tabs, each with a ✕ that removes it. */
export function FilterChips(props: Props) {
  const { go, current } = useGo({ place: placeOf(props), vem: props.who ?? "" });
  const w = words(props);
  const chips = activeFilters(current, w);
  if (chips.length === 0) return null;
  return (
    <ul className="mb-3 flex flex-wrap gap-2" aria-label="Filter på">
      {chips.map((c) => (
        <li key={c.kind} className="flex items-center gap-1 rounded-full border bg-muted/40 py-0.5 pr-0.5 pl-3 text-sm">
          {c.text}
          <button
            type="button"
            aria-label={`Ta bort filtret ${c.text}`}
            onClick={() => go(c.kind === "place" ? { place: "" } : { vem: "" })}
            className="flex size-8 items-center justify-center rounded-full text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
}
