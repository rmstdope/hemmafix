"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { todayIso } from "@/lib/dates";

/**
 * Whether the server answers right now. A refresh that cannot reach the server makes Next's router
 * fall back to a full navigation, which replaces the open page (and what is being typed) with the
 * browser's error page, as during a deploy.
 */
async function serverAnswers() {
  try {
    return (await fetch("/healthz", { cache: "no-store" })).ok;
  } catch {
    return false;
  }
}

/** How long to wait before reopening an event stream that ended, at first and at most. */
const RECONNECT_MIN_MS = 5_000;
const RECONNECT_MAX_MS = 60_000;

/** Refreshes the page data when another family member changes a task. */
export function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    let reconnect: ReturnType<typeof setTimeout> | undefined;
    let source: EventSource | undefined;
    let reconnectDelay = RECONNECT_MIN_MS;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        // When it does not answer, the event stream reconnects once it does, and catches up then.
        // The server can still go away between the probe and the refresh; that window is
        // milliseconds, and the router has no way to turn its fallback off.
        if (await serverAnswers()) router.refresh();
      }, 150);
    };

    const connect = () => {
      const stream = new EventSource("/api/events");
      source = stream;
      stream.onmessage = refreshSoon;
      // After a dropped connection (phone asleep, network switch, a deploy) catch up.
      stream.onopen = () => {
        reconnectDelay = RECONNECT_MIN_MS;
        refreshSoon();
      };
      // A network error is retried by EventSource itself, but any other answer than the stream
      // (the proxy's 502 while the app restarts, a 401 once logged out) ends its retries for
      // good: open a new one, waiting longer each time it fails again.
      stream.onerror = () => {
        if (stream.readyState !== EventSource.CLOSED) return;
        clearTimeout(reconnect);
        reconnect = setTimeout(connect, reconnectDelay);
        reconnectDelay = Math.min(reconnectDelay * 2, RECONNECT_MAX_MS);
      };
    };
    connect();

    // A screen left open over midnight: the day the rows were worked out for is over, so ask again.
    let shownDay = todayIso();
    const midnight = setInterval(() => {
      if (todayIso() === shownDay) return;
      shownDay = todayIso();
      refreshSoon();
    }, 30_000);

    const onVisible = () => document.visibilityState === "visible" && refreshSoon();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      clearTimeout(reconnect);
      clearInterval(midnight);
      source?.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
