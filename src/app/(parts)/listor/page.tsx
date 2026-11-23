import { Suspense } from "react";
import { LiveUpdates } from "@/components/live-updates";
import { PageCorner } from "@/components/page-corner";
import { getHousehold } from "@/server/chores";
import { requireMember } from "@/server/dal";

export const metadata = { title: "Listor – Hemmafix" };

export default function ListorPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-4">
      <Suspense fallback={<div className="h-40 animate-pulse rounded-xl bg-muted" aria-busy="true" />}>
        <Listor />
      </Suspense>
    </main>
  );
}

async function Listor() {
  const member = await requireMember();
  const home = await getHousehold(member.householdId);
  return (
    <>
      <LiveUpdates />
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Listor</h1>
          <p className="text-sm text-muted-foreground">{home?.name}</p>
        </div>
        <div className="sm:hidden">
          <PageCorner />
        </div>
      </header>
      <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
        <p>Här kommer familjens listor – inköp, packning och annat ni vill bocka av tillsammans.</p>
        <p className="mt-3">Snart på plats.</p>
      </div>
    </>
  );
}
