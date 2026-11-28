// Whether the person still has to give the calendar access: what the red dot on the Kalender tab
// shows. Kept in the browser, since the layout that holds the tabs is not rendered again when the
// person moves between parts. The Kalender view reports what it learns; otherwise the server is
// asked.
"use client";

import { useEffect, useSyncExternalStore } from "react";

/** How often an open page asks again, so a withdrawal in Google shows up. */
const CHECK_MS = 5 * 60_000;

let needsAccess = false;
/** Counts what has been learnt, so an older answer never replaces a newer one. */
let version = 0;
let checking: Promise<void> | undefined;
const listeners = new Set<() => void>();

export function setNeedsCalendarAccess(value: boolean) {
  version++;
  if (needsAccess === value) return;
  needsAccess = value;
  for (const listener of listeners) listener();
}

async function ask() {
  const asked = version;
  try {
    const response = await fetch("/api/calendar/access", { cache: "no-store" });
    if (!response.ok) return;
    const answer = (await response.json()) as { needsAccess: boolean };
    if (asked === version) setNeedsCalendarAccess(answer.needsAccess);
  } catch {
    // Offline, or the app is restarting: the dot stays as it is until the next look.
  }
}

/** One question at a time, however many places show the tabs. */
function check() {
  checking ??= ask().finally(() => {
    checking = undefined;
  });
}

const subscribe = (listener: () => void) => {
  listeners.add(listener);
  return () => listeners.delete(listener);
};

/** Whether to show the dot. Asks again on every move between pages, and while the page stays open. */
export function useCalendarDot(pathname: string): boolean {
  useEffect(() => {
    check();
  }, [pathname]);
  useEffect(() => {
    const whenVisible = () => {
      if (document.visibilityState === "visible") check();
    };
    const timer = setInterval(whenVisible, CHECK_MS);
    document.addEventListener("visibilitychange", whenVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", whenVisible);
    };
  }, []);
  return useSyncExternalStore(
    subscribe,
    () => needsAccess,
    () => false,
  );
}
