"use client";

import { useState, useSyncExternalStore } from "react";
import { JAG_PARTS, parseJagPart, type JagPart } from "@/lib/parts";
import { cn } from "@/lib/utils";

const STORE_KEY = "hemmafix-jag-part";
const EVENT = "hemmafix-jag-part";

const subscribe = (notify: () => void) => {
  window.addEventListener(EVENT, notify);
  window.addEventListener("storage", notify);
  return () => {
    window.removeEventListener(EVENT, notify);
    window.removeEventListener("storage", notify);
  };
};
const read = (): JagPart => {
  try {
    return parseJagPart(window.localStorage.getItem(STORE_KEY));
  } catch {
    return "framsteg";
  }
};

/** Jag's switch between Framsteg and Butik, remembered on this device, and the part it shows. */
export function JagParts() {
  const stored = useSyncExternalStore(subscribe, read, () => "framsteg" as const);
  // Without storage the choice still holds until the page is left.
  const [fallback, setFallback] = useState<JagPart | null>(null);
  const current = fallback ?? stored;

  const choose = (part: JagPart) => {
    try {
      window.localStorage.setItem(STORE_KEY, part);
      window.dispatchEvent(new Event(EVENT));
    } catch {
      setFallback(part);
    }
  };

  return (
    <>
      <div role="group" aria-label="Visa" className="mb-3 flex rounded-xl bg-muted p-[3px]">
        {JAG_PARTS.map((p) => {
          const on = p.key === current;
          return (
            <button
              key={p.key}
              type="button"
              aria-pressed={on}
              onClick={() => choose(p.key)}
              className={cn(
                "min-h-11 min-w-0 flex-1 rounded-lg px-2 text-sm whitespace-nowrap outline-none focus-visible:ring-3 focus-visible:ring-ring/50",
                on ? "bg-background font-semibold text-foreground shadow-sm" : "text-muted-foreground",
              )}
            >
              {p.label}
            </button>
          );
        })}
      </div>
      <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
        {current === "framsteg" ? "Dina framsteg kommer hit." : "Butiken kommer hit."}
      </p>
    </>
  );
}
