import type { CSSProperties } from "react";

/** The ring each frame draws around a picture (src/lib/looks.ts keys); "none" draws nothing. */
const FRAMES: Record<string, string> = {
  guld: "ring-[3px] ring-amber-400",
  gron: "ring-[3px] ring-emerald-500",
  rosa: "ring-[3px] ring-pink-400",
};

/** Himmelsram, the dearest frame, is a gradient and so is drawn as a padded background instead. */
export const frameClass = (key: string) => FRAMES[key] ?? "";
export const isGradientFrame = (key: string) => key === "himmel";
export const GRADIENT_FRAME: CSSProperties = { background: "linear-gradient(135deg,#38bdf8,#a78bfa)", padding: 3 };

/** The variables of `.coin-dot` for one coin look, to draw it apart from the person's own. */
export function coinVars(key: string): CSSProperties {
  const vars: Record<string, string> = {
    silver: {
      "--coin-bg": "radial-gradient(circle at 35% 35%,#fff,#cbd5e1 70%,#64748b)",
      "--coin-shadow": "inset 0 0 0 1.5px #94a3b8",
    },
    diamant: {
      "--coin-bg": "radial-gradient(circle at 35% 35%,#a5f3fc,#06b6d4 70%,#0e7490)",
      "--coin-shadow": "none",
      "--coin-radius": "3px",
      "--coin-transform": "rotate(45deg) scale(.8)",
    },
    stjarna: { "--coin-bg": "none", "--coin-shadow": "none", "--coin-radius": "0", "--coin-star": '"⭐"' },
  }[key] ?? {
    "--coin-bg": "radial-gradient(circle at 35% 35%,#fde68a,#f59e0b 70%,#b45309)",
    "--coin-shadow": "inset 0 0 0 1.5px #d97706",
    "--coin-radius": "9999px",
    "--coin-transform": "none",
    "--coin-star": "none",
  };
  return vars as CSSProperties;
}
