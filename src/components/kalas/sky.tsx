import { PARTY_PIECES } from "@/lib/kalas";
import { Sky, type SkyProps } from "../sky/sky";
import { BalloonDrawing } from "./drawing";

/** Kalas's glitter and balloons. */
export function KalasSky(props: SkyProps) {
  return (
    <Sky
      {...props}
      theme="kalas"
      pieces={PARTY_PIECES}
      draw={(p) => (p.kind === "balloon" ? <BalloonDrawing colour={p.colour} /> : null)}
    />
  );
}
