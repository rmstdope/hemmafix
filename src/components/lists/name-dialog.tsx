"use client";

import { useRef, useState, useTransition, type RefObject } from "react";
import { Modal } from "./modal";

/** The window that asks for a list's name (Ny lista, Byt namn): Enter submits, an empty name does nothing. */
export function NameDialog({
  title,
  initial = "",
  submitLabel,
  onSubmit,
  onClose,
  opener,
}: {
  title: string;
  initial?: string;
  submitLabel: string;
  /** Resolves true when it worked; the window then closes itself. */
  onSubmit: (name: string) => Promise<boolean>;
  onClose: () => void;
  /** The button that opened the window, which gets focus back. */
  opener: RefObject<HTMLElement | null>;
}) {
  const [name, setName] = useState(initial);
  const [pending, startTransition] = useTransition();
  const input = useRef<HTMLInputElement>(null);

  return (
    <Modal title={title} onClose={() => !pending && onClose()} focusRef={input} returnFocusTo={opener}>
      <form
        className="mt-3"
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
        <div className="mt-4 flex justify-end gap-2">
          <button type="button" onClick={onClose} disabled={pending} className="h-11 rounded-xl border px-4 font-semibold disabled:opacity-50">
            Avbryt
          </button>
          <button type="submit" disabled={pending} className="h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
            {submitLabel}
          </button>
        </div>
      </form>
    </Modal>
  );
}
