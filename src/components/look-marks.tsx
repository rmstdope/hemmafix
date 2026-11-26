"use client";

import { Fragment, useLayoutEffect, useRef } from "react";
import { skyTheme } from "@/lib/sky";
import { setSkyHint } from "./sky/hint";
import { SCENES } from "./sky/scenes";

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
 * The hidden element that carries the person's theme and coin look for globals.css, and the
 * decoration of a theme that has a sky of its own.
 */
export function LookMarks({ theme, coin }: { theme: string; coin: string }) {
  const attributes = { "data-look-own": theme, "data-look-own-coin": coin };
  const mark = useShownAttributes(attributes);

  const sky = skyTheme(theme);
  const scene = sky && SCENES[sky];

  useLayoutEffect(() => setSkyHint(sky), [sky]);

  return (
    <>
      <span ref={mark} hidden {...attributes} />
      {scene && (
        // Keyed, so switching from one sky theme to the other leaves nothing of the first.
        <Fragment key={sky}>
          <scene.Sky name="page" className="fixed inset-0 -z-10" />
          <scene.Flyer />
        </Fragment>
      )}
    </>
  );
}
