"use client";

import { useEffect, useRef, type ReactNode, type RefObject } from "react";

/**
 * A small window over the page, on the browser's own `<dialog>`: Esc and tapping outside close
 * it, and Tab stays inside. Render it only while it is open. `focusRef` is what gets focus (and,
 * for a field, its text selected) first.
 */
export function Modal({
  title,
  onClose,
  focusRef,
  returnFocusTo,
  children,
}: {
  title: string;
  onClose: () => void;
  focusRef?: RefObject<HTMLElement | null>;
  /** The button that opened the window: it gets focus back when the window closes. */
  returnFocusTo: RefObject<HTMLElement | null>;
  children: ReactNode;
}) {
  const ref = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    dialog.showModal();
    const opener = returnFocusTo.current;
    const target = focusRef?.current;
    target?.focus();
    if (target instanceof HTMLInputElement) target.select();
    return () => {
      dialog.close();
      opener?.focus();
    };
  }, [focusRef, returnFocusTo]);

  return (
    <dialog
      ref={ref}
      aria-labelledby="modal-title"
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
      onClick={(e) => {
        if (e.target === ref.current) onClose();
      }}
      className="m-auto w-[calc(100%-2rem)] max-w-sm rounded-2xl bg-background p-0 text-foreground shadow-lg backdrop:bg-black/45"
    >
      <div className="p-5">
        <h2 id="modal-title" className="text-lg font-semibold break-words">
          {title}
        </h2>
        {children}
      </div>
    </dialog>
  );
}
