"use client";

import { ArrowLeft, History, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSyncExternalStore } from "react";
import { partOf } from "@/lib/parts";

const linkClass = "flex size-11 items-center justify-center rounded-lg text-muted-foreground";

/** Gjort belongs to the tasks, so its icon shows on the board only. */
export function GjortLink() {
  if (usePathname() !== "/") return null;
  return (
    <Link href="/gjort" aria-label="Gjort" className={linkClass}>
      <History className="size-5" />
    </Link>
  );
}

const PART_KEY = "hemmafix-part";
const noSubscribe = () => () => {};
const readPart = () => {
  try {
    return window.sessionStorage.getItem(PART_KEY) === "listor" ? "/listor" : "/";
  } catch {
    return "/";
  }
};

/** Hemmet remembers the part it was opened from, so that ← goes back there. */
export function HemmetLink() {
  const part = partOf(usePathname());
  return (
    <Link
      href="/hemmet"
      aria-label="Hemmet"
      className={linkClass}
      onClick={() => {
        try {
          window.sessionStorage.setItem(PART_KEY, part ?? "uppgifter");
        } catch {
          // Without storage ← goes to Uppgifter.
        }
      }}
    >
      <Settings className="size-5" />
    </Link>
  );
}

/** The ← on Hemmet: back to the part it was opened from (Uppgifter by default). */
export function BackToPart() {
  const href = useSyncExternalStore(noSubscribe, readPart, () => "/");
  return (
    <Link href={href} aria-label="Tillbaka" className="-ml-3 flex size-11 items-center justify-center rounded-lg text-muted-foreground">
      <ArrowLeft className="size-5" />
    </Link>
  );
}
