"use client";

import { useLayoutEffect, useRef } from "react";
import { setSkyHint } from "./jul/sky-hint";
import { Sleigh } from "./jul/sleigh";
import { JulSky } from "./jul/sky";

/**
 * The hidden element that carries the person's theme and coin look for globals.css, and Jul's
 * decoration. Next keeps a page that was left in the document, hidden, and runs this effect's
 * cleanup: the marks come off there, or a look switched away from would still match.
 */
export function LookMarks({ theme, coin }: { theme: string; coin: string }) {
  const mark = useRef<HTMLSpanElement>(null);

  useLayoutEffect(() => {
    const el = mark.current;
    if (!el) return;
    el.setAttribute("data-look-own", theme);
    el.setAttribute("data-look-own-coin", coin);
    setSkyHint(theme === "jul");
    return () => {
      el.removeAttribute("data-look-own");
      el.removeAttribute("data-look-own-coin");
    };
  }, [theme, coin]);

  return (
    <>
      <span ref={mark} hidden data-look-own={theme} data-look-own-coin={coin} />
      {theme === "jul" && (
        <>
          <JulSky name="page" className="fixed inset-0 -z-10" />
          <Sleigh />
        </>
      )}
    </>
  );
}
