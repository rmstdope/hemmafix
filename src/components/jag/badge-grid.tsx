"use client";

import { useRef, useState } from "react";
import type { BadgeView } from "@/server/badges";
import { cn } from "@/lib/utils";
import { Sheet } from "../sheet";

/** Framsteg's badges: "Märken · 3 av 8" and a grid of eight; pressing one opens its sheet. */
export function BadgeGrid({ badges }: { badges: BadgeView[] }) {
  const [open, setOpen] = useState<string | null>(null);
  const opener = useRef<HTMLElement | null>(null);
  const won = badges.filter((b) => b.won).length;
  const shown = badges.find((b) => b.key === open) ?? null;

  return (
    <section aria-labelledby="badges-heading" className="mt-3">
      <h2 id="badges-heading" className="mb-2 text-sm font-semibold">
        Märken · {won} av {badges.length}
      </h2>
      <ul className="grid grid-cols-4 gap-2">
        {badges.map((b) => (
          <li key={b.key} className="min-w-0">
            <button
              type="button"
              aria-label={`${b.name}, ${b.won ? "vunnet" : "inte vunnet"}`}
              onClick={(e) => {
                opener.current = e.currentTarget;
                setOpen(b.key);
              }}
              className={cn(
                "flex size-full min-h-24 flex-col items-center justify-center gap-1 rounded-xl border px-1 py-2 text-center outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                b.won ? "border-amber-300 bg-amber-100 dark:bg-amber-950" : "border-dashed bg-muted",
              )}
            >
              <span aria-hidden className={cn("text-2xl", !b.won && "opacity-40 grayscale")}>
                {b.emoji}
              </span>
              <span aria-hidden className="text-[11px] leading-tight break-words hyphens-auto text-muted-foreground">
                {b.name}
              </span>
              {!b.won && b.progress ? (
                <span aria-hidden className="h-1 w-4/5 overflow-hidden rounded-full bg-border">
                  <span className="block h-full bg-muted-foreground/60" style={{ width: `${(b.progress.have / b.progress.need) * 100}%` }} />
                </span>
              ) : null}
            </button>
          </li>
        ))}
      </ul>
      {shown ? (
        <Sheet title={shown.name} onClose={() => setOpen(null)} returnFocusTo={opener}>
          <div className="text-center">
            <p aria-hidden className={cn("text-5xl", !shown.won && "opacity-40 grayscale")}>
              {shown.emoji}
            </p>
            <p className="mt-2 text-sm">{shown.description}</p>
            {shown.wonText ? <p className="mt-1 text-sm text-muted-foreground">{shown.wonText}</p> : null}
            {shown.progress ? <p className="mt-1 text-sm text-muted-foreground">{shown.progress.text}</p> : null}
          </div>
          <button
            type="button"
            onClick={() => setOpen(null)}
            className="mt-4 h-11 w-full rounded-xl border text-sm font-medium outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            Stäng
          </button>
        </Sheet>
      ) : null}
    </section>
  );
}
