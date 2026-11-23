import Link from "next/link";
import { cache, Suspense } from "react";
import { ListView } from "@/components/lists/list-view";
import { LiveUpdates } from "@/components/live-updates";
import { PageCorner } from "@/components/page-corner";
import { getHousehold } from "@/server/chores";
import { requireMember } from "@/server/dal";
import { getList } from "@/server/lists";

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
  const { member, list } = await readList((await params).id);
  if (list) {
    return (
      <>
        <LiveUpdates />
        <ListView list={list} userId={member.userId} />
      </>
    );
  }
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
