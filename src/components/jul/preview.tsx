import { SleighDrawing } from "./sleigh-drawing";
import { JulSky } from "./sky";

/** Butik's tile for Jul: a small night sky with snow and a few presents. */
export function JulSwatch() {
  return (
    <span data-look-theme="jul" data-jul-swatch className="relative block h-12 w-16 overflow-hidden rounded-lg bg-(--sky)">
      <JulSky name="tile" flakes={10} presents={3} scale={0.5} className="absolute inset-0" />
    </span>
  );
}

/** The preview screen: sky, falling snow and presents, white rows, a red button and the sleigh. */
export function JulPreview() {
  return (
    <div data-look-theme="jul" data-jul-preview aria-hidden className="relative h-40 w-full overflow-hidden rounded-xl bg-(--sky)">
      <JulSky name="preview" flakes={18} presents={5} scale={0.75} className="absolute inset-0" />
      <div className="absolute inset-x-4 top-16 h-6 rounded-lg bg-card" />
      <div className="absolute inset-x-4 top-24 h-6 rounded-lg bg-card" />
      <div data-preview-button className="absolute inset-x-4 top-32 h-5 rounded-lg bg-primary" />
      <div data-preview-sleigh className="pointer-events-none absolute inset-x-0 top-4">
        <SleighDrawing width={120} />
      </div>
    </div>
  );
}
