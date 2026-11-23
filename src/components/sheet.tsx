"use client";

import { Plus, X } from "lucide-react";
import { useEffect, useId, useRef, type ReactNode, type RefObject, type TouchEvent } from "react";

/** How far the sheet's top has to be dragged down to close it. */
const SWIPE_CLOSE_PX = 80;

/**
 * The round + that floats at the lower right of the list column (in flow at the end of `<main>`,
 * so it never covers a row, and sticky to the column's lower right; on a phone it sits above the
 * bottom bar). `<main>` must be a flex column.
 */
export function FloatingAdd({
  label,
  buttonRef,
  onClick,
}: {
  label: string;
  buttonRef: RefObject<HTMLButtonElement | null>;
  onClick: () => void;
}) {
  return (
    <div className="pointer-events-none sticky bottom-[calc(var(--parts-bar-h)+env(safe-area-inset-bottom)+1rem)] z-30 mt-auto flex h-14 justify-end sm:bottom-4">
      <button
        ref={buttonRef}
        type="button"
        aria-label={label}
        onClick={onClick}
        className="pointer-events-auto flex size-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg outline-none focus-visible:ring-3 focus-visible:ring-ring/50"
      >
        <Plus className="size-7" aria-hidden />
      </button>
    </div>
  );
}

/**
 * A sheet sliding up from the bottom on a phone, a dialog in the middle on a desktop, on the
 * browser's own `<dialog>`: Esc, a press outside, ✕ and a swipe down close it, and Tab stays
 * inside. Render it only while open, so closing discards what was typed. Focus goes to
 * `focusRef` when given, and back to `returnFocusTo` on close.
 */
export function Sheet({
  title,
  onClose,
  returnFocusTo,
  focusRef,
  children,
}: {
  title: string;
  onClose: () => void;
  returnFocusTo: RefObject<HTMLElement | null>;
  focusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const dragFrom = useRef<number | null>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const opener = returnFocusTo.current;
    focusRef?.current?.focus();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, [returnFocusTo, focusRef]);

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
      aria-labelledby={titleId}
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
          <h2 id={titleId} className="font-medium">
            {title}
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
        {children}
      </div>
    </dialog>
  );
}
