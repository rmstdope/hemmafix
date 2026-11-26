import type { CSSProperties, ReactNode } from "react";
import type { SkyPiece, SkyTheme } from "@/lib/sky";
import { cn } from "@/lib/utils";

/** `count` pieces of a kind taken evenly from left to right, so a small sky is filled across too. */
function take(pieces: readonly SkyPiece[], kind: SkyPiece["kind"], count?: number) {
  const all = pieces.filter((p) => p.kind === kind).sort((a, b) => a.x - b.x);
  if (count === undefined) return all;
  return Array.from({ length: count }, (_, i) => all[Math.floor(((i + 0.5) * all.length) / count)]!);
}

export type SkyProps = {
  /** Which sky this is: "page", "tile" or "preview". */
  name: string;
  className?: string;
  /** How many of a kind; all of them when left out. */
  counts?: Partial<Record<SkyPiece["kind"], number>>;
  scale?: number;
};

/**
 * A theme's pieces over whatever box holds it: the whole window, a tile or a preview. They fall
 * (balloons rise), or stand still under reduced motion (the `data-fall` and `data-rise` rules in
 * globals.css). Only decoration: nothing is announced and nothing can be pressed.
 */
export function Sky({
  theme,
  pieces,
  name,
  className,
  counts,
  scale = 1,
  draw,
}: SkyProps & {
  theme: SkyTheme;
  pieces: readonly SkyPiece[];
  /** What is inside a piece that is a drawing; the rest are coloured shapes. */
  draw?: (piece: SkyPiece) => ReactNode;
}) {
  const shown = [...new Set(pieces.map((p) => p.kind))].flatMap((kind) => take(pieces, kind, counts?.[kind]));
  return (
    <div aria-hidden {...{ [`data-${theme}-sky`]: name }} className={cn("pointer-events-none overflow-hidden", className)}>
      {shown.map((p, i) => (
        <span
          key={i}
          {...{ [p.kind === "balloon" ? "data-rise" : "data-fall"]: true }}
          style={
            {
              "--x": p.x,
              "--y": p.y,
              "--seconds": `${p.seconds}s`,
              // Starts it where --y puts it: a falling piece that far down, a rising one that far from the bottom.
              "--delay": `${-((p.kind === "balloon" ? 100 - p.y : p.y) / 100) * p.seconds}s`,
              "--turn": `${p.turn}deg`,
              "--size": `${p.size * scale}px`,
              "--colour": p.colour,
            } as CSSProperties
          }
        >
          <span data-piece={p.kind}>{draw?.(p)}</span>
        </span>
      ))}
    </div>
  );
}
