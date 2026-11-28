"use client";

import { CalendarDays, List, ListChecks, Star } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PARTS, litPart } from "@/lib/parts";
import { cn } from "@/lib/utils";
import { useCalendarDot } from "./calendar/access-store";
import { PageMark } from "./page-mark";
import { useRememberedPart } from "./part-links";

const ICONS = { uppgifter: ListChecks, listor: List, kalender: CalendarDays, jag: Star };

/**
 * The tabs between the parts of Hemmafix. Rendered twice by the layout (top strip on desktop,
 * bottom bar on a phone); the one that is hidden is out of the accessibility tree and Tab order.
 */
export function PartsNav({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const current = litPart(pathname, useRememberedPart());
  const needsCalendarAccess = useCalendarDot(pathname);
  // The board's filter, remembered while another part is open (the layout never remounts).
  const [boardSearch, setBoardSearch] = useState("");
  if (pathname === "/" && boardSearch !== search) setBoardSearch(search);

  return (
    <nav
      aria-label="Delar"
      className={cn(
        variant === "bottom"
          ? "fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--parts-bar-h)+env(safe-area-inset-bottom))] border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
          : "hidden gap-1 sm:flex",
      )}
    >
      {variant === "bottom" && <PageMark attributes={{ "data-parts-bar": "" }} />}
      {PARTS.map((part) => {
        const Icon = ICONS[part.key];
        const lit = part.key === current;
        const href = part.key === "uppgifter" && boardSearch ? `/?${boardSearch}` : part.href;
        // Until access is given, a red dot on Kalender asks for it from every part.
        const dot = part.key === "kalender" && needsCalendarAccess && (
          <span
            data-calendar-dot
            aria-hidden
            className={cn(
              "absolute size-2.5 rounded-full bg-rose-600",
              variant === "bottom" ? "-top-0.5 -right-1.5" : "top-0.5 right-0",
            )}
          />
        );
        return (
          <Link
            key={part.key}
            href={href}
            aria-current={lit ? "page" : undefined}
            onClick={() => {
              if (pathname === part.href) window.scrollTo({ top: 0 });
            }}
            className={cn(
              lit ? "font-semibold text-primary" : "text-muted-foreground",
              variant === "bottom"
                ? "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs"
                : cn("relative rounded-lg px-3 py-1.5 text-sm", lit ? "sky-lit bg-muted" : "on-sky-muted"),
            )}
          >
            {variant === "bottom" ? (
              <span className="relative">
                <Icon className="size-5" aria-hidden />
                {dot}
              </span>
            ) : (
              dot
            )}
            {part.label}
          </Link>
        );
      })}
    </nav>
  );
}
