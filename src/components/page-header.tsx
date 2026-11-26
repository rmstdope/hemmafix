import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

/**
 * A part's header: the heading with the home's name under it, and the page's controls on the right.
 *
 * The controls drop to a row of their own when both do not fit on one row, so none covers the
 * heading. The home's name takes no width of its own (w-0 min-w-full), so only the heading decides
 * that, and a dropped row comes under the name. On a phone with the controls beside the heading,
 * the name runs under them at the header's full width. Which case it is depends on how wide the
 * controls are, so CSS reads it from the heading's column: narrower than the header means the
 * controls share its row, and only then has the spacer a height, 16 px, which puts the name under
 * them. From 640 px the name stays in the heading's column, beside the controls.
 *
 * `lowered` sets the controls 2 px down, taking the 2 px from the gap to a dropped row.
 */
export function PageHeader({
  title,
  subtitle,
  lowered = false,
  children,
}: {
  title: string;
  subtitle?: string;
  lowered?: boolean;
  children?: ReactNode;
}) {
  return (
    <header className="@container mb-3">
      <div className={cn("flex flex-wrap items-start justify-between gap-x-2 [--header-w:100cqw]", lowered ? "gap-y-0.5" : "gap-y-1")}>
        <div className="min-w-0 grow">
          <h1 className="on-sky text-xl font-semibold">{title}</h1>
          {subtitle ? (
            <>
              <div className="@container sm:hidden">
                <div className="h-[clamp(0px,calc((var(--header-w)-100cqw)*999),16px)]" />
              </div>
              <p className="on-sky-muted w-0 min-w-full text-sm text-muted-foreground">
                <span className="block w-(--header-w) wrap-break-word sm:w-auto">{subtitle}</span>
              </p>
            </>
          ) : null}
        </div>
        <div className={cn("ml-auto flex items-center gap-1", lowered && "mt-0.5")}>{children}</div>
      </div>
    </header>
  );
}
