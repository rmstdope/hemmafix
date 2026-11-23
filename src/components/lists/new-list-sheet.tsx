"use client";

import { useRef, useState, useTransition, type RefObject } from "react";
import { Sheet } from "@/components/sheet";

/** Ny lista: a sheet (phone) or window (desktop) asking for the name. Enter or Skapa submits; an empty name does nothing. */
export function NewListSheet({
  onSubmit,
  onClose,
  opener,
}: {
  /** Resolves true when it worked; the sheet then closes itself. */
  onSubmit: (name: string) => Promise<boolean>;
  onClose: () => void;
  /** The + that opened the sheet, which gets focus back. */
  opener: RefObject<HTMLElement | null>;
}) {
  const [name, setName] = useState("");
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  return (
    <Sheet title="Ny lista" onClose={() => !pending && onClose()} returnFocusTo={opener} focusRef={input}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!name.trim() || pending) return;
          startTransition(async () => {
            if (await onSubmit(name)) onClose();
          });
        }}
      >
        <input
          ref={input}
          value={name}
          onChange={(e) => setName(e.target.value)}
          aria-label="Namn"
          maxLength={200}
          autoComplete="off"
          className="h-11 w-full rounded-lg border border-input bg-transparent px-3 text-base outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 md:text-sm"
        />
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={pending} className="h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
            Skapa
          </button>
        </div>
      </form>
    </Sheet>
  );
}
