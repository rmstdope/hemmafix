"use client";

import { useRef, useState, useTransition, type RefObject } from "react";
import { Sheet } from "@/components/sheet";
import type { ListSharing } from "@/lib/lists";
import { SharingPicker, type ShareChoice } from "./sharing-picker";

/** Vem ser listan?: changes who sees a list. Closing it without Spara changes nothing. */
export function SharingSheet({
  initial,
  choices,
  onSubmit,
  onClose,
  opener,
}: {
  initial: ListSharing;
  choices: ShareChoice[];
  /** Resolves true when it worked; the sheet then closes itself. */
  onSubmit: (sharing: ListSharing) => Promise<boolean>;
  onClose: () => void;
  /** The Ändra that opened the sheet, which gets focus back. */
  opener: RefObject<HTMLElement | null>;
}) {
  const [sharing, setSharing] = useState(initial);
  const [pending, startTransition] = useTransition();
  const first = useRef<HTMLButtonElement>(null);

  return (
    <Sheet title="Vem ser listan?" onClose={() => !pending && onClose()} returnFocusTo={opener} focusRef={first}>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (pending) return;
          startTransition(async () => {
            if (await onSubmit(sharing)) onClose();
          });
        }}
      >
        <SharingPicker value={sharing} onChange={setSharing} choices={choices} switchRef={first} />
        <div className="mt-4 flex justify-end">
          <button type="submit" disabled={pending} className="h-11 rounded-xl bg-primary px-4 font-semibold text-primary-foreground disabled:opacity-50">
            Spara
          </button>
        </div>
      </form>
    </Sheet>
  );
}
