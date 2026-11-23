import { Suspense } from "react";
import { PageCorner } from "@/components/page-corner";
import { PartsNav } from "@/components/parts-nav";

/** The parts of Hemmafix share a top strip (desktop) and a bottom tab bar (phone). */
export default function PartsLayout({ children }: LayoutProps<"/">) {
  return (
    <div className="flex flex-1 flex-col [--parts-bar-h:4rem]">
      <div className="mx-auto hidden w-full max-w-2xl items-center gap-6 border-b px-4 py-2 sm:flex">
        <span className="text-lg font-semibold">Hemmafix</span>
        <Suspense>
          <PartsNav variant="top" />
        </Suspense>
        <div className="ml-auto">
          <Suspense>
            <PageCorner />
          </Suspense>
        </div>
      </div>
      <div className="flex flex-1 flex-col pb-[calc(var(--parts-bar-h)+env(safe-area-inset-bottom))] sm:pb-0">{children}</div>
      <Suspense>
        <PartsNav variant="bottom" />
      </Suspense>
    </div>
  );
}
