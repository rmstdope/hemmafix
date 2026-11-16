"use client";

import { useEffect } from "react";

/**
 * Scrolls to the element the address's #fragment names once it exists. A page that streams its
 * content behind Suspense has no such element yet when a client-side navigation tries to scroll,
 * so render this inside the streamed content.
 */
export function ScrollToHash() {
  useEffect(() => {
    const id = decodeURIComponent(window.location.hash.slice(1));
    if (id) document.getElementById(id)?.scrollIntoView();
  }, []);
  return null;
}
