import type { CSSProperties } from "react";
import { SKY_PIECES, type SkyPiece } from "@/lib/jul";
import { cn } from "@/lib/utils";

/** `count` pieces of a kind taken evenly from left to right, so a small sky is filled across too. */
function take(kind: SkyPiece["kind"], count?: number) {
  const all = SKY_PIECES.filter((p) => p.kind === kind).sort((a, b) => a.x - b.x);
  if (count === undefined) return all;
  return Array.from({ length: count }, (_, i) => all[Math.floor(((i + 0.5) * all.length) / count)]!);
}

/**
 * Snow and wrapped presents over whatever box holds it: the whole window, a tile or a preview.
 * They fall, or stand still under reduced motion (the `data-fall` rules in globals.css). Only
 * decoration: nothing is announced and nothing can be pressed.
 */
export function JulSky({
  name,
  className,
  flakes,
  presents,
  scale = 1,
}: {
  /** Which sky this is: "page", "tile" or "preview". */
  name: string;
  className?: string;
  /** How many of each; all of them when left out. */
  flakes?: number;
  presents?: number;
  scale?: number;
}) {
  return (
    <div aria-hidden data-jul-sky={name} className={cn("pointer-events-none overflow-hidden", className)}>
      {[...take("flake", flakes), ...take("present", presents)].map((p, i) => (
        <span
          key={i}
          data-fall
          style={
            {
              left: `${p.x}%`,
              "--y": p.y,
              "--seconds": `${p.seconds}s`,
              "--delay": `${-(p.y / 100) * p.seconds}s`,
              "--turn": `${p.turn}deg`,
              "--size": `${p.size * scale}px`,
              "--colour": p.colour,
            } as CSSProperties
          }
        >
          <span data-piece={p.kind} />
        </span>
      ))}
    </div>
  );
}
