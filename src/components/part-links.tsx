"use client";

import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useSyncExternalStore } from "react";
import { PARTS, rememberedPart, type PartKey } from "@/lib/parts";

const PART_KEY = "hemmafix-part";
const noSubscribe = () => () => {};
const readPart = (): PartKey => {
  try {
    return rememberedPart(window.sessionStorage.getItem(PART_KEY));
  } catch {
    return "uppgifter";
  }
};

/** The part Gjort or Hemmet was opened from (Uppgifter by default, and on the server). */
export function useRememberedPart(): PartKey {
  return useSyncExternalStore(noSubscribe, readPart, () => "uppgifter");
}

export function rememberPart(part: PartKey) {
  try {
    window.sessionStorage.setItem(PART_KEY, part);
  } catch {
    // Without storage ← goes to Uppgifter.
  }
}

/** The ← on Gjort and Hemmet: back to the part it was opened from. */
export function BackToPart() {
  const remembered = useRememberedPart();
  const href = PARTS.find((p) => p.key === remembered)!.href;
  return (
    <Link href={href} aria-label="Tillbaka" className="-ml-3 flex size-11 items-center justify-center rounded-lg text-muted-foreground">
      <ArrowLeft className="size-5" />
    </Link>
  );
}
