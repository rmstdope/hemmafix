import { Settings } from "lucide-react";
import Link from "next/link";
import { Suspense } from "react";
import { AddChoreForm } from "@/components/add-chore-form";
import { BoardFilters } from "@/components/board-filters";
import { ChoreItem } from "@/components/chore-item";
import { LiveUpdates } from "@/components/live-updates";
import { UserMenu } from "@/components/user-menu";
import { todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { boardFilter } from "@/lib/validation";
import { requireMember } from "@/server/dal";
import { canUndo, getHousehold, listMembers, listOpenInstances, listRecentlyCompleted } from "@/server/chores";
import { listRooms } from "@/server/household";

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex-1 px-4 pt-4 pb-[max(1rem,env(safe-area-inset-bottom))]">
      <Suspense fallback={<BoardSkeleton />}>
        <Board searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const first = (v: string | string[] | undefined) => (Array.isArray(v) ? v[0] : v);

async function Board({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  const member = await requireMember();
  const params = await searchParams;
  const filter = boardFilter.parse({ roomId: first(params.rum), who: first(params.vem) });
  const today = todayIso();
  const isAdult = can(member.role, "task:create");

  const [home, members, rooms, open, completed] = await Promise.all([
    getHousehold(member.householdId),
    listMembers(member.householdId),
    listRooms(member.householdId),
    listOpenInstances(member, filter),
    listRecentlyCompleted(member),
  ]);
  const filtered = Boolean(filter.roomId || filter.who);

  return (
    <>
      <LiveUpdates />
      <header className="mb-4 flex items-center justify-between gap-2">
        <div>
          <h1 className="text-xl font-semibold">Hemmafix</h1>
          <p className="text-sm text-muted-foreground">{home?.name}</p>
        </div>
        <div className="flex items-center gap-1">
          {isAdult && (
            <Link
              href="/hemmet"
              aria-label="Hemmet"
              className="flex size-11 items-center justify-center rounded-lg text-muted-foreground"
            >
              <Settings className="size-5" />
            </Link>
          )}
          <UserMenu name={member.name} image={member.image} />
        </div>
      </header>

      {isAdult && <AddChoreForm rooms={rooms} members={members} currentUserId={member.userId} today={today} />}

      <BoardFilters
        rooms={rooms}
        members={members}
        currentUserId={member.userId}
        roomId={filter.roomId}
        who={filter.who}
      />

      {open.length === 0 ? (
        <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">
          {filtered ? "Inga uppgifter här." : "Inget att göra just nu 🎉"}
        </p>
      ) : (
        <ul className="space-y-2" aria-label="Att göra">
          {open.map((t) => (
            <ChoreItem
              key={t.id}
              instance={t}
              members={members}
              currentUserId={member.userId}
              today={today}
              canManage={isAdult}
              canUndo={false}
            />
          ))}
        </ul>
      )}

      {completed.length > 0 && (
        <details className="mt-8">
          <summary className="cursor-pointer py-2 text-sm text-muted-foreground">
            Klart senaste veckan ({completed.length})
          </summary>
          <ul className="mt-2 space-y-2" aria-label="Klart">
            {completed.map((t) => (
              <ChoreItem
                key={t.id}
                instance={t}
                members={members}
                currentUserId={member.userId}
                today={today}
                canManage={false}
                canUndo={canUndo(member, t)}
              />
            ))}
          </ul>
        </details>
      )}
    </>
  );
}

function BoardSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Laddar">
      <div className="h-12 rounded-xl bg-muted" />
      <div className="h-11 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
    </div>
  );
}
