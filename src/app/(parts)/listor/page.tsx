import { Suspense } from "react";
import { ListsOverview } from "@/components/lists/lists-overview";
import { LiveUpdates } from "@/components/live-updates";
import { PageCorner } from "@/components/page-corner";
import { getHousehold } from "@/server/chores";
import { requireMember } from "@/server/dal";
import { getListOrder, listLists } from "@/server/lists";

export const metadata = { title: "Listor – Hemmafix" };

export default function ListorPage() {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-4">
      <Suspense fallback={<Skeleton />}>
        <Listor />
      </Suspense>
    </main>
  );
}

async function Listor() {
  const member = await requireMember();
  const [home, lists, order] = await Promise.all([
    getHousehold(member.householdId),
    listLists(member),
    getListOrder(member),
  ]);
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
      <ListsOverview lists={lists} order={order} />
    </>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Laddar">
      <div className="h-12 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
    </div>
  );
}
