import type { ComponentType } from "react";
import type { SkyTheme } from "@/lib/sky";
import { JulPreview, JulSwatch } from "../jul/preview";
import { Sleigh } from "../jul/sleigh";
import { JulSky } from "../jul/sky";
import { Bunch } from "../kalas/bunch";
import { KalasPreview, KalasSwatch } from "../kalas/preview";
import { KalasSky } from "../kalas/sky";
import type { SkyProps } from "./sky";

type Scene = {
  /** Behind the content. */
  Sky: ComponentType<SkyProps>;
  /** Over everything, now and then. */
  Flyer: ComponentType;
  /** Butik's tile and the preview sheet's small screen. */
  Swatch: ComponentType;
  Preview: ComponentType;
};

/** What each sky theme looks like (its colours are in globals.css). */
export const SCENES: Record<SkyTheme, Scene> = {
  jul: { Sky: JulSky, Flyer: Sleigh, Swatch: JulSwatch, Preview: JulPreview },
  kalas: { Sky: KalasSky, Flyer: Bunch, Swatch: KalasSwatch, Preview: KalasPreview },
};
