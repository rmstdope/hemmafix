import { SKY_THEMES, type SkyTheme } from "@/lib/sky";

/**
 * This device's memory that its person uses a theme with a sky of its own, so the sky is there
 * from the first paint, before their choice has streamed in. It only counts on themed pages and
 * until their own marks arrive (globals.css), which then correct it.
 */
const KEY = "hemmafix-sky";

/** Runs in <head>, before anything is painted. */
export const SKY_HINT_SCRIPT = `try{var s=localStorage.getItem("${KEY}");if(${JSON.stringify(SKY_THEMES)}.indexOf(s)>-1)document.documentElement.dataset.sky=s}catch(e){}`;

export function setSkyHint(theme: SkyTheme | null) {
  if (theme) document.documentElement.dataset.sky = theme;
  else delete document.documentElement.dataset.sky;
  try {
    if (theme) window.localStorage.setItem(KEY, theme);
    else window.localStorage.removeItem(KEY);
  } catch {
    // Without storage the sky simply waits for the person's choice.
  }
}
