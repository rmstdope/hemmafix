import type { ReactNode } from "react";

/**
 * A part's header: the heading with the home's name under it, and the page's controls on the right.
 *
 * The controls drop under the heading when both do not fit on one row, so none covers it. The
 * home's name takes no width of its own (w-0 min-w-full), so only the heading decides that, and it
 * wraps rather than being cut where the controls leave it little room (a 300 px phone). Top-aligned,
 * so a wrapped name never pulls the heading off the controls' line.
 */
export function PageHeader({ title, subtitle, children }: { title: string; subtitle?: string; children?: ReactNode }) {
  return (
    <header className="mb-3 flex flex-wrap items-start justify-between gap-x-2 gap-y-1">
      <div className="min-w-0 grow">
        <h1 className="text-xl font-semibold">{title}</h1>
        {subtitle ? <p className="w-0 min-w-full text-sm break-words text-muted-foreground">{subtitle}</p> : null}
      </div>
      <div className="ml-auto flex items-center gap-1">{children}</div>
    </header>
  );
}
