"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Refreshes the page data when another family member changes a task. */
export function LiveUpdates() {
  const router = useRouter();

  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined;
    const refreshSoon = () => {
      clearTimeout(timer);
      timer = setTimeout(() => router.refresh(), 150);
    };

    const source = new EventSource("/api/events");
    source.onmessage = refreshSoon;
    // After a dropped connection (phone asleep, network switch) catch up.
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
