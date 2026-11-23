import { Suspense } from "react";
import { PageCorner } from "./page-corner";
import { PartsNav } from "./parts-nav";

/** The strip across the top on a desktop: the name, the tabs, the coin total and the picture. */
export function TopStrip() {
  return (
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
  );
}
