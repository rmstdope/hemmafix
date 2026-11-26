"use client";

import { useLayoutEffect, useRef } from "react";
import { setSkyHint } from "./jul/sky-hint";
import { Sleigh } from "./jul/sleigh";
import { JulSky } from "./jul/sky";

/**
 * An element that carries `attributes` only while its page is shown. Next keeps a page that was
 * left in the document, hidden, and runs this effect's cleanup: the attributes come off there,
 * or globals.css would go on matching them.
 */
function useShownAttributes(attributes: Record<string, string>) {
  const ref = useRef<HTMLSpanElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entries = Object.entries(attributes);
    for (const [name, value] of entries) el.setAttribute(name, value);
    return () => entries.forEach(([name]) => el.removeAttribute(name));
  });
  return ref;
}

/** In the shell: tells globals.css this is a themed page, before the marks arrive. */
export function ScopeMark() {
  const mark = useShownAttributes({ "data-look-scope": "" });
  return <span ref={mark} hidden data-look-scope="" />;
}

/**
 * The hidden element that carries the person's theme and coin look for globals.css, and Jul's
 * decoration.
 */
export function LookMarks({ theme, coin }: { theme: string; coin: string }) {
  const attributes = { "data-look-own": theme, "data-look-own-coin": coin };
  const mark = useShownAttributes(attributes);

  useLayoutEffect(() => setSkyHint(theme === "jul"), [theme]);

  return (
    <>
      <span ref={mark} hidden {...attributes} />
      {theme === "jul" && (
        <>
          <JulSky name="page" className="fixed inset-0 -z-10" />
          <Sleigh />
        </>
      )}
    </>
  );
}
