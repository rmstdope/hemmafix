"use client";

import { History, Settings } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
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

/** Hemmet remembers the part it was opened from, so that ← goes back there. */
export function HemmetLink() {
  const part = partOf(usePathname());
  return (
    <Link href={part === "listor" ? "/hemmet?fran=listor" : "/hemmet"} aria-label="Hemmet" className={linkClass}>
      <Settings className="size-5" />
    </Link>
  );
}
