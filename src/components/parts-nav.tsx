"use client";

import { List, ListChecks } from "lucide-react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useState } from "react";
import { PARTS, partOf } from "@/lib/parts";
import { cn } from "@/lib/utils";

const ICONS = { uppgifter: ListChecks, listor: List };

/**
 * The tabs between the parts of Hemmafix. Rendered twice by the layout (top strip on desktop,
 * bottom bar on a phone); the one that is hidden is out of the accessibility tree and Tab order.
 */
export function PartsNav({ variant }: { variant: "top" | "bottom" }) {
  const pathname = usePathname();
  const search = useSearchParams().toString();
  const current = partOf(pathname);
  // The board's filter, remembered while another part is open (the layout never remounts).
  const [boardSearch, setBoardSearch] = useState("");
  if (pathname === "/" && boardSearch !== search) setBoardSearch(search);

  return (
    <nav
      aria-label="Delar"
      data-parts-bar={variant === "bottom" ? "" : undefined}
      className={cn(
        variant === "bottom"
          ? "fixed inset-x-0 bottom-0 z-40 flex h-[calc(var(--parts-bar-h)+env(safe-area-inset-bottom))] border-t bg-background pb-[env(safe-area-inset-bottom)] sm:hidden"
          : "hidden gap-1 sm:flex",
      )}
    >
      {PARTS.map((part) => {
        const Icon = ICONS[part.key];
        const lit = part.key === current;
        const href = part.key === "uppgifter" && boardSearch ? `/?${boardSearch}` : part.href;
        return (
          <Link
            key={part.key}
            href={href}
            aria-current={lit ? "page" : undefined}
            onClick={() => {
              if (pathname === part.href) window.scrollTo({ top: 0 });
            }}
            className={cn(
              lit ? "font-semibold text-foreground" : "text-muted-foreground",
              variant === "bottom"
                ? "flex flex-1 flex-col items-center justify-center gap-0.5 text-xs"
                : cn("rounded-lg px-3 py-1.5 text-sm", lit && "bg-muted"),
            )}
          >
            {variant === "bottom" && <Icon className="size-5" aria-hidden />}
            {part.label}
          </Link>
        );
      })}
    </nav>
  );
}
