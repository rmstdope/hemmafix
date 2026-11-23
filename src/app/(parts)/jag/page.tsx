import { Suspense } from "react";
import { LevelCard } from "@/components/jag/level-card";
import { JagParts } from "@/components/jag/jag-parts";
import { LiveUpdates } from "@/components/live-updates";
import { PageCorner } from "@/components/page-corner";
import { getHousehold, getLifetimeCoins } from "@/server/chores";
import { requireMember } from "@/server/dal";

export const metadata = { title: "Jag – Hemmafix" };

export default function JagPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-4 pb-4">
      <Suspense fallback={<Skeleton />}>
        <Jag />
      </Suspense>
    </main>
  );
}

async function Jag() {
  const member = await requireMember();
  const [home, lifetimeCoins] = await Promise.all([getHousehold(member.householdId), getLifetimeCoins(member)]);
  return (
    <>
      <LiveUpdates />
      <header className="mb-3 flex items-center justify-between gap-2">
        <div className="min-w-0 [&>p]:truncate">
          <h1 className="text-xl font-semibold">Jag</h1>
          {home?.name ? <p className="text-sm text-muted-foreground">{home.name}</p> : null}
        </div>
        <div className="sm:hidden">
          <PageCorner />
        </div>
      </header>
      <JagParts framsteg={<LevelCard name={member.name} image={member.image} lifetimeCoins={lifetimeCoins} />} />
    </>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Laddar">
      <div className="h-12 rounded-xl bg-muted" />
      <div className="h-12 rounded-xl bg-muted" />
    </div>
  );
}
