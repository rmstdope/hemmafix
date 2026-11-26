"use client";

import { useEffect, useRef, type ComponentProps } from "react";
import { PASS_MS, passStart } from "@/lib/sky";
import { cn } from "@/lib/utils";

export type Flight = {
  keyframes: Keyframe[];
  /** Called before each pass, with when it started, to set what differs between passes. */
  launch?: (el: HTMLElement, start: number) => void;
};

/**
 * Something crossing the window on the rhythm of `passStart`. It flies in the browser's top layer
 * (a manual popover), the only place that is above an open modal dialog, and takes no presses, so
 * they reach whatever is under it. Never under reduced motion. `flight` must stay the same object:
 * a new one starts the pass over.
 */
export function Flyer({ flight, className, ...props }: ComponentProps<"div"> & { flight: Flight }) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    // A browser without popovers cannot put it over a dialog; it goes without.
    if (!el || typeof el.showPopover !== "function") return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    let animation: Animation | undefined;

    // A dialog opened during a pass lands on top of the top layer: go back above it.
    const dialogs = new MutationObserver((changes) => {
      if (changes.some((c) => c.target instanceof HTMLDialogElement && c.target.open)) {
        el.hidePopover();
        el.showPopover();
      }
    });

    const land = () => {
      window.clearTimeout(timer);
      dialogs.disconnect();
      animation?.cancel();
      if (el.matches(":popover-open")) el.hidePopover();
    };

    const fly = (start: number, elapsed: number) => {
      flight.launch?.(el, start);
      el.showPopover();
      // A script animation keeps its place while the popover is taken out and put back.
      animation = el.animate(flight.keyframes, { duration: PASS_MS, fill: "both" });
      animation.currentTime = elapsed;
      dialogs.observe(document.body, { subtree: true, attributes: true, attributeFilter: ["open"] });
      timer = window.setTimeout(
        () => {
          land();
          wait();
        },
        Math.ceil(PASS_MS - elapsed),
      );
    };

    const wait = () => {
      if (calm.matches) return;
      const now = performance.now();
      const start = passStart(now);
      if (now >= start) fly(start, now - start);
      else timer = window.setTimeout(wait, Math.ceil(start - now));
    };

    const onCalm = () => {
      land();
      wait();
    };
    calm.addEventListener("change", onCalm);
    wait();
    return () => {
      calm.removeEventListener("change", onCalm);
      land();
    };
  }, [flight]);

  return (
    <div
      {...props}
      ref={ref}
      popover="manual"
      aria-hidden
      className={cn("pointer-events-none fixed inset-auto m-0 overflow-visible border-0 bg-transparent p-0", className)}
    />
  );
}
