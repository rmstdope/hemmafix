"use client";

import { useEffect, useState } from "react";
import { CONFETTI_MS, confettiPieces } from "@/lib/celebrations";

const COLOURS = ["#f59e0b", "#ef4444", "#3b82f6", "#22c55e", "#ec4899", "#a855f7"];
const PIECES = 60;

/**
 * About two seconds of confetti falling over the whole window. Takes no focus and no presses, is
 * hidden from screen readers, and is not drawn at all for people who asked for less motion.
 */
export function Confetti() {
  const [pieces] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches ? [] : confettiPieces(PIECES),
  );
  const [done, setDone] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setDone(true), CONFETTI_MS + 200);
    return () => clearTimeout(timer);
  }, []);

  if (done || pieces.length === 0) return null;
  return (
    <div aria-hidden data-confetti className="pointer-events-none fixed inset-0 z-[70] overflow-hidden">
      {pieces.map((p, i) => (
        <span
          key={i}
          className="absolute top-0 block h-3 w-1.5 rounded-[1px]"
          style={
            {
              left: `${p.left}%`,
              backgroundColor: COLOURS[p.colour],
              animation: `confetti-fall ${p.duration}ms ${p.delay}ms ease-in both`,
              "--confetti-drift": `${p.drift}px`,
              "--confetti-spin": `${p.spin}deg`,
            } as React.CSSProperties
          }
        />
      ))}
    </div>
  );
}
