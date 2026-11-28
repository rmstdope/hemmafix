import Link from "next/link";
import { cache, Suspense } from "react";
import { ListView } from "@/components/lists/list-view";
import { LostAccess } from "@/components/lists/lost-access";
import { LiveUpdates } from "@/components/live-updates";
import { PageCorner } from "@/components/page-corner";
import { PageHeader } from "@/components/page-header";
import { shareChoices } from "@/lib/lists";
import { getHousehold } from "@/server/chores";
import { requireMember } from "@/server/dal";
import { listMembersWithRoles } from "@/server/household";
import { getList, lostListName } from "@/server/lists";

type Props = { params: Promise<{ id: string }> };

/** The list for this request, read once for both the page and its title. */
const readList = cache(async (id: string) => {
  const member = await requireMember();
  return { member, list: await getList(member, id) };
});

export async function generateMetadata({ params }: Props) {
  const { list } = await readList((await params).id);
  return { title: `${list?.name ?? "Listor"} – Hemmafix` };
}

export default function ListPage({ params }: Props) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-4">
      <Suspense fallback={<Skeleton />}>
        <Content params={params} />
      </Suspense>
    </main>
  );
}

async function Content({ params }: Props) {
  const { id } = await params;
  const { member, list } = await readList(id);
  if (list) {
    const members = await listMembersWithRoles(member.householdId);
    return (
      <>
        <LiveUpdates />
        <ListView list={list} userId={member.userId} choices={shareChoices(members, member.userId)} />
      </>
    );
  }
  const lost = await lostListName(member, id);
  if (lost !== null) return <LostAccess id={id} name={lost} />;
  const home = await getHousehold(member.householdId);
  return (
    <>
      <LiveUpdates />
      <PageHeader title="Listor" subtitle={home?.name}>
        <div className="sm:hidden">
          <PageCorner />
        </div>
      </PageHeader>
      <div className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
        <p>Listan finns inte längre.</p>
        <Link href="/listor" className="mt-3 inline-block min-h-11 py-2.5 font-medium text-foreground underline">
          Till Listor
        </Link>
      </div>
    </>
  );
}

function Skeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Laddar">
      <div className="h-11 rounded-xl bg-muted" />
      <div className="h-11 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
    </div>
  );
}
