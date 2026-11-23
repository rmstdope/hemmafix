import { Suspense } from "react";
import { CoinShowerProvider } from "@/components/coin-shower";
import { PartsNav } from "@/components/parts-nav";
import { TopStrip } from "@/components/top-strip";

/** The parts of Hemmafix share a top strip (desktop) and a bottom tab bar (phone). */
export default function PartsLayout({ children }: LayoutProps<"/">) {
  return (
    <CoinShowerProvider>
      <div className="flex flex-1 flex-col">
        <TopStrip />
        <div className="flex flex-1 flex-col pb-[calc(var(--parts-bar-h)+env(safe-area-inset-bottom))] sm:pb-0">{children}</div>
        <Suspense>
          <PartsNav variant="bottom" />
        </Suspense>
      </div>
    </CoinShowerProvider>
  );
}
