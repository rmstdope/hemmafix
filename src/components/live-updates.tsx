"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

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

/** Refreshes the page data when another family member changes a task. */
export function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(async () => {
        // When it does not answer, the event stream reconnects once it does, and catches up then.
        if (await serverAnswers()) router.refresh();
      }, 150);
    };

    const source = new EventSource("/api/events");
    source.onmessage = refreshSoon;
    // After a dropped connection (phone asleep, network switch, a deploy) catch up.
    source.onopen = refreshSoon;

    const onVisible = () => document.visibilityState === "visible" && refreshSoon();
    document.addEventListener("visibilitychange", onVisible);

    return () => {
      clearTimeout(timer);
      source.close();
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [router]);

  return null;
}
