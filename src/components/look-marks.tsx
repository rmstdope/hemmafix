"use client";

import { Fragment, useLayoutEffect } from "react";
import { skyTheme } from "@/lib/sky";
import { PageMark } from "./page-mark";
import { setSkyHint } from "./sky/hint";
import { SCENES } from "./sky/scenes";

/**
 * The mark that carries the person's theme and coin look for globals.css, and the
 * decoration of a theme that has a sky of its own.
 */
export function LookMarks({ theme, coin }: { theme: string; coin: string }) {
  const sky = skyTheme(theme);
  const scene = sky && SCENES[sky];

  useLayoutEffect(() => setSkyHint(sky), [sky]);

  return (
    <>
      <PageMark attributes={{ "data-look-own": theme, "data-look-own-coin": coin }} />
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
