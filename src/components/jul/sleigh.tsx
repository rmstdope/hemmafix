"use client";

import { useEffect, useRef } from "react";
import { PASS_MS, sleighPassStart } from "@/lib/jul";
import { SleighDrawing } from "./sleigh-drawing";

/**
 * Santa's sleigh crossing the window on the rhythm of `sleighPassStart`. It flies in the
 * browser's top layer (a manual popover), the only place that is above an open modal dialog, and
 * takes no presses, so they reach whatever is under it. Never under reduced motion.
 */
export function Sleigh() {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    // A browser without popovers cannot put it over a dialog; it goes without the sleigh.
    if (!el || typeof el.showPopover !== "function") return;
    const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
    let timer: number | undefined;
    let flight: Animation | undefined;

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
      flight?.cancel();
      if (el.matches(":popover-open")) el.hidePopover();
    };

    const fly = (elapsed: number) => {
      el.showPopover();
      // A script animation keeps its place while the popover is taken out and put back.
      flight = el.animate([{ transform: "translate(-100%, 0)" }, { transform: "translate(100vw, -6vh)" }], {
        duration: PASS_MS,
        fill: "both",
      });
      flight.currentTime = elapsed;
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
      const start = sleighPassStart(now);
      if (now >= start) fly(now - start);
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
  }, []);

  return (
    <div
      ref={ref}
      popover="manual"
      aria-hidden
      data-sleigh
      className="pointer-events-none fixed inset-auto top-[22%] left-0 m-0 h-[60px] w-[190px] overflow-visible border-0 bg-transparent p-0"
    >
      <SleighDrawing width={190} />
    </div>
  );
}
