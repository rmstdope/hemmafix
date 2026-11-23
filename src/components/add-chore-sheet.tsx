"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useRef, useState, type ComponentProps, type TouchEvent } from "react";
import { AddChoreForm } from "./add-chore-form";

type FormProps = Omit<ComponentProps<typeof AddChoreForm>, "onClose">;

/** How far the sheet's top has to be dragged down to close it. */
const SWIPE_CLOSE_PX = 80;

/**
 * The round + (adults) and the add form it opens: a sheet sliding up from the bottom on a phone,
 * a dialog in the middle on a desktop, on the browser's own `<dialog>` (Esc and a press outside
 * close it; Tab stays inside). Rendered only while open, so closing discards the draft, and
 * focus goes back to the +.
 */
export function AddChoreSheet(props: FormProps) {
  const [open, setOpen] = useState(false);
  const plus = useRef<HTMLButtonElement>(null);

  return (
    <>
      {/* At the end of the list column (in flow, so it never covers a row), sticky to the lower right of
          that column; on a phone it sits above the bottom bar. */}
      <div className="pointer-events-none sticky bottom-[calc(var(--parts-bar-h)+env(safe-area-inset-bottom)+1rem)] z-30 mt-auto flex h-14 justify-end sm:bottom-4">
        <button
          ref={plus}
          type="button"
          aria-label="Ny uppgift"
          onClick={() => setOpen(true)}
          className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
        >
          <Plus className="size-7" aria-hidden />
        </button>
      </div>
      {open && <Sheet onClose={() => setOpen(false)} returnFocusTo={plus} form={props} />}
    </>
  );
}

function Sheet({
  onClose,
  returnFocusTo,
  form,
}: {
  onClose: () => void;
  returnFocusTo: React.RefObject<HTMLElement | null>;
  form: FormProps;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dragFrom = useRef<number | null>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const opener = returnFocusTo.current;
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, [returnFocusTo]);

  const start = (e: TouchEvent) => {
    dragFrom.current = e.touches[0]?.clientY ?? null;
  };
  const move = (e: TouchEvent) => {
    const from = dragFrom.current;
    const y = e.touches[0]?.clientY;
    if (from !== null && y !== undefined && y - from > SWIPE_CLOSE_PX) {
      dragFrom.current = null;
      onClose();
    }
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby="add-chore-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto max-h-[calc(100dvh-2rem)] w-[calc(100%-2rem)] max-w-md overflow-y-auto rounded-2xl bg-background p-0 text-foreground shadow-lg backdrop:bg-black/45 max-sm:mx-0 max-sm:mt-auto max-sm:mb-0 max-sm:max-h-[92dvh] max-sm:w-full max-sm:max-w-none max-sm:rounded-b-none"
    >
      <div className="p-4">
        <div onTouchStart={start} onTouchMove={move} onTouchEnd={() => (dragFrom.current = null)} className="-mx-4 -mt-4 px-4 pt-2 sm:hidden">
          <div aria-hidden className="mx-auto h-1 w-10 rounded-full bg-border" />
        </div>
        <div onTouchStart={start} onTouchMove={move} onTouchEnd={() => (dragFrom.current = null)} className="mb-3 flex items-center justify-between">
          <h2 id="add-chore-title" className="font-medium">
            Ny uppgift
          </h2>
          <button
            type="button"
            aria-label="Stäng"
            onClick={onClose}
            className="flex size-11 items-center justify-center rounded-lg text-muted-foreground outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-5" aria-hidden />
          </button>
        </div>
        <AddChoreForm {...form} onClose={onClose} />
      </div>
    </dialog>
  );
}
