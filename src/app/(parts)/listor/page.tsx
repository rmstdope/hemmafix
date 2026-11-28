import { Suspense } from "react";
import { ListsOverview } from "@/components/lists/lists-overview";
import { LiveUpdates } from "@/components/live-updates";
import { PageCorner } from "@/components/page-corner";
import { getHousehold } from "@/server/chores";
import { shareChoices } from "@/lib/lists";
import { requireMember } from "@/server/dal";
import { listMembersWithRoles } from "@/server/household";
import { getListOrder, listLists } from "@/server/lists";

export const metadata = { title: "Listor – Hemmafix" };

export default function ListorPage() {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col px-4 pt-4 pb-4">
      <Suspense fallback={<Skeleton />}>
        <Listor />
      </Suspense>
    </main>
  );
}

async function Listor() {
  const member = await requireMember();
  const [home, lists, order, members] = await Promise.all([
    getHousehold(member.householdId),
    listLists(member),
    getListOrder(member),
    listMembersWithRoles(member.householdId),
  ]);
  return (
    <>
      <LiveUpdates />
      <ListsOverview
        lists={lists}
        order={order}
        choices={shareChoices(members, member.userId)}
        subtitle={home?.name}
      >
        <div className="sm:hidden">
          <PageCorner />
        </div>
      </ListsOverview>
    </>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Laddar">
      <div className="h-14 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
    </div>
  );
}
