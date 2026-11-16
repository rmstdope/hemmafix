"use client";

import { ChevronDown, ChevronRight } from "lucide-react";
import { useCallback, useId, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { parseFolded, toggleFolded } from "@/lib/folded-groups";
import { cn } from "@/lib/utils";

const STORAGE_KEY = "hemmafix:folded-groups";
const listeners = new Set<() => void>();

function readStored() {
  try {
    return localStorage.getItem(STORAGE_KEY);
  } catch {
    return null;
  }
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  window.addEventListener("storage", listener);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", listener);
  };
}

/**
 * One group of the board under its divider. The whole divider row is the button that folds it.
 * Folds are remembered in this browser only; where the browser cannot store, they last for the visit.
 */
export function DueGroupSection({
  groupKey,
  label,
  count,
  overdue,
  today,
  children,
}: {
  groupKey: string;
  label: string;
  count: number;
  overdue: boolean;
  /** YYYY-MM-DD from the server; folded days before it are forgotten. */
  today: string;
  children: ReactNode;
}) {
  const listId = useId();
  // Nothing is folded on the server and during hydration, so both agree; a stored fold applies right after.
  const stored = useSyncExternalStore(subscribe, readStored, () => null);
  const [fallback, setFallback] = useState<string[] | null>(null);
  const folded = useMemo(() => fallback ?? parseFolded(stored), [fallback, stored]);
  const isFolded = folded.includes(groupKey);

  const toggle = useCallback(() => {
    const next = toggleFolded(fallback ?? parseFolded(readStored()), groupKey, today);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setFallback(null);
      for (const l of listeners) l();
    } catch {
      setFallback(next);
    }
  }, [fallback, groupKey, today]);

  const Arrow = isFolded ? ChevronRight : ChevronDown;
  return (
    <div className="mt-4 first:mt-0">
      <button
        type="button"
        aria-expanded={!isFolded}
        aria-controls={listId}
        onClick={toggle}
        className={cn(
          "flex min-h-11 w-full items-center gap-2 rounded-lg px-0.5 text-left text-sm text-muted-foreground",
          overdue && "text-destructive",
        )}
      >
        <span className="shrink-0 font-semibold">{label}</span>
        <span className="shrink-0 font-normal text-muted-foreground/70">{count}</span>
        <span aria-hidden className="h-px min-w-0 flex-1 bg-border" />
        <Arrow className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      </button>
      <div id={listId} hidden={isFolded}>
        {children}
      </div>
    </div>
  );
}
