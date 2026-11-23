"use client";

import { useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { TAB_KEYS, type BoardTab, type TabKey } from "@/lib/board-tabs";
import { cn } from "@/lib/utils";

/**
 * The five tabs of the board and their lists. The server renders every list; this only shows one.
 * The tab starts from the URL (`flik`) and is kept there with `history.replaceState`, so a reload
 * or a trip to Listor and back returns to it, while a live refresh never changes it.
 */
export function BoardTabs({
  tabs,
  initial,
  panels,
  underTabs,
}: {
  tabs: BoardTab[];
  initial: TabKey;
  panels: Record<TabKey, ReactNode>;
  /** Shown between the tab row and the lists (the filter chips). */
  underTabs?: ReactNode;
}) {
  const [current, setCurrent] = useState(initial);
  const refs = useRef<Partial<Record<TabKey, HTMLButtonElement | null>>>({});

  const choose = (key: TabKey) => {
    setCurrent(key);
    const url = new URL(window.location.href);
    if (key === "nu") url.searchParams.delete("flik");
    else url.searchParams.set("flik", key);
    window.history.replaceState(window.history.state, "", url);
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const at = TAB_KEYS.indexOf(current);
    const next =
      e.key === "ArrowRight" ? (at + 1) % TAB_KEYS.length
      : e.key === "ArrowLeft" ? (at + TAB_KEYS.length - 1) % TAB_KEYS.length
      : e.key === "Home" ? 0
      : e.key === "End" ? TAB_KEYS.length - 1
      : null;
    if (next === null) return;
    e.preventDefault();
    const key = TAB_KEYS[next]!;
    choose(key);
    refs.current[key]?.focus();
  };

  return (
    <>
      <div role="tablist" aria-label="Uppgifter" onKeyDown={onKeyDown} className="mb-3 flex border-b">
        {tabs.map((t) => {
          const selected = t.key === current;
          return (
            <button
              key={t.key}
              ref={(el) => {
                refs.current[t.key] = el;
              }}
              type="button"
              role="tab"
              id={`tab-${t.key}`}
              aria-selected={selected}
              aria-controls={`panel-${t.key}`}
              aria-label={t.ariaLabel}
              tabIndex={selected ? 0 : -1}
              onClick={() => choose(t.key)}
              className={cn(
                "flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center border-b-2 px-0 text-[13px] leading-tight text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                selected ? "border-foreground font-bold text-foreground" : "border-transparent",
              )}
            >
              <span className="max-w-full truncate">{t.name}</span>
              <span
                aria-hidden
                className={cn(
                  "text-xs font-semibold",
                  t.overdue ? "text-destructive" : t.count === 0 ? "text-muted-foreground/50" : "text-muted-foreground",
                )}
              >
                {t.count}
              </span>
            </button>
          );
        })}
      </div>
      {underTabs}
      {tabs.map((t) => (
        <div key={t.key} role="tabpanel" id={`panel-${t.key}`} aria-labelledby={`tab-${t.key}`} hidden={t.key !== current}>
          {panels[t.key]}
        </div>
      ))}
    </>
  );
}
