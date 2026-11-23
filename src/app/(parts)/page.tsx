import { Suspense, type ReactNode } from "react";
import { AddChoreSheet } from "@/components/add-chore-sheet";
import { BoardTabs } from "@/components/board-tabs";
import { FilterChips, FilterHeader } from "@/components/board-filters";
import { ChoreItem } from "@/components/chore-item";
import { GoldRows } from "@/components/gold-rows";
import { HighFiveNotes } from "@/components/high-five-notes";
import { LiveUpdates } from "@/components/live-updates";
import { PageCorner } from "@/components/page-corner";
import { boardTabs, parseTab, splitByTab, type TabKey } from "@/lib/board-tabs";
import { todayIso } from "@/lib/dates";
import { can } from "@/lib/permissions";
import { boardFilter } from "@/lib/validation";
import { requireMember } from "@/server/dal";
import { canUndo, getHousehold, listMembers, listOpenInstances, listRecentlyCompleted } from "@/server/chores";
import { listFloors, listRooms } from "@/server/household";
import { listHighFiveNotes, listHighFives } from "@/server/high-fives";
import { listGoldRows } from "@/server/rewards";
import { listRoutinesWithTasks } from "@/server/routines";

export const metadata = { title: "Uppgifter – Hemmafix" };

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto w-full max-w-2xl flex flex-1 flex-col px-4 pt-4 pb-4">
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
  const requested = boardFilter.parse({ roomId: first(params.rum), floorId: first(params.plan), who: first(params.vem) });
  const today = todayIso();
  const isAdult = can(member.role, "task:create");

  const [home, members, floors, rooms, completed, routines, notes, goldRows] = await Promise.all([
    getHousehold(member.householdId),
    listMembers(member.householdId),
    listFloors(member.householdId),
    listRooms(member.householdId),
    listRecentlyCompleted(member),
    isAdult ? listRoutinesWithTasks(member) : [],
    listHighFiveNotes(member),
    listGoldRows(member),
  ]);
  const highFives = await listHighFives(
    member,
    completed.map((t) => t.id),
  );
  // A room or floor that has since been removed (or is not this home's) means no filter.
  const filter = {
    ...requested,
    roomId: rooms.some((r) => r.id === requested.roomId) ? requested.roomId : undefined,
    floorId: floors.some((f) => f.id === requested.floorId) ? requested.floorId : undefined,
  };
  const open = await listOpenInstances(member, filter);
  const filtered = Boolean(filter.roomId || filter.floorId || filter.who);
  const showFloors = floors.length > 1;
  const split = splitByTab(open, today);
  const tabs = boardTabs(
    today,
    { nu: split.nu.length, d1: split.d1.length, d2: split.d2.length, d3: split.d3.length, senare: split.senare.length },
    split.nu.some((t) => t.dueDate !== null && t.dueDate < today),
  );
  const filterProps = {
    floors,
    rooms,
    members,
    currentUserId: member.userId,
    roomId: filter.roomId,
    floorId: filter.floorId,
    who: filter.who,
  };

  const emptyText = (key: TabKey) =>
    filtered
      ? "Inga uppgifter här."
      : key === "nu"
        ? "Inget att göra just nu 🎉"
        : key === "senare"
          ? "Inget planerat längre fram."
          : "Inget att göra den här dagen.";
  const list = (key: TabKey, items: typeof open, showDue: (dueDate: string | null) => boolean): ReactNode =>
    items.length === 0 ? (
      <p className="rounded-xl border border-dashed p-6 text-center text-muted-foreground">{emptyText(key)}</p>
    ) : (
      <ul className="space-y-2" aria-label={tabs.find((t) => t.key === key)?.ariaLabel}>
        {items.map((t) => (
          <ChoreItem
            key={t.id}
            instance={t}
            members={members}
            currentUserId={member.userId}
            today={today}
            canManage={isAdult}
            canUndo={false}
            showDue={showDue(t.dueDate)}
            showFloors={showFloors}
            floors={floors}
            rooms={rooms}
          />
        ))}
      </ul>
    );

  const panels: Record<TabKey, ReactNode> = {
    nu: (
      <>
        <GoldRows rows={goldRows} now={new Date().toISOString()} />
        {list("nu", split.nu, (d) => d !== null && d < today)}
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
                  highFive={{
                    canGive: can(member.role, "history:view-anyone"),
                    givenByMe: highFives.get(t.id)?.givenByMe ?? false,
                    names: highFives.get(t.id)?.names ?? [],
                  }}
                  showDue
                  showFloors={showFloors}
                  floors={floors}
                  rooms={rooms}
                />
              ))}
            </ul>
          </details>
        )}
      </>
    ),
    imorgon: list("imorgon", split.d1, () => false),
    d2: list("d2", split.d2, () => false),
    d3: list("d3", split.d3, () => false),
    senare: list("senare", split.senare, () => true),
  };

  return (
    <>
      <LiveUpdates />
      <FilterHeader {...filterProps} title="Uppgifter" subtitle={home?.name}>
        <div className="sm:hidden">
          <PageCorner />
        </div>
      </FilterHeader>
      <HighFiveNotes notes={notes} />
      <BoardTabs tabs={tabs} initial={parseTab(first(params.flik))} panels={panels} underTabs={<FilterChips {...filterProps} />} />
      {isAdult && (
        <AddChoreSheet floors={floors} rooms={rooms} routines={routines} members={members} currentUserId={member.userId} today={today} />
      )}
    </>
  );
}

function BoardSkeleton() {
  return (
    <div className="animate-pulse space-y-3" aria-busy="true" aria-label="Laddar">
      <div className="h-12 rounded-xl bg-muted" />
      <div className="h-12 border-b" />
      <div className="h-14 rounded-xl bg-muted" />
      <div className="h-14 rounded-xl bg-muted" />
    </div>
  );
}
