"use client";

import { Flyer, type Flight } from "../sky/flyer";
import { SleighDrawing } from "./sleigh-drawing";

/** Across the window from left to right, climbing a little. */
const FLIGHT: Flight = { keyframes: [{ transform: "translate(-100%, 0)" }, { transform: "translate(100vw, -6vh)" }] };

/** Santa's sleigh, flying over everything now and then. */
export function Sleigh() {
  return (
    <Flyer flight={FLIGHT} data-sleigh className="top-[22%] left-0 h-[60px] w-[190px]">
      <SleighDrawing width={190} />
    </Flyer>
  );
}
