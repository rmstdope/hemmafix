import { CoinShowerProvider } from "@/components/coin-shower";
import { TopStrip } from "@/components/top-strip";

/** Hemmet and a routine's page: the top strip on a desktop; a phone keeps the pages' own ← header. */
export default function HemmetLayout({ children }: LayoutProps<"/hemmet">) {
  return (
    <CoinShowerProvider>
      <div className="flex flex-1 flex-col">
        <TopStrip />
        {children}
      </div>
    </CoinShowerProvider>
  );
}
