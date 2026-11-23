"use client";

import { useEffect, useRef, useState, type KeyboardEvent, type ReactNode, type RefObject } from "react";
import { cn } from "@/lib/utils";

export type MenuItem = { label: string; onSelect: () => void; checked?: boolean; destructive?: boolean };

/**
 * A button that opens a small menu. Focus goes to the first choice (or the checked one), arrows
 * move, Esc closes and gives focus back to the button, and so does choosing; Tab or a tap
 * elsewhere closes it. With `radio` the choices are a set with one checked, shown with a ✓.
 */
export function Menu({
  items,
  radio = false,
  triggerRef,
  label,
  heading,
  triggerClassName,
  children,
}: {
  items: MenuItem[];
  radio?: boolean;
  triggerRef: RefObject<HTMLButtonElement | null>;
  /** The button's name for screen readers. */
  label: string;
  /** A line of text at the top of the menu; it is not a choice. */
  heading?: string;
  triggerClassName?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  const wrapper = useRef<HTMLDivElement>(null);
  const refs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    if (!open) return;
    (refs.current.find((el) => el?.getAttribute("aria-checked") === "true") ?? refs.current[0])?.focus();
    const away = (e: PointerEvent) => {
      if (!wrapper.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("pointerdown", away);
    return () => document.removeEventListener("pointerdown", away);
  }, [open]);

  const close = () => {
    setOpen(false);
    triggerRef.current?.focus();
  };

  const onKeyDown = (e: KeyboardEvent) => {
    const at = refs.current.findIndex((el) => el === document.activeElement);
    const go = (i: number) => {
      e.preventDefault();
      refs.current[(i + items.length) % items.length]?.focus();
    };
    if (e.key === "Escape") {
      e.preventDefault();
      close();
    } else if (e.key === "ArrowDown") go(at + 1);
    else if (e.key === "ArrowUp") go(at - 1);
    else if (e.key === "Tab") setOpen(false);
  };

  return (
    <div ref={wrapper} className="relative">
      <button
        ref={triggerRef}
        type="button"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={triggerClassName}
      >
        {children}
      </button>
      {open && (
        <div
          role="menu"
          aria-label={label}
          onKeyDown={onKeyDown}
          className="absolute right-0 top-full z-50 mt-1 min-w-44 rounded-xl border bg-popover p-1 text-popover-foreground shadow-lg"
        >
          {heading && <p role="presentation" className="px-3 pt-2 pb-1 text-xs font-medium text-muted-foreground">{heading}</p>}
          {items.map((item, i) => (
            <button
              key={item.label}
              ref={(el) => {
                refs.current[i] = el;
              }}
              type="button"
              role={radio ? "menuitemradio" : "menuitem"}
              aria-checked={radio ? Boolean(item.checked) : undefined}
              onClick={() => {
                close();
                item.onSelect();
              }}
              className={cn(
                "flex min-h-11 w-full items-center gap-2 rounded-lg px-3 text-left text-sm outline-none hover:bg-muted focus-visible:bg-muted",
                item.destructive && "text-destructive",
              )}
            >
              {radio && <span className="w-4 shrink-0" aria-hidden>{item.checked ? "✓" : ""}</span>}
              {item.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
