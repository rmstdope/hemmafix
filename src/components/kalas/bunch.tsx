"use client";

import { bunchPlace } from "@/lib/kalas";
import { Flyer, type Flight } from "../sky/flyer";
import { BunchDrawing } from "./drawing";

/** Drawn once per opening of the app, so every opening starts somewhere else. */
let seed: number | undefined;

/** Up from below the window to above its top, drifting and tilting gently. */
const FLIGHT: Flight = {
  keyframes: [
    { transform: "translate(0px, 0px) rotate(-3deg)" },
    { transform: "translate(-14px, calc(-50dvh - 90px)) rotate(3deg)" },
    { transform: "translate(12px, calc(-100dvh - 180px)) rotate(-2deg)" },
  ],
  launch: (el, start) => {
    seed ??= Math.random();
    el.style.setProperty("--place", String(bunchPlace(start, seed)));
  },
};

/** The balloon bunch, rising over everything now and then from a new place along the bottom. */
export function Bunch() {
  return (
    // At least 20 px in from either side, so its drift never takes it out of the window.
    <Flyer flight={FLIGHT} data-bunch className="top-full left-[calc(20px+(100%-150px)*var(--place,0.5))] h-[170px] w-[110px]">
      <BunchDrawing width={110} />
    </Flyer>
  );
}
