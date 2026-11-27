"use client";

import { useLayoutEffect, useRef } from "react";
import { useHydrated } from "./lists/use-hydrated";

/**
 * A hidden element that carries `attributes` only while its page is shown: the one way to put a
 * mark that page-wide CSS reads (`:has()` in globals.css) in the document. Next keeps a page that
 * was left in the document, hidden, and runs this effect's cleanup: the attributes come off there,
 * or globals.css would go on matching them.
 *
 * The server's HTML carries the attributes too, so a page is marked before React takes it over. Once
 * it has, they are rendered empty: React also writes what it renders into a page that is already
 * hidden (marks that stream in after the person left it) and runs no effect there. What keeps a
 * hidden page unmarked is that only this effect sets them, and it runs only while the page is shown.
 */
export function PageMark({ attributes }: { attributes: Record<`data-${string}`, string> }) {
  const ref = useRef<HTMLSpanElement>(null);
  const rendered = useHydrated() ? {} : attributes;
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const entries = Object.entries(attributes);
    for (const [name, value] of entries) el.setAttribute(name, value);
    return () => entries.forEach(([name]) => el.removeAttribute(name));
  });
  return <span ref={ref} hidden {...rendered} />;
}
