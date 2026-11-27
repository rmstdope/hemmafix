import { BunchDrawing } from "./drawing";
import { KalasSky } from "./sky";

/** Butik's tile for Kalas: a small party sky with glitter and a couple of balloons. */
export function KalasSwatch() {
  return (
    <span data-look-theme="kalas" data-kalas-swatch className="relative block h-12 w-16 overflow-hidden rounded-lg bg-(--sky)">
      <KalasSky name="tile" counts={{ square: 6, dot: 4, balloon: 2 }} scale={0.55} className="absolute inset-0" />
    </span>
  );
}

/** The preview screen: sky, glitter, balloons, white rows, a pink button and the bunch passing. */
export function KalasPreview() {
  return (
    <div data-look-theme="kalas" data-kalas-preview aria-hidden className="relative h-52 w-full overflow-hidden rounded-xl bg-(--sky)">
      <KalasSky name="preview" counts={{ square: 14, dot: 9, balloon: 4 }} scale={0.75} className="absolute inset-0" />
      <div data-preview-row className="absolute inset-x-4 top-8 h-6 rounded-lg bg-card" />
      <div data-preview-row className="absolute inset-x-4 top-16 h-6 rounded-lg bg-card" />
      <div data-preview-button className="absolute inset-x-4 top-24 h-5 rounded-lg bg-primary" />
      <div data-preview-bunch className="pointer-events-none absolute top-full left-1/2 -ml-8">
        <BunchDrawing width={64} />
      </div>
    </div>
  );
}
